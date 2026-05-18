import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProofLog } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/proofs?org_id=xxx&agent_id=xxx&limit=50&offset=0
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

    const agentId = searchParams.get('agent_id') || undefined
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const proofs = await getProofLog(orgId, { agentId, limit, offset })

    return NextResponse.json({ proofs })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/proofs' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
