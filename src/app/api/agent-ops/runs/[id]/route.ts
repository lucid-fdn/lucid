import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { cancelAgentOpsRun, retryAgentOpsRun } from '@/lib/agent-ops'
import { isUserOrgMember } from '@/lib/db'
import { supabaseAgentOpsDagOrchestrationAdapter } from '@/lib/db/agent-ops-orchestration'
import {
  getAgentOpsRunDetail,
  supabaseAgentOpsRunStore,
} from '@/lib/db/agent-ops'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const detailQuerySchema = z.object({
  orgId: z.string().uuid(),
})

const patchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancel'),
    org_id: z.string().uuid(),
    reason: z.string().min(1).max(500).optional(),
  }),
  z.object({
    action: z.literal('retry'),
    org_id: z.string().uuid(),
    from_node_key: z.string().min(1).max(128).optional(),
  }),
])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = routeParamsSchema.parse(await params)
    const parsed = detailQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const detail = await getAgentOpsRunDetail(parsed.data.orgId, id)
    if (!detail) {
      return NextResponse.json({ error: 'Agent Ops run not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/runs/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to load Agent Ops run' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (
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
    const { id } = routeParamsSchema.parse(await params)
    const body = patchBodySchema.parse(await req.json())

    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const run = body.action === 'cancel'
      ? await cancelAgentOpsRun(
          { orgId: body.org_id, runId: id, reason: body.reason },
          {
            runStore: supabaseAgentOpsRunStore,
            orchestration: supabaseAgentOpsDagOrchestrationAdapter,
          },
        )
      : await retryAgentOpsRun(
          { orgId: body.org_id, runId: id, fromNodeKey: body.from_node_key },
          {
            runStore: supabaseAgentOpsRunStore,
            orchestration: supabaseAgentOpsDagOrchestrationAdapter,
          },
        )

    return NextResponse.json({ run })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    if (error instanceof Error && error.message === 'Agent Ops run not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof Error && error.message.startsWith('Agent Ops run is not retryable')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/runs/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to update Agent Ops run' }, { status: 500 })
  }
})
