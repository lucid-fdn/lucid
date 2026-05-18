import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { polymarketWorkerFetch } from '@/lib/trading/polymarket/worker-proxy'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/predictions/funding?assistant_id=xxx&org_id=xxx
 *
 * Returns deposit addresses for funding an agent's Polymarket account.
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
      `/polymarket/funding?assistant_id=${encodeURIComponent(assistantId)}`,
    )
    return NextResponse.json(data)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/predictions/funding' },
      tags: { layer: 'api', route: 'predictions-funding' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * POST /api/predictions/funding?org_id=xxx
 * Body: { assistant_id, recipient_address, amount }
 *
 * Initiates a withdrawal from Polymarket to a Solana address.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    if (!body.assistant_id || !body.recipient_address || !body.amount) {
      return NextResponse.json(
        { error: 'assistant_id, recipient_address, and amount required' },
        { status: 400 },
      )
    }

    const data = await polymarketWorkerFetch('/polymarket/withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return NextResponse.json(data)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/predictions/funding (POST)' },
      tags: { layer: 'api', route: 'predictions-withdraw' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
