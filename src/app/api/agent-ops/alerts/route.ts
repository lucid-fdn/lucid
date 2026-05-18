import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_PROJECT_SAFETY_MODES,
  performanceAlertControlsInputSchema,
} from '@/lib/agent-ops/operating-loop'
import {
  getAgentOpsProjectPolicy,
  isUserOrgMember,
  recordAgentOpsProjectTimelineEvent,
  upsertAgentOpsProjectPolicy,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const resolveAlertBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  assistant_id: z.string().uuid().nullable().optional(),
  fingerprint: z.string().min(1).max(512),
  title: z.string().min(1).max(240),
  note: z.string().max(1000).nullable().optional(),
  resolving_ops_run_id: z.string().uuid().nullable().optional(),
  safety_mode: z.enum(AGENT_OPS_PROJECT_SAFETY_MODES).optional(),
})

const alertActionBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve'),
    ...resolveAlertBodySchema.shape,
  }),
])

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = alertActionBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const currentPolicy = await getAgentOpsProjectPolicy({
      orgId: body.org_id,
      projectId: body.project_id,
    })
    const currentMetadata = currentPolicy?.metadata ?? {}
    const currentAlerts = readRecord(currentMetadata.performance_alerts)
    const resolvedFingerprints = readRecord(currentAlerts.resolved_fingerprints)
    const resolvedAt = new Date().toISOString()
    const performanceAlerts = performanceAlertControlsInputSchema.parse({
      ...currentAlerts,
      resolved_fingerprints: {
        ...resolvedFingerprints,
        [body.fingerprint]: {
          resolved_at: resolvedAt,
          resolved_by: userId,
          resolving_run_id: body.resolving_ops_run_id ?? null,
          note: body.note ?? null,
        },
      },
    })

    const policy = await upsertAgentOpsProjectPolicy({
      orgId: body.org_id,
      projectId: body.project_id,
      mode: body.safety_mode ?? currentPolicy?.safetyMode ?? 'normal',
      metadata: {
        ...currentMetadata,
        performance_alerts: performanceAlerts,
      },
      updatedBy: userId,
    })

    const timelineInserted = await recordAgentOpsProjectTimelineEvent({
      orgId: body.org_id,
      projectId: body.project_id,
      runId: body.resolving_ops_run_id ?? null,
      eventType: 'agent_ops_performance_alert_resolved',
      title: `Resolved: ${body.title}`,
      body: body.note ?? 'Agent Ops performance alert resolved from Mission Control.',
      evidence: {
        fingerprint: body.fingerprint,
        resolving_ops_run_id: body.resolving_ops_run_id ?? null,
      },
      metadata: {
        fingerprint: body.fingerprint,
        alert_kind: 'agent_ops_performance_budget',
        resolution_kind: 'manual',
        assistant_id: body.assistant_id ?? null,
      },
      createdBy: userId,
    })

    return NextResponse.json({
      policy,
      resolution: {
        fingerprint: body.fingerprint,
        resolvedAt,
        resolvedBy: userId,
        resolvingRunId: body.resolving_ops_run_id ?? null,
        note: body.note ?? null,
        timelineInserted,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/alerts', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update Agent Ops alert' }, { status: 500 })
  }
})

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
