import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { renewLeaseSchema } from '@/lib/mission-control/schemas'
import { supabase } from '@/lib/db/client'
import { isPulseAvailable } from '@/lib/pulse'
import { PulseKeys, RENEW_LEASE_LUA, LEASE_TTL_SECONDS } from '@contracts/pulse'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// POST /api/runtimes/messages/renew-lease — Extend lease on a claimed inbound event
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (runtime.dedicatedTransportMode === 'native_pulse') {
      return NextResponse.json(
        { error: 'This runtime uses native Pulse and cannot renew relay leases through relay APIs' },
        { status: 409 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = renewLeaseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { eventId, runId } = parsed.data

    // Verify the event belongs to this runtime's org and is claimed
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
      return NextResponse.json({ error: 'Event not in active state' }, { status: 409 })
    }

    // Touch updated_at to extend the claim window (orphan detector uses updated_at to detect stuck events)
    await supabase
      .from('assistant_inbound_events')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .in('status', ['claimed', 'processing'])

    // Also renew Pulse Redis lease (best-effort)
    if (isPulseAvailable()) {
      renewPulseLease(eventId, runtime.id, runId).catch((err) => {
        console.warn('[renew-lease] Failed to renew Pulse lease:', err)
      })
    }

    return NextResponse.json({ status: 'renewed', eventId, runId })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/messages/renew-lease' },
      tags: { layer: 'api', route: 'runtimes' },
    })

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/** Renew Pulse Redis lease for a runtime-held event */
async function renewPulseLease(eventId: string, runtimeId: string, requestRunId?: string): Promise<void> {
  const redis = await getPulseRedis()
  if (!redis) return

  // Use runId from request (supports retries with attempt > 0), fallback to :0
  const runId = requestRunId || `${eventId}:0`
  const leaseKey = PulseKeys.lease(runId)

  // Read lease to get actual workerId (handles relay- and native- prefixes)
  const leaseVal = await redis.get(leaseKey) as string | null
  if (!leaseVal) return

  let workerId: string
  try {
    const info = JSON.parse(leaseVal) as { workerId?: string }
    workerId = info.workerId || `relay-${runtimeId}`
  } catch {
    workerId = `relay-${runtimeId}`
  }

  const result = await redis.eval(RENEW_LEASE_LUA, [leaseKey], [workerId, String(LEASE_TTL_SECONDS)]) as number
  if (result === 0) {
    console.warn(`[renew-lease] Stale lease for ${runId} — owned by different worker`)
  }
}
