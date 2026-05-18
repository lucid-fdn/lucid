import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_PROJECT_SAFETY_MODES,
  performanceAlertControlsInputSchema,
  performanceBudgetInputSchema,
  projectSafetyPolicyInputSchema,
  resolveSafetyPolicy,
  teamSetupDoctorInputSchema,
} from '@/lib/agent-ops/operating-loop'
import { teamPolicyInputSchema } from '@/lib/agent-ops/team-policy'
import {
  getAgentOpsProjectPolicy,
  isUserOrgMember,
  upsertAgentOpsProjectPolicy,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const policyQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
})

const policyBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  safety_mode: z.enum(AGENT_OPS_PROJECT_SAFETY_MODES),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  performance_budget: performanceBudgetInputSchema.optional(),
  performance_alerts: performanceAlertControlsInputSchema.optional(),
  team_policy: teamPolicyInputSchema.optional(),
  team_setup_doctor: teamSetupDoctorInputSchema.optional(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = policyQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const policy = await getAgentOpsProjectPolicy(parsed.data)
    return NextResponse.json({
      policy: policy ?? {
        orgId: parsed.data.orgId,
        projectId: parsed.data.projectId ?? null,
        safetyMode: 'normal',
        policy: resolveSafetyPolicy('normal'),
        status: 'active',
        metadata: {},
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/project-policy', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to load project policy' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = policyBodySchema.parse(await req.json())
    const input = projectSafetyPolicyInputSchema.parse({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      mode: body.safety_mode,
      metadata: {
        ...body.metadata,
        ...(body.performance_budget ? { performance_budget: body.performance_budget } : {}),
        ...(body.performance_alerts ? { performance_alerts: body.performance_alerts } : {}),
        ...(body.team_policy ? { team_policy: body.team_policy } : {}),
        ...(body.team_setup_doctor ? { team_setup_doctor: body.team_setup_doctor } : {}),
      },
      updatedBy: userId,
    })

    const isMember = await isUserOrgMember(userId, input.orgId)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const policy = await upsertAgentOpsProjectPolicy(input)
    return NextResponse.json({ policy })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/project-policy', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update project policy' }, { status: 500 })
  }
})
