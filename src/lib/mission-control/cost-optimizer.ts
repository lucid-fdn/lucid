/**
 * Mission Control — Cost Optimizer
 *
 * Generates cost reduction recommendations based on agent usage patterns.
 */

export interface CostAnalysisInput {
  agent_id: string
  agent_name: string
  model: string
  daily_cost_usd: number
  daily_tokens_input: number
  daily_tokens_output: number
  avg_turns_per_conversation: number
  tool_call_count: number
  tool_error_count: number
  cache_hit_rate: number
}

export interface CostRecommendation {
  recommendation_type: 'model_switch' | 'tool_optimization' | 'memory_strategy' | 'cache_improvement' | 'prompt_optimization'
  title: string
  description: string
  estimated_savings_usd: number
  agent_id: string
  agent_name: string
}

const FAST_MODEL_COST_RATIO = 0.1 // gpt-4o-mini is ~10x cheaper than strong models

export function analyzeCosts(agents: CostAnalysisInput[]): CostRecommendation[] {
  const recs: CostRecommendation[] = []

  for (const agent of agents) {
    // Model switching: if agent uses expensive model with low complexity
    if (agent.avg_turns_per_conversation <= 2 && agent.daily_cost_usd > 1) {
      const savings = agent.daily_cost_usd * (1 - FAST_MODEL_COST_RATIO) * 0.5 // 50% of traffic could route to fast
      if (savings > 0.10) {
        recs.push({
          recommendation_type: 'model_switch',
          title: `Route simple queries to fast model for ${agent.agent_name}`,
          description: `${agent.agent_name} handles many short conversations. Routing simple queries to a fast model could save ~$${savings.toFixed(2)}/day.`,
          estimated_savings_usd: savings,
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
        })
      }
    }

    // Tool optimization: high tool error rate
    if (agent.tool_call_count > 10 && agent.tool_error_count / agent.tool_call_count > 0.2) {
      const wastedCost = agent.daily_cost_usd * (agent.tool_error_count / agent.tool_call_count) * 0.3
      recs.push({
        recommendation_type: 'tool_optimization',
        title: `Fix failing tools for ${agent.agent_name}`,
        description: `${Math.round((agent.tool_error_count / agent.tool_call_count) * 100)}% of tool calls are failing, wasting tokens on retries.`,
        estimated_savings_usd: wastedCost,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
      })
    }

    // Cache improvement: low cache hit rate with high volume
    if (agent.cache_hit_rate < 0.3 && agent.daily_tokens_input > 100000) {
      const savings = agent.daily_cost_usd * 0.15
      recs.push({
        recommendation_type: 'cache_improvement',
        title: `Improve caching for ${agent.agent_name}`,
        description: `Cache hit rate is ${Math.round(agent.cache_hit_rate * 100)}%. Improving prompt caching could reduce input token costs.`,
        estimated_savings_usd: savings,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
      })
    }

    // Prompt optimization: high input token usage
    if (agent.daily_tokens_input > 500000) {
      const savings = agent.daily_cost_usd * 0.1
      recs.push({
        recommendation_type: 'prompt_optimization',
        title: `Optimize prompts for ${agent.agent_name}`,
        description: `High input token usage (${Math.round(agent.daily_tokens_input / 1000)}K/day). Review system prompt length and memory injection strategy.`,
        estimated_savings_usd: savings,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
      })
    }
  }

  return recs.sort((a, b) => b.estimated_savings_usd - a.estimated_savings_usd)
}
