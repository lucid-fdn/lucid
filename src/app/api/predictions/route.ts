import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { polymarketWorkerFetch } from '@/lib/trading/polymarket/worker-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/predictions?assistant_id=xxx&org_id=xxx
 *
 * Returns positions + open orders for an assistant.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const assistantId = request.nextUrl.searchParams.get('assistant_id')
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!assistantId || !orgId) {
      return NextResponse.json({ error: 'assistant_id and org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await polymarketWorkerFetch(
      `/polymarket/positions?assistant_id=${encodeURIComponent(assistantId)}`,
    )
    return NextResponse.json(data)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/predictions' },
      tags: { layer: 'api', route: 'predictions' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
