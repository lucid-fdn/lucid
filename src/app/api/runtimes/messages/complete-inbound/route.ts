import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import {
  completeInboundForRuntime,
  RelayDataAccessError,
  RelayNotFoundError,
  RelayOwnershipError,
} from '@/lib/db/mission-control'
import { completeInboundSchema } from '@/lib/mission-control/schemas'
import { completeForRuntime, isPulseAvailable } from '@/lib/pulse'
import { PulseKeys } from '@contracts/pulse'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function parsePulseAttempt(runId: string): number {
  const match = /:(\d+)$/.exec(runId)
  return match ? Number(match[1]) : 0
}

// POST /api/runtimes/messages/complete-inbound — Complete inbound + synchronous delivery
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (runtime.dedicatedTransportMode === 'native_pulse') {
      return NextResponse.json(
        { error: 'This runtime uses native Pulse and cannot complete work through relay APIs' },
        { status: 409 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = completeInboundSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Complete in DB (messages, delivery, billing)
    const result = await ErrorService.startSpan(
      'pulse.complete_proxy.db',
      'db.complete',
      () => completeInboundForRuntime(runtime.id, runtime.orgId, parsed.data),
    )

    if (result.alreadyApplied) {
      return NextResponse.json({
        status: 'already_applied',
        eventId: parsed.data.eventId,
      })
    }

    // Release Pulse resources (best-effort, non-blocking)
    if (isPulseAvailable()) {
      ErrorService.startSpan(
        'pulse.complete_proxy.release',
        'queue.release',
        () => releasePulseResources(parsed.data.eventId, runtime.id, parsed.data.runId),
      ).catch((err) => {
        console.warn('[complete-inbound] Failed to release Pulse resources:', err)
      })
    }

    return NextResponse.json({
      status: 'ok',
      delivered: result.delivered,
      externalMessageId: result.externalMessageId,
      deliveryError: result.deliveryError,
    })
  } catch (error) {
    // Typed error handling — no string matching
    if (error instanceof RelayNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof RelayOwnershipError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof RelayDataAccessError) {
      ErrorService.captureException(error.cause ?? error, {
        severity: 'error',
        context: {
          endpoint: '/api/runtimes/messages/complete-inbound',
          error: error.message,
        },
        tags: { layer: 'api', route: 'runtimes', error_type: 'relay_data_access' },
      })
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/messages/complete-inbound' },
      tags: { layer: 'api', route: 'runtimes' },
    })

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Release Pulse lease + active set + inflight counter.
 * Looks up the lease to find the Pulse job metadata, then completes it.
 */
async function releasePulseResources(eventId: string, runtimeId: string, requestRunId?: string): Promise<void> {
  const redis = await getPulseRedis()
  if (!redis) return

  // Use runId from request (supports retries with attempt > 0), fallback to :0
  const runId = requestRunId || `${eventId}:0`
  const attempt = parsePulseAttempt(runId)
  const leaseKey = PulseKeys.lease(runId)
  const leaseVal = await redis.get(leaseKey) as string | null

  if (!leaseVal) return // No Pulse lease — event was claimed via DB path

  let leaseInfo: { workerId?: string; agentId?: string }
  try {
    leaseInfo = JSON.parse(leaseVal)
  } catch {
    return
  }

  // Use workerId from lease (handles both relay-{id} and native-{id})
  const workerId = leaseInfo.workerId || `relay-${runtimeId}`

  await completeForRuntime(
    {
      runId,
      eventId,
      eventType: 'inbound',
      agentId: leaseInfo.agentId || '',
      orgId: '',
      priority: 'normal',
      attempt,
      enqueuedAt: 0,
    },
    workerId,
  )
}
