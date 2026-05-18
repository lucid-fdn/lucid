import { describe, it, expect } from 'vitest'
import { analyzeCosts } from '../cost-optimizer'
import type { CostAnalysisInput } from '../cost-optimizer'

function makeAgent(overrides: Partial<CostAnalysisInput> = {}): CostAnalysisInput {
  return {
    agent_id: 'agent-1',
    agent_name: 'Test Agent',
    model: 'gpt-4o',
    daily_cost_usd: 0.5,
    daily_tokens_input: 50000,
    daily_tokens_output: 10000,
    avg_turns_per_conversation: 5,
    tool_call_count: 5,
    tool_error_count: 0,
    cache_hit_rate: 0.5,
    ...overrides,
  }
}

describe('analyzeCosts', () => {
  it('returns empty recommendations for no agents', () => {
    expect(analyzeCosts([])).toEqual([])
  })

  it('recommends model_switch for high-cost simple agent', () => {
    const agent = makeAgent({
      avg_turns_per_conversation: 1,
      daily_cost_usd: 10,
    })
    const recs = analyzeCosts([agent])
    const modelSwitch = recs.find((r) => r.recommendation_type === 'model_switch')
    expect(modelSwitch).toBeDefined()
    expect(modelSwitch!.agent_id).toBe('agent-1')
    // savings = 10 * (1 - 0.1) * 0.5 = 4.5
    expect(modelSwitch!.estimated_savings_usd).toBeCloseTo(4.5)
  })

  it('recommends tool_optimization for high tool error rate', () => {
    const agent = makeAgent({
      tool_call_count: 100,
      tool_error_count: 50,
      daily_cost_usd: 5,
    })
    const recs = analyzeCosts([agent])
    const toolOpt = recs.find((r) => r.recommendation_type === 'tool_optimization')
    expect(toolOpt).toBeDefined()
    expect(toolOpt!.description).toContain('50%')
  })

  it('recommends cache_improvement for low cache rate with high tokens', () => {
    const agent = makeAgent({
      cache_hit_rate: 0.1,
      daily_tokens_input: 200000,
      daily_cost_usd: 8,
    })
    const recs = analyzeCosts([agent])
    const cacheRec = recs.find((r) => r.recommendation_type === 'cache_improvement')
    expect(cacheRec).toBeDefined()
    // savings = 8 * 0.15 = 1.2
    expect(cacheRec!.estimated_savings_usd).toBeCloseTo(1.2)
  })

  it('sorts recommendations by savings descending', () => {
    const agents = [
      makeAgent({
        agent_id: 'a',
        agent_name: 'Agent A',
        avg_turns_per_conversation: 1,
        daily_cost_usd: 2,
        cache_hit_rate: 0.1,
        daily_tokens_input: 200000,
      }),
      makeAgent({
        agent_id: 'b',
        agent_name: 'Agent B',
        avg_turns_per_conversation: 1,
        daily_cost_usd: 20,
      }),
    ]
    const recs = analyzeCosts(agents)
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].estimated_savings_usd).toBeGreaterThanOrEqual(
        recs[i].estimated_savings_usd
      )
    }
  })
})
