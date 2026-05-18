import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRuntime } from '../../../runtimes/_auth'
import { enqueueStepSchema } from '@/lib/mission-control/schemas'
import { supabase } from '@/lib/db/client'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { PulseKeys } from '@contracts/pulse'
import type { PulseJob, PulsePriority } from '@contracts/pulse'
import { ErrorService } from '@/lib/errors/error-service'
import { insertOrchestrationStep } from '@contracts/dag-step'
import { CONTROL_PLANE_STREAM_MAXLEN } from '@/lib/pulse/constants'

export const dynamic = 'force-dynamic'

/**
 * POST /api/runtimes/steps/enqueue — Enqueue a step job from a dedicated runtime.
 *
 * Auth: authenticateRuntime() — same as other runtime endpoints.
 * Org match verification: agent must belong to runtime's org.
 */
export async function POST(request: NextRequest) {
  try {
    const runtime = await authenticateRuntime(request.headers.get('authorization'))
    if (!runtime) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = enqueueStepSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { eventId, eventType, agentId, orgId, stepType, priority, webhookUrl, webhookPayload, approvalConfig } = parsed.data

    // Verify agent belongs to runtime's org
    const { data: agent, error: agentError } = await supabase
      .from('ai_assistants')
      .select('id, org_id')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.org_id !== runtime.orgId) {
      return NextResponse.json({ error: 'Agent does not belong to runtime org' }, { status: 403 })
    }

    if (orgId !== runtime.orgId) {
      return NextResponse.json({ error: 'orgId mismatch' }, { status: 403 })
    }

    // Create step record via the shared contract authority. This is the
    // single owner of the orchestration_steps insert path — the worker
    // embedded executor (DagStepCreator) delegates to a byte-equivalent
    // mirror of `insertOrchestrationStep`. Idempotent: a duplicate
    // (eventId, attempt, stepType) returns the existing stepId instead of
    // 500ing, so dedicated runtimes can safely retry the enqueue POST.
    let stepId: string
    try {
      const result = await insertOrchestrationStep(supabase, {
        eventId,
        attempt: 0,
        stepType,
        executorType: stepType === 'webhook' ? 'webhook' : 'approval',
        agentId,
        orgId,
        runId: `${eventId}:0`,
        initialStatus: 'pending',
        webhookUrl,
      })
      stepId = result.stepId
    } catch (err) {
      ErrorService.captureException(err instanceof Error ? err : new Error('Failed to create step'))
      return NextResponse.json({ error: 'Failed to create step' }, { status: 500 })
    }

    // Enqueue to Pulse Redis
    const redis = await getPulseRedis()
    if (!redis) {
      return NextResponse.json({ error: 'Pulse not available' }, { status: 503 })
    }

    const runId = `${eventId}:0`
    const pulsePriority: PulsePriority = (priority as PulsePriority) ?? 'normal'
    const job: PulseJob = {
      runId,
      eventId,
      eventType,
      agentId,
      orgId,
      priority: pulsePriority,
      attempt: 0,
      enqueuedAt: 0,
      stepType,
      stepId: stepId,
      webhookUrl,
      webhookPayload: webhookPayload ? JSON.stringify(webhookPayload) : undefined,
      approvalConfig,
    }

    const dedupResult = await redis.set(PulseKeys.dedup(eventId, 0), '1', { nx: true, ex: 300 })
    if (dedupResult !== 'OK') {
      return NextResponse.json({ stepId: stepId, runId, duplicate: true })
    }
    await redis.xadd(
      PulseKeys.stream(eventType, pulsePriority),
      '*',
      { job: JSON.stringify({ ...job, enqueuedAt: Date.now() }) },
      { maxlen: CONTROL_PLANE_STREAM_MAXLEN, approximate: true },
    )

    return NextResponse.json({ stepId: stepId, runId })
  } catch (err) {
    ErrorService.captureException(err instanceof Error ? err : new Error('Step enqueue error'))
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
