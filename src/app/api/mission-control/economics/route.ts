import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// GET /api/mission-control/economics?org_id=xxx
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

    // Cost today
    const { data: costToday, error: costTodayError } = await supabase
      .from('mc_agent_cost_tracking')
      .select('estimated_cost_usd, tokens_input, tokens_output')
      .eq('org_id', orgId)
      .eq('date', new Date().toISOString().split('T')[0])

    if (costTodayError) {
      ErrorService.captureException(costTodayError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics', query: 'costToday' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch cost data' }, { status: 500 })
    }

    const totalCostToday = (costToday || []).reduce(
      (sum: number, r: any) => sum + Number(r.estimated_cost_usd || 0),
      0
    )
    const totalInputTokens = (costToday || []).reduce(
      (sum: number, r: any) => sum + Number(r.tokens_input || 0),
      0
    )
    const totalOutputTokens = (costToday || []).reduce(
      (sum: number, r: any) => sum + Number(r.tokens_output || 0),
      0
    )

    // Cost last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: costWeek, error: costWeekError } = await supabase
      .from('mc_agent_cost_tracking')
      .select('date, estimated_cost_usd')
      .eq('org_id', orgId)
      .gte('date', sevenDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (costWeekError) {
      ErrorService.captureException(costWeekError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics', query: 'costWeek' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch weekly cost data' }, { status: 500 })
    }

    const dailyCosts = (costWeek || []).reduce((acc: Record<string, number>, r: any) => {
      acc[r.date] = (acc[r.date] || 0) + Number(r.estimated_cost_usd || 0)
      return acc
    }, {})

    return NextResponse.json({
      cost_today_usd: totalCostToday,
      tokens_today: { input: totalInputTokens, output: totalOutputTokens },
      daily_costs: Object.entries(dailyCosts).map(([date, amount]) => ({ date, amount })),
      cost_breakdown: [
        { category: 'inference', amount: totalCostToday * 0.85 },
        { category: 'tools', amount: totalCostToday * 0.10 },
        { category: 'storage', amount: totalCostToday * 0.05 },
      ],
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/economics' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
