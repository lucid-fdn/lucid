import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { polymarketWorkerFetch } from '@/lib/trading/polymarket/worker-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/predictions/[assistantId]/orders/[orderId]?org_id=xxx
 *
 * Cancel a Polymarket order.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string; orderId: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { assistantId, orderId } = await params
    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await polymarketWorkerFetch(
      `/polymarket/orders/${encodeURIComponent(orderId)}?assistant_id=${encodeURIComponent(assistantId)}`,
      { method: 'DELETE' },
    )
    return NextResponse.json(data)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/predictions/cancel-order' },
      tags: { layer: 'api', route: 'predictions' },
    })
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
