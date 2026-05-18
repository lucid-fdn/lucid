import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getMCFeedEvents } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withReadFallback } from '@/lib/api/read-fallback'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/feed?org_id=xxx&limit=50&agent_id=xxx&cursor=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const orgId = searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const agentId = searchParams.get('agent_id') || undefined
    const cursor = searchParams.get('cursor') || undefined

    const events = await withReadFallback(
      getMCFeedEvents(orgId, { limit, agentId, cursor }),
      [],
      { endpoint: '/api/mission-control/feed', orgId, agentId, cursor },
    )

    return NextResponse.json({ events })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/feed' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
