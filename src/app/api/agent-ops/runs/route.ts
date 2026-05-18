import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { buildAgentOpsRunSystemNotice, startAgentOpsRun } from '@/lib/agent-ops'
import {
  AGENT_OPS_RUN_STATUSES,
  AGENT_OPS_RUN_MODES,
  AGENT_OPS_SCOPE_TYPES,
  AGENT_OPS_WORKFLOW_IDS,
} from '@/lib/agent-ops/workflow-types'
import { createSystemNotice, isUserOrgMember } from '@/lib/db'
import { supabaseAgentOpsDagOrchestrationAdapter } from '@/lib/db/agent-ops-orchestration'
import {
  appendAgentOpsRunLink,
  listAgentOpsRunsForOrg,
  recordAgentOpsProjectTimelineEvent,
  supabaseAgentOpsRunModeRecorder,
  supabaseAgentOpsRunStore,
} from '@/lib/db/agent-ops'
import { supabaseAgentOpsRuntimeSelector } from '@/lib/db/agent-ops-runtime-selector'
import { supabaseAgentOpsTeamPolicyGate } from '@/lib/db/agent-ops-team-policy-gate'
import { supabaseAgentOpsSpecialistTelemetryProvider } from '@/lib/db/agent-ops-product'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  status: z.string().optional(),
  workflowId: z.enum(AGENT_OPS_WORKFLOW_IDS).optional(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
  offset: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().nonnegative().max(10_000).optional()),
})

const startRunBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  workflow_id: z.enum(AGENT_OPS_WORKFLOW_IDS),
  run_mode: z.enum(AGENT_OPS_RUN_MODES).optional().default('execute'),
  scope: z.object({
    type: z.enum(AGENT_OPS_SCOPE_TYPES),
    ref: z.string().min(1).max(500).optional(),
    label: z.string().max(240).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  }),
  input: z.record(z.string(), z.unknown()).optional().default({}),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = listQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      workflowId: req.nextUrl.searchParams.get('workflow_id') ?? undefined,
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      assistantId: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
      offset: req.nextUrl.searchParams.get('offset') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const requestedStatuses = parsed.data.status
      ?.split(',')
      .map((status) => status.trim())
      .filter((status): status is (typeof AGENT_OPS_RUN_STATUSES)[number] =>
        (AGENT_OPS_RUN_STATUSES as readonly string[]).includes(status),
      )

    const runs = await listAgentOpsRunsForOrg(parsed.data.orgId, {
      status: requestedStatuses && requestedStatuses.length > 0 ? requestedStatuses : undefined,
      workflowId: parsed.data.workflowId,
      projectId: parsed.data.projectId,
      assistantId: parsed.data.assistantId,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    })

    return NextResponse.json({ runs })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/runs', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list Agent Ops runs' }, { status: 500 })
  }
}

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

    const body = startRunBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const run = await startAgentOpsRun(
      {
        orgId: body.org_id,
        projectId: body.project_id ?? null,
        assistantId: body.assistant_id ?? null,
        requestedByUserId: userId,
        workflowId: body.workflow_id,
        runMode: body.run_mode,
        scope: body.scope,
        input: body.input,
        metadata: body.metadata,
      },
      {
        runStore: supabaseAgentOpsRunStore,
        teamPolicyGate: supabaseAgentOpsTeamPolicyGate,
        specialistTelemetry: supabaseAgentOpsSpecialistTelemetryProvider,
        runtimeSelector: supabaseAgentOpsRuntimeSelector,
        runModeRecorder: supabaseAgentOpsRunModeRecorder,
        ...(body.assistant_id ? { orchestration: supabaseAgentOpsDagOrchestrationAdapter } : {}),
      },
    )

    await Promise.all([
      createRunNotice(run),
      body.scope.ref
        ? appendAgentOpsRunLink({
            orgId: body.org_id,
            runId: run.id,
            linkType: 'external',
            refText: `${body.scope.type}:${body.scope.ref}`,
            label: body.scope.label ?? body.scope.ref,
            metadata: {
              source: body.scope.metadata.source ?? body.metadata.launched_from ?? 'agent_ops_api',
              scope_type: body.scope.type,
            },
          }).catch(() => null)
        : Promise.resolve(null),
      body.project_id
        ? recordAgentOpsProjectTimelineEvent({
            orgId: body.org_id,
            projectId: body.project_id,
            runId: run.id,
            eventType: 'agent_ops_run_started',
            title: `${body.workflow_id} Agent Ops run started`,
            body: body.scope.label ?? body.scope.ref ?? null,
            evidence: {
              workflow_id: body.workflow_id,
              scope_type: body.scope.type,
              scope_ref: body.scope.ref ?? null,
            },
            metadata: {
              source: body.scope.metadata.source ?? body.metadata.launched_from ?? 'agent_ops_api',
            },
            createdBy: userId,
          }).catch(() => null)
        : Promise.resolve(null),
    ])

    return NextResponse.json({ run }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/runs', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to start Agent Ops run' }, { status: 500 })
  }
})

async function createRunNotice(run: Awaited<ReturnType<typeof startAgentOpsRun>>) {
  const notice = buildAgentOpsRunSystemNotice(run)
  if (!notice) return null
  return createSystemNotice(notice).catch(() => null)
}
