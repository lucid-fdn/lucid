/**
 * GET /api/entitlements/status?orgId=xxx
 *
 * Returns current entitlement status for the org.
 * Used by the frontend for proactive warnings (80%, 95% thresholds).
 * Server is the source of truth — frontend only renders.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuth } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getEntitlementStatus } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(auth.userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await getEntitlementStatus(orgId)

    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/entitlements/status', method: 'GET' },
      tags: { layer: 'api', route: 'entitlements-status' },
    })

    return NextResponse.json(
      { error: 'Failed to get entitlement status' },
      { status: 500 },
    )
  }
}
