import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, markKnowledgeSourceRefresh } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  org_id: z.string().uuid(),
  status: z.enum(['pending', 'ok', 'failed']).default('pending'),
  error: z.string().max(4000).nullable().optional(),
  external_etag: z.string().max(512).nullable().optional(),
  next_refresh_at: z.string().datetime().nullable().optional(),
  stale_after: z.string().datetime().nullable().optional(),
})

export const POST = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = bodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const source = await markKnowledgeSourceRefresh({
      orgId: body.org_id,
      sourceId: id,
      status: body.status,
      error: body.error,
      externalEtag: body.external_etag,
      nextRefreshAt: body.next_refresh_at,
      staleAfter: body.stale_after,
    })

    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 })
    return NextResponse.json({ source })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources/[id]/refresh', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to update knowledge source refresh state' }, { status: 500 })
  }
})
