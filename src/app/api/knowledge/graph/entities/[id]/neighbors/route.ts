import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getKnowledgeGraphNeighbors, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  limit: z.string().optional().transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    if (!(await isUserOrgMember(userId, parsed.data.orgId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const neighbors = await getKnowledgeGraphNeighbors({
      orgId: parsed.data.orgId,
      entityId: id,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ neighbors })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/graph/entities/[id]/neighbors', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge graph neighbors' }, { status: 500 })
  }
}
