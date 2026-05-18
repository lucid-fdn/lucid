import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { polymarketWorkerFetch } from '@/lib/trading/polymarket/worker-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/predictions/search?q=xxx&org_id=xxx&limit=10
 *
 * Search Polymarket markets.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const query = request.nextUrl.searchParams.get('q')
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!query || !orgId) {
      return NextResponse.json({ error: 'q and org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = request.nextUrl.searchParams.get('limit') || '10'
    const data = await polymarketWorkerFetch(
      `/polymarket/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`,
    )
    return NextResponse.json(data)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/predictions/search' },
      tags: { layer: 'api', route: 'predictions' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
