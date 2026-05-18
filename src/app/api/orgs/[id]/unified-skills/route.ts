import { NextRequest, NextResponse } from 'next/server'

import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getUserId } from '@/lib/auth/server-utils'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'

export const dynamic = 'force-dynamic'

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

    const { id: orgId } = await params
    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const items = await getUnifiedSkillsForOrg({ orgId })
    return NextResponse.json({ items })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/unified-skills', method: 'GET' },
      tags: { layer: 'api', route: 'org-unified-skills' },
    })
    return NextResponse.json({ error: 'Failed to load unified skills' }, { status: 500 })
  }
}
