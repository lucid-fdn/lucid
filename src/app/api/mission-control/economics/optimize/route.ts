import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { analyzeCosts } from '@/lib/mission-control/cost-optimizer'

export const dynamic = 'force-dynamic'

// POST /api/mission-control/economics/optimize
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const orgId = body.org_id
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Gather cost data for all agents
    const today = new Date().toISOString().split('T')[0]
    const { data: agents, error: agentsError } = await supabase
      .from('ai_assistants')
      .select('id, name, lucid_model')
      .eq('org_id', orgId)
      .is('deleted_at', null)

    if (agentsError) {
      ErrorService.captureException(agentsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics/optimize', query: 'agents' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 })
    }

    const { data: costs, error: costsError } = await supabase
      .from('mc_agent_cost_tracking')
      .select('agent_id, estimated_cost_usd, tokens_input, tokens_output')
      .eq('org_id', orgId)
      .eq('date', today)

    if (costsError) {
      ErrorService.captureException(costsError, {
        severity: 'error',
        context: { endpoint: '/api/mission-control/economics/optimize', query: 'costs' },
        tags: { layer: 'api', route: 'mission-control' },
      })
      return NextResponse.json({ error: 'Failed to fetch cost data' }, { status: 500 })
    }

    const costMap = new Map<string, any>()
    for (const c of costs || []) {
      costMap.set(c.agent_id, c)
    }

    const inputs = (agents || []).map((a: any) => {
      const cost = costMap.get(a.id)
      return {
        agent_id: a.id,
        agent_name: a.name,
        model: a.lucid_model || 'unknown',
        daily_cost_usd: Number(cost?.estimated_cost_usd || 0),
        daily_tokens_input: Number(cost?.tokens_input || 0),
        daily_tokens_output: Number(cost?.tokens_output || 0),
        avg_turns_per_conversation: 3,
        tool_call_count: 0,
        tool_error_count: 0,
        cache_hit_rate: 0.5,
      }
    })

    const recommendations = analyzeCosts(inputs)

    // Store recommendations
    for (const rec of recommendations) {
      const { error: upsertError } = await supabase.from('mc_cost_recommendations').upsert(
        {
          org_id: orgId,
          agent_id: rec.agent_id,
          recommendation_type: rec.recommendation_type,
          title: rec.title,
          description: rec.description,
          estimated_savings_usd: rec.estimated_savings_usd,
          status: 'pending',
        },
        { onConflict: 'org_id,agent_id,recommendation_type' }
      )

      if (upsertError) {
        ErrorService.captureException(upsertError, {
          severity: 'warning',
          context: { endpoint: '/api/mission-control/economics/optimize', query: 'upsert' },
          tags: { layer: 'api', route: 'mission-control' },
        })
      }
    }

    return NextResponse.json({ recommendations, count: recommendations.length })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/economics/optimize' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
