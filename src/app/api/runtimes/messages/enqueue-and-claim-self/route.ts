import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../_auth'
import { enqueueAndClaimSelfSchema } from '@/lib/mission-control/schemas'
import { enqueueAndClaimSelf, isPulseAvailable } from '@/lib/pulse'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/runtimes/messages/enqueue-and-claim-self
 *
 * C2a self-sovereign runtimes call this to enter the Pulse state machine.
 * The runtime receives messages in-process (via native channel adapters)
 * and wants Pulse observability, governance, and concurrency control.
 *
 * Flow:
 * 1. Runtime receives message via native adapter (Discord WS, Telegram poll)
 * 2. Runtime inserts inbound event to control plane (ControlPlaneBridge)
 * 3. Runtime calls this endpoint → Pulse enqueue + immediate self-claim
 * 4. Runtime processes locally
 * 5. Runtime calls complete-inbound → Pulse release
 *
 * Requires Pulse Redis to be available. Returns 503 if not.
 */
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isPulseAvailable()) {
      return NextResponse.json(
        { error: 'Pulse not available', message: 'Redis not configured on control plane' },
        { status: 503 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = enqueueAndClaimSelfSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Verify org ownership
    if (parsed.data.orgId !== runtime.orgId) {
      return NextResponse.json({ error: 'Forbidden: org mismatch' }, { status: 403 })
    }

    // Verify event exists and agent belongs to org
    const { data: event } = await supabase
      .from('assistant_inbound_events')
      .select('id, assistant_id')
      .eq('id', parsed.data.eventId)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: assistant } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .eq('id', parsed.data.agentId)
      .single()

    if (!assistant || assistant.org_id !== runtime.orgId) {
      return NextResponse.json({ error: 'Forbidden: agent not in org' }, { status: 403 })
    }

    const result = await enqueueAndClaimSelf({
      ...parsed.data,
      runtimeId: runtime.id,
    })

    if (!result) {
      // Over per-agent concurrency limit or duplicate
      return NextResponse.json({
        status: 'rejected',
        reason: 'Per-agent concurrency limit reached or duplicate claim',
      }, { status: 429 })
    }

    return NextResponse.json({
      status: 'claimed',
      runId: result.job.runId,
      leaseToken: result.leaseToken,
      leaseTtlSeconds: 60,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/messages/enqueue-and-claim-self' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
