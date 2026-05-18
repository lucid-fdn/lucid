import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  AGENT_OPS_BROWSER_HANDOFF_STATES,
} from '@/lib/agent-ops/browser-live-sessions'
import {
  getAgentOpsRunForOrg,
  isUserOrgMember,
  listAgentOpsBrowserQaSessionsForRun,
  recordAgentOpsBrowserSessionEvent,
  recordAgentOpsBrowserSessionSharedAction,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const handoffBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid(),
  browser_session_id: z.string().uuid().nullable().optional(),
  action: z.enum(['resolve', 'resume']),
  handoff_state: z.enum(AGENT_OPS_BROWSER_HANDOFF_STATES).nullable().optional(),
  current_url: z.string().max(2000).nullable().optional(),
  message: z.string().max(2000).nullable().optional(),
  actor_assistant_id: z.string().uuid().nullable().optional(),
  actor_runtime_id: z.string().max(160).nullable().optional(),
  actor_agent_label: z.string().max(160).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

async function resolveOwnedBrowserSession(input: {
  orgId: string
  runId: string
  projectId?: string | null
  browserSessionId?: string | null
  sessionKey: string
}) {
  const run = await getAgentOpsRunForOrg(input.orgId, input.runId)
  if (!run) return { ok: false as const, status: 404, error: 'Agent Ops run not found' }
  if (input.projectId && run.projectId && input.projectId !== run.projectId) {
    return { ok: false as const, status: 400, error: 'Project does not match Agent Ops run' }
  }

  const sessions = await listAgentOpsBrowserQaSessionsForRun(input.orgId, input.runId, 100)
  const session = sessions.find((item) =>
    item.sessionKey === input.sessionKey &&
    (!input.browserSessionId || item.id === input.browserSessionId)
  )
  if (!session) {
    return { ok: false as const, status: 404, error: 'Browser session not found for this run' }
  }

  return { ok: true as const, run, session }
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

    const body = handoffBodySchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { sessionKey } = await context.params
    const ownership = await resolveOwnedBrowserSession({
      orgId: body.org_id,
      runId: body.run_id,
      projectId: body.project_id ?? null,
      browserSessionId: body.browser_session_id ?? null,
      sessionKey,
    })
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status })
    }

    const event = await recordAgentOpsBrowserSessionEvent({
      orgId: body.org_id,
      runId: body.run_id,
      browserSessionId: ownership.session.id,
      sessionKey,
      eventType: body.action === 'resolve' ? 'handoff_resolved' : 'session_resumed',
      severity: 'info',
      handoffState: body.handoff_state ?? null,
      currentUrl: body.current_url ?? null,
      message: body.message ?? (
        body.action === 'resolve'
          ? 'Human handoff resolved from Mission Control.'
          : 'Browser Operator resume requested from Mission Control.'
      ),
      metadata: {
        ...(body.metadata ?? {}),
        source: 'mission_control_browser_operator',
        action: body.action,
        actor_user_id: userId,
      },
    })

    const sharedAction = await recordAgentOpsBrowserSessionSharedAction({
      orgId: body.org_id,
      projectId: ownership.run.projectId ?? body.project_id ?? null,
      runId: body.run_id,
      sessionKey,
      actionType: body.action === 'resolve' ? 'handoff_resolved' : 'resume_requested',
      status: 'allowed',
      actorAssistantId: body.actor_assistant_id ?? null,
      actorRuntimeId: body.actor_runtime_id ?? null,
      actorAgentLabel: body.actor_agent_label ?? 'Mission Control operator',
      currentUrl: body.current_url ?? null,
      message: body.message ?? null,
      metadata: {
        ...(body.metadata ?? {}),
        source: 'mission_control_browser_operator',
        action: body.action,
        actor_user_id: userId,
      },
    })

    return NextResponse.json({ event, sharedAction })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/browser-sessions/[sessionKey]/handoff', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update browser session handoff' }, { status: 500 })
  }
})
