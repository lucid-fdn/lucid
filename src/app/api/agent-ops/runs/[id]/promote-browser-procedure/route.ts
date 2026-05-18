import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { buildBrowserProcedurePromotionPlan } from '@/lib/agent-ops/browser-procedure-promotion'
import {
  createAgentOpsBrowserProcedure,
  createAgentOpsBrowserProcedureVersion,
  getAgentOpsBrowserProcedureBySourceRun,
  getAgentOpsBrowserProcedureDetail,
  isUserOrgMember,
} from '@/lib/db'
import { getAgentOpsRunDetail } from '@/lib/db/agent-ops'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const promoteBodySchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(160).optional(),
  description: z.string().min(1).max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { params } = ctx as { params: Promise<{ id: string }> }
    const { id: runId } = routeParamsSchema.parse(await params)
    const body = promoteBodySchema.parse(await req.json())

    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await getAgentOpsBrowserProcedureBySourceRun({
      orgId: body.org_id,
      sourceRunId: runId,
    })
    if (existing) {
      const detail = await getAgentOpsBrowserProcedureDetail({
        orgId: body.org_id,
        procedureId: existing.id,
      })
      return NextResponse.json({
        procedure: existing,
        versions: detail?.versions ?? [],
        existing: true,
      })
    }

    const detail = await getAgentOpsRunDetail(body.org_id, runId)
    if (!detail) {
      return NextResponse.json({ error: 'Agent Ops run not found' }, { status: 404 })
    }

    const plan = buildBrowserProcedurePromotionPlan({
      run: detail.run,
      artifacts: detail.artifacts,
      browserQaSessions: detail.browserQaSessions,
    })
    if (!plan) {
      return NextResponse.json({
        error: 'Run does not contain promotable Browser Operator evidence',
      }, { status: 400 })
    }

    const procedure = await createAgentOpsBrowserProcedure({
      orgId: body.org_id,
      projectId: detail.run.projectId ?? null,
      hostPattern: plan.hostPattern,
      name: body.name ?? plan.name,
      slug: plan.slug,
      description: body.description ?? plan.description,
      intentTriggers: plan.intentTriggers,
      procedureType: plan.procedureType,
      scope: detail.run.projectId ? 'project' : 'org',
      trustState: 'quarantined',
      sourceRunId: detail.run.id,
      createdByUserId: userId,
      createdByAgentId: detail.run.assistantId ?? null,
      metadata: {
        ...plan.metadata,
        ...(body.metadata ?? {}),
        promoted_by: userId,
        promoted_at: new Date().toISOString(),
      },
    })

    const version = await createAgentOpsBrowserProcedureVersion({
      procedureId: procedure.id,
      version: 1,
      definitionKind: 'browser_operator_plan',
      definition: plan.definition,
      fixtureArtifactId: plan.fixtureArtifactId,
      testDefinition: plan.testDefinition,
      capabilities: ['advanced:browser-procedures', 'advanced:browser-trust-shield', 'tool:browser'],
      riskLevel: plan.riskLevel,
      approvalPolicy: plan.approvalPolicy,
      createdByUserId: userId,
    })

    return NextResponse.json({ procedure, version, existing: false }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/runs/[id]/promote-browser-procedure', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to promote Browser Procedure' }, { status: 500 })
  }
})
