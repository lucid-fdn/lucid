import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { AGENT_OPS_BROWSER_SHARE_SCOPES } from '@/lib/agent-ops/browser-session-sharing'
import {
  createAgentOpsBrowserSessionShare,
  getAgentOpsRunForOrg,
  isUserOrgMember,
  listAgentOpsBrowserQaSessionsForRun,
  listAgentOpsBrowserSessionShares,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  status: z.enum(['active', 'revoked', 'expired']).optional(),
})

const createShareSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid(),
  scope: z.enum(AGENT_OPS_BROWSER_SHARE_SCOPES),
  granted_to_assistant_id: z.string().uuid().nullable().optional(),
  granted_to_runtime_id: z.string().min(1).max(160).nullable().optional(),
  granted_to_agent_label: z.string().min(1).max(160).nullable().optional(),
  ttl_seconds: z.number().int().min(60).max(3600).optional(),
  rate_limit_per_minute: z.number().int().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

async function resolveOwnedBrowserSession(input: {
  orgId: string
  runId: string
  projectId?: string | null
  sessionKey: string
}) {
  const run = await getAgentOpsRunForOrg(input.orgId, input.runId)
  if (!run) return { ok: false as const, status: 404, error: 'Agent Ops run not found' }
  if (input.projectId && run.projectId && input.projectId !== run.projectId) {
    return { ok: false as const, status: 400, error: 'Project does not match Agent Ops run' }
  }

  const sessions = await listAgentOpsBrowserQaSessionsForRun(input.orgId, input.runId, 100)
  const session = sessions.find((item) => item.sessionKey === input.sessionKey)
  if (!session) {
    return { ok: false as const, status: 404, error: 'Browser session not found for this run' }
  }

  return { ok: true as const, run, session }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionKey: string }> },
) {
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
      runId: req.nextUrl.searchParams.get('run_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { sessionKey } = await context.params
    const shares = await listAgentOpsBrowserSessionShares({
      orgId: parsed.data.orgId,
      runId: parsed.data.runId,
      sessionKey,
      status: parsed.data.status,
      limit: 100,
    })

    return NextResponse.json({ shares })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-sessions/[sessionKey]/share', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to list browser session shares' }, { status: 500 })
  }
}

export const POST = withCSRF(async (
  req: NextRequest,
  context: { params: Promise<{ sessionKey: string }> },
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

    const body = createShareSchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { sessionKey } = await context.params
    const ownership = await resolveOwnedBrowserSession({
      orgId: body.org_id,
      runId: body.run_id,
      projectId: body.project_id ?? null,
      sessionKey,
    })
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status })
    }

    const result = await createAgentOpsBrowserSessionShare({
      orgId: body.org_id,
      projectId: ownership.run.projectId ?? body.project_id ?? null,
      runId: body.run_id,
      sessionKey,
      scope: body.scope,
      grantedToAssistantId: body.granted_to_assistant_id ?? null,
      grantedToRuntimeId: body.granted_to_runtime_id ?? null,
      grantedToAgentLabel: body.granted_to_agent_label ?? null,
      ttlSeconds: body.ttl_seconds,
      rateLimitPerMinute: body.rate_limit_per_minute,
      createdByUserId: userId,
      metadata: body.metadata ?? {},
    })
    if (!result) {
      return NextResponse.json({ error: 'Failed to create browser session share' }, { status: 500 })
    }

    return NextResponse.json({
      share: result.share,
      token: result.token,
      token_notice: 'This token is shown once. Store it only in the target runtime secret store.',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-sessions/[sessionKey]/share', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to create browser session share' }, { status: 500 })
  }
})
