import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { flipAgentOpsDecisionEvent, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const flipBodySchema = z.object({
  org_id: z.string().uuid(),
  selected_option: z.record(z.string(), z.unknown()),
  reason: z.string().max(1000).nullable().optional(),
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
    const { id } = paramsSchema.parse(await params)
    const body = flipBodySchema.parse(await req.json())

    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const event = await flipAgentOpsDecisionEvent({
      orgId: body.org_id,
      eventId: id,
      selectedOption: body.selected_option,
      reason: body.reason ?? null,
      createdByUserId: userId,
    })
    if (!event) {
      return NextResponse.json({ error: 'Decision event not found or not reversible' }, { status: 404 })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/decision-events/[id]/flip', method: 'POST' },
      tags: { layer: 'api', route: 'agent-ops' },
    })
    return NextResponse.json({ error: 'Failed to flip decision event' }, { status: 500 })
  }
})
