import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getKnowledgeClaim, listKnowledgeClaimEvidence } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const evidenceQuerySchema = z.object({
  org_id: z.string().uuid(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
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

    const parsed = evidenceQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
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

    const evidence = await listKnowledgeClaimEvidence({
      orgId: parsed.data.org_id,
      claimId: id,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ claim, evidence })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims/[id]/evidence', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-claim-evidence' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge claim evidence' }, { status: 500 })
  }
}
