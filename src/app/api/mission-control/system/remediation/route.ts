import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/system/remediation?org_id=xxx
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

    const [policiesRes, logRes] = await Promise.all([
      supabase
        .from('mc_remediation_policies')
        .select('id, org_id, name, enabled, trigger_type, condition, action_type, action_config, cooldown_seconds, last_triggered_at, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('mc_remediation_log')
        .select('id, policy_id, org_id, agent_id, action_taken, outcome, details, triggered_at')
        .eq('org_id', orgId)
        .order('triggered_at', { ascending: false })
        .limit(50),
    ])

    if (policiesRes.error) {
      ErrorService.captureException(policiesRes.error, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/system/remediation' },
        tags: { layer: 'api', route: 'mission-control' },
      })
    }

    return NextResponse.json({
      policies: policiesRes.data ?? [],
      log: logRes.data ?? [],
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/system/remediation' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
