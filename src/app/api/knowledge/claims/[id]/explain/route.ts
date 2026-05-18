import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { explainKnowledgeClaim } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const explainQuerySchema = z.object({
  org_id: z.string().uuid(),
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

    const parsed = explainQuerySchema.safeParse({
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
    const explanation = await explainKnowledgeClaim({
      orgId: parsed.data.org_id,
      claimId: id,
    })
    if (!explanation) return NextResponse.json({ error: 'Knowledge claim not found' }, { status: 404 })

    return NextResponse.json({ explanation })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/claims/[id]/explain', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-claim-explain' },
    })
    return NextResponse.json({ error: 'Failed to explain knowledge claim' }, { status: 500 })
  }
}
