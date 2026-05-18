import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { explainKnowledge, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
  includeTimeline: z
    .string()
    .nullable()
    .transform((value) => value !== 'false'),
  includeProofs: z
    .string()
    .nullable()
    .transform((value) => value === 'true'),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      includeTimeline: req.nextUrl.searchParams.get('include_timeline'),
      includeProofs: req.nextUrl.searchParams.get('include_proofs'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await explainKnowledge({
      orgId: parsed.data.orgId,
      knowledgeId: id,
      includeTimeline: parsed.data.includeTimeline,
      includeProofs: parsed.data.includeProofs,
    })
    if (!result.page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/pages/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to explain knowledge page' }, { status: 500 })
  }
}
