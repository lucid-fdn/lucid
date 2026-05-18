import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { failInboundSchema } from '@/lib/mission-control/schemas'
import { supabase } from '@/lib/db/client'
import { failForRuntime, isPulseAvailable } from '@/lib/pulse'
import { PulseKeys } from '@contracts/pulse'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

function parsePulseAttempt(runId: string): number {
  const match = /:(\d+)$/.exec(runId)
  return match ? Number(match[1]) : 0
}

// POST /api/runtimes/messages/fail-inbound — Explicitly fail/nack an inbound event
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (runtime.dedicatedTransportMode === 'native_pulse') {
      return NextResponse.json(
        { error: 'This runtime uses native Pulse and cannot fail work through relay APIs' },
        { status: 409 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = failInboundSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { eventId, runId, errorMessage } = parsed.data

    // Verify the event belongs to this runtime's org
    const { data: event, error } = await supabase
      .from('assistant_inbound_events')
      .select('id, status, assistant_id')
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Verify org ownership via assistant
    const { data: assistant } = await supabase
      .from('ai_assistants')
      .select('org_id')
      .eq('id', event.assistant_id)
      .single()

    if (!assistant || assistant.org_id !== runtime.orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (event.status !== 'claimed' && event.status !== 'processing') {
      return NextResponse.json({
        status: 'already_applied',
        eventId,
      })
    }

    // Reset event to failed status so it can be retried or dead-lettered
    const { error: updateError } = await supabase
      .from('assistant_inbound_events')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .in('status', ['claimed', 'processing'])

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }

    // Release Pulse resources (best-effort)
    if (isPulseAvailable()) {
      releasePulseOnFail(eventId, runtime.id, runId).catch((err) => {
        console.warn('[fail-inbound] Failed to release Pulse resources:', err)
      })
    }

    return NextResponse.json({ status: 'failed', eventId, runId })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/messages/fail-inbound' },
      tags: { layer: 'api', route: 'runtimes' },
    })

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** Release Pulse lease + active set + inflight counter on fail */
async function releasePulseOnFail(eventId: string, runtimeId: string, requestRunId?: string): Promise<void> {
  const redis = await getPulseRedis()
  if (!redis) return

  // Use runId from request (supports retries with attempt > 0), fallback to :0
  const runId = requestRunId || `${eventId}:0`
  const attempt = parsePulseAttempt(runId)
  const leaseKey = PulseKeys.lease(runId)
  const leaseVal = await redis.get(leaseKey) as string | null

  if (!leaseVal) return

  let leaseInfo: { workerId?: string; agentId?: string }
  try {
    leaseInfo = JSON.parse(leaseVal)
  } catch {
    return
  }

  // Use workerId from lease (handles both relay-{id} and native-{id})
  const workerId = leaseInfo.workerId || `relay-${runtimeId}`

  await failForRuntime(
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
