import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { AGENT_OPS_EVAL_TARGET_KINDS, agentOpsEvalResultInputSchema } from '@/lib/agent-ops/evals'
import { isUserOrgMember, recordAgentOpsEvalRun } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const recordEvalBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  ops_run_id: z.string().uuid().nullable().optional(),
  workflow_id: z.string().min(1).max(128).nullable().optional(),
  target_kind: z.enum(AGENT_OPS_EVAL_TARGET_KINDS),
  target_ref: z.string().min(1).max(500).nullable().optional(),
  latency_ms: z.number().nonnegative().nullable().optional(),
  cost_usd: z.number().nonnegative().nullable().optional(),
  token_count: z.number().int().nonnegative().nullable().optional(),
  results: z.array(agentOpsEvalResultInputSchema).max(200),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = recordEvalBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const evalRun = await recordAgentOpsEvalRun({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      opsRunId: body.ops_run_id ?? null,
      workflowId: body.workflow_id ?? null,
      targetKind: body.target_kind,
      targetRef: body.target_ref ?? null,
      latencyMs: body.latency_ms ?? null,
      costUsd: body.cost_usd ?? null,
      tokenCount: body.token_count ?? null,
      results: body.results,
      metadata: body.metadata,
      createdBy: userId,
    })

    return NextResponse.json({ evalRun }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/evals', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to record Agent Ops eval' }, { status: 500 })
  }
})
