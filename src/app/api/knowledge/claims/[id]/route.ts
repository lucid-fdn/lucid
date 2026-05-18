import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  KnowledgeClaimResolvedOutcomeSchema,
  KnowledgeClaimStatusSchema,
} from '@contracts/knowledge-claims'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getKnowledgeClaim, updateKnowledgeClaimStatus } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const getClaimQuerySchema = z.object({
  org_id: z.string().uuid(),
})

const patchClaimBodySchema = z.object({
  org_id: z.string().uuid(),
  status: KnowledgeClaimStatusSchema,
  outcome: KnowledgeClaimResolvedOutcomeSchema.nullable().optional(),
  summary: z.string().min(1).max(2000).optional(),
})

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = getClaimQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: parsed.data.org_id,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { id } = await ctx.params
    const claim = await getKnowledgeClaim(parsed.data.org_id, id)
    if (!claim) return NextResponse.json({ error: 'Knowledge claim not found' }, { status: 404 })

    return NextResponse.json({ claim })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-claims' },
    })
    return NextResponse.json({ error: 'Failed to get knowledge claim' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = patchClaimBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { id } = await ctx.params
    const claim = await updateKnowledgeClaimStatus({
      orgId: body.org_id,
      claimId: id,
      status: body.status,
      outcome: body.outcome,
      summary: body.summary,
      actorUserId: userId,
    })
    return NextResponse.json({ claim })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'knowledge-claims' },
    })
    return NextResponse.json({ error: 'Failed to update knowledge claim' }, { status: 500 })
  }
})
