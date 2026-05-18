import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/economics/revenue?org_id=xxx
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

    // Get launched agents for this org
    const { data: launchedAgents, error: agentsError } = await supabase
      .from('launched_agents')
      .select('id, assistant_id, token_name, token_symbol, total_revenue_usd')
      .eq('org_id', orgId)

    if (agentsError) {
      ErrorService.captureException(agentsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics/revenue', query: 'launchedAgents' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch launched agents' }, { status: 500 })
    }

    // Get recent revenue epochs
    const { data: epochs, error: epochsError } = await supabase
      .from('revenue_epochs')
      .select('id, launched_agent_id, epoch_number, period_start, period_end, gross_revenue_usdc, platform_fee_usdc, staker_reward_usdc, inference_cost_usdc, streamflow_reward_pool_id, distribution_tx, status, request_count, created_at')
      .in('launched_agent_id', (launchedAgents || []).map((a: any) => a.id))
      .order('epoch_number', { ascending: false })
      .limit(12)

    if (epochsError) {
      ErrorService.captureException(epochsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics/revenue', query: 'epochs' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch revenue epochs' }, { status: 500 })
    }

    return NextResponse.json({
      launched_agents: (launchedAgents || []).map((a: any) => ({
        id: a.id,
        assistant_id: a.assistant_id,
        token_name: a.token_name,
        token_symbol: a.token_symbol,
        total_revenue_usd: Number(a.total_revenue_usd || 0),
      })),
      recent_epochs: epochs || [],
      total_revenue: (launchedAgents || []).reduce(
        (sum: number, a: any) => sum + Number(a.total_revenue_usd || 0),
        0
      ),
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/economics/revenue' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
