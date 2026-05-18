import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/experiments?org_id=xxx
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

    const { data, error } = await supabase
      .from('mc_experiments')
      .select('id, org_id, name, description, base_agent_id, variant_agent_id, split_pct, variable_type, variable_config, status, started_at, completed_at, winner, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/experiments' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch experiments' }, { status: 500 })
    }

    return NextResponse.json({ experiments: data ?? [] })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/experiments' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
