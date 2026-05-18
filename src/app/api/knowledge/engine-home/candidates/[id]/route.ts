import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember, reviewKnowledgeEngineHomeProjectionCandidate } from '@/lib/db'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const bodySchema = z.object({
  org_id: z.string().uuid(),
  action: z.enum(['reject', 'ignore', 'promote']),
  note: z.string().max(1000).nullable().optional(),
})

export const PATCH = withCSRF(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

  if (!(await isUserOrgMember(userId, parsed.data.org_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const role = await getOrgMemberRole(userId, parsed.data.org_id)
  if (!role || !WRITE_ROLES.has(role)) {
    return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
  }

  try {
    const candidate = await reviewKnowledgeEngineHomeProjectionCandidate({
      orgId: parsed.data.org_id,
      candidateId: id,
      reviewerUserId: userId,
      action: parsed.data.action,
      note: parsed.data.note,
    })
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    return NextResponse.json({ candidate })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to review engine-home candidate',
    }, { status: 400 })
  }
})
