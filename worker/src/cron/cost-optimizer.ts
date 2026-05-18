/**
 * Mission Control — Cost Optimizer (Weekly Cron)
 *
 * Analyzes agent cost data and generates actionable recommendations:
 * - Model downgrade opportunities (high cost, low complexity)
 * - Underutilized agents (cost with minimal activity)
 * - High token usage patterns
 *
 * Called from the worker's cron loop every 7 days.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface AgentCostSummary {
  agent_id: string
  org_id: string
  total_cost_usd: number
  total_tokens_input: number
  total_tokens_output: number
  total_runs: number
  days_active: number
}

interface CostRecommendation {
  org_id: string
  agent_id: string
  recommendation_type: string
  title: string
  description: string
  estimated_savings_usd: number
  action_config: Record<string, unknown>
}

/**
 * Analyze costs for an org's agents and produce recommendations.
 * Inlined here because worker cannot import from src/.
 */
function analyzeCosts(agents: AgentCostSummary[]): CostRecommendation[] {
  const recommendations: CostRecommendation[] = []

  for (const agent of agents) {
    const avgCostPerRun = agent.total_runs > 0
      ? agent.total_cost_usd / agent.total_runs
      : 0

    const avgTokensPerRun = agent.total_runs > 0
      ? (agent.total_tokens_input + agent.total_tokens_output) / agent.total_runs
      : 0

    // Recommendation: Model downgrade for low-complexity agents
    // If avg tokens per run is low (<2000) but cost per run is high (>$0.01),
    // the agent likely uses a strong model for simple tasks
    if (avgTokensPerRun < 2000 && avgCostPerRun > 0.01 && agent.total_runs >= 10) {
      const estimatedSavings = agent.total_cost_usd * 0.6 // ~60% savings switching to gpt-4o-mini
      recommendations.push({
        org_id: agent.org_id,
        agent_id: agent.agent_id,
        recommendation_type: 'model_switch',
        title: 'Consider a lighter model for this agent',
        description: `This agent averages ${Math.round(avgTokensPerRun)} tokens/run with $${avgCostPerRun.toFixed(4)}/run cost. A smaller model (e.g., gpt-4o-mini) could reduce costs by ~60% for simple interactions.`,
        estimated_savings_usd: Math.round(estimatedSavings * 100) / 100,
        action_config: {
          current_avg_cost_per_run: avgCostPerRun,
          suggested_model: 'gpt-4o-mini',
        },
      })
    }

    // Recommendation: Underutilized agent (cost but few runs)
    if (agent.total_cost_usd > 0.50 && agent.total_runs < 5 && agent.days_active >= 3) {
      recommendations.push({
        org_id: agent.org_id,
        agent_id: agent.agent_id,
        recommendation_type: 'tool_efficiency',
        title: 'Underutilized agent with recurring costs',
        description: `This agent has cost $${agent.total_cost_usd.toFixed(2)} over ${agent.days_active} days with only ${agent.total_runs} runs. Consider pausing or consolidating this agent.`,
        estimated_savings_usd: Math.round(agent.total_cost_usd * 0.8 * 100) / 100,
        action_config: {
          total_runs: agent.total_runs,
          days_active: agent.days_active,
          suggestion: 'pause_or_consolidate',
        },
      })
    }

    // Recommendation: High token usage (memory strategy adjustment)
    if (avgTokensPerRun > 8000 && agent.total_runs >= 5) {
      const estimatedSavings = agent.total_cost_usd * 0.25 // ~25% savings with better memory strategy
      recommendations.push({
        org_id: agent.org_id,
        agent_id: agent.agent_id,
        recommendation_type: 'memory_strategy',
        title: 'High token usage — adjust memory settings',
        description: `This agent averages ${Math.round(avgTokensPerRun)} tokens/run. Enabling conversation compaction or reducing the memory window could lower costs by ~25%.`,
        estimated_savings_usd: Math.round(estimatedSavings * 100) / 100,
        action_config: {
          avg_tokens_per_run: avgTokensPerRun,
          suggestion: 'enable_conversation_summary',
        },
      })
    }
  }

  return recommendations
}

export async function runCostOptimizer(supabase: SupabaseClient): Promise<void> {
  console.log('[MC:CostOptimizer] Starting...')

  try {
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString().slice(0, 10)

    // Query all cost tracking data for the last 7 days
    const { data: costData, error: costError } = await supabase
      .from('mc_agent_cost_tracking')
      .select('agent_id, org_id, date, tokens_input, tokens_output, estimated_cost_usd, run_count')
      .gte('date', since)

    if (costError) {
      console.error(`[MC:CostOptimizer] Failed to fetch cost data: ${costError.message}`)
      return
    }

    if (!costData?.length) {
      console.log('[MC:CostOptimizer] No cost data found for the last 7 days')
      return
    }

    // Aggregate per agent
    const agentMap = new Map<string, AgentCostSummary>()

    for (const row of costData) {
      const key = row.agent_id
      const existing = agentMap.get(key)

      if (existing) {
        existing.total_cost_usd += Number(row.estimated_cost_usd ?? 0)
        existing.total_tokens_input += Number(row.tokens_input ?? 0)
        existing.total_tokens_output += Number(row.tokens_output ?? 0)
        existing.total_runs += Number(row.run_count ?? 0)
        existing.days_active++
      } else {
        agentMap.set(key, {
          agent_id: row.agent_id,
          org_id: row.org_id,
          total_cost_usd: Number(row.estimated_cost_usd ?? 0),
          total_tokens_input: Number(row.tokens_input ?? 0),
          total_tokens_output: Number(row.tokens_output ?? 0),
          total_runs: Number(row.run_count ?? 0),
          days_active: 1,
        })
      }
    }

    // Group agents by org for batch processing
    const orgAgents = new Map<string, AgentCostSummary[]>()
    for (const summary of agentMap.values()) {
      const list = orgAgents.get(summary.org_id) ?? []
      list.push(summary)
      orgAgents.set(summary.org_id, list)
    }

    let totalRecommendations = 0

    for (const [orgId, agents] of orgAgents) {
      try {
        const recommendations = analyzeCosts(agents)

        if (recommendations.length === 0) continue

        // Clear old pending recommendations for this org before inserting new ones
        await supabase
          .from('mc_cost_recommendations')
          .delete()
          .eq('org_id', orgId)
          .eq('status', 'pending')

        const { error: insertError } = await supabase
          .from('mc_cost_recommendations')
          .insert(recommendations)

        if (insertError) {
          console.error(`[MC:CostOptimizer] Insert error for org ${orgId}: ${insertError.message}`)
        } else {
          totalRecommendations += recommendations.length
        }
      } catch (orgErr) {
        console.error(`[MC:CostOptimizer] Error processing org ${orgId}:`, orgErr)
      }
    }

    console.log(`[MC:CostOptimizer] Complete: ${totalRecommendations} recommendations across ${orgAgents.size} orgs`)
  } catch (err) {
    console.error('[MC:CostOptimizer] Error:', err)
  }
}
