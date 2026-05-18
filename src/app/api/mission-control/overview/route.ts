import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getMissionControlOverview } from '@/lib/db/mission-control'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/overview?org_id=xxx
export async function GET(request: NextRequest) {
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

    const [overview, legacyKpis] = await Promise.all([
      getMissionControlOverview(orgId),
      supabase.rpc('mc_overview_kpis', {
        p_org_id: orgId,
      }),
    ])

    if (legacyKpis.error) {
      ErrorService.captureException(legacyKpis.error, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/overview', step: 'legacyKpis' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 })
    }

    return NextResponse.json({
      ...legacyKpis.data,
      summary: overview.summary,
      attentionCount: overview.attentionCount,
      fleet: overview.fleet,
      runtimes: overview.runtimes,
      hotProjects: overview.hotProjects,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/overview' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
