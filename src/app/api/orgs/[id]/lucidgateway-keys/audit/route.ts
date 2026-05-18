/**
 * GET /api/orgs/[id]/lucidgateway-keys/audit
 * 
 * List audit events for LucidGateway keys
 * Supports filtering by keyId and eventType
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { listOrgLucidGatewayKeyAuditEvents, type OrgLucidGatewayKeyAuditEventType } from '@/lib/db'
import { canPerformAction } from '@/lib/access-control/server'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params
    const canView = await canPerformAction(userId, orgId, 'viewSettings')
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse query parameters for filtering
    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('keyId') || undefined
    const eventType = (searchParams.get('eventType') || undefined) as OrgLucidGatewayKeyAuditEventType | undefined

    const events = await listOrgLucidGatewayKeyAuditEvents({ orgId, keyId, eventType })
    
    return NextResponse.json({ events })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/lucidgateway-keys/audit', method: 'GET' },
      tags: { layer: 'api', route: 'org-lucidgateway-keys-audit' },
    })
    return NextResponse.json({ error: 'Failed to list audit events' }, { status: 500 })
  }
}