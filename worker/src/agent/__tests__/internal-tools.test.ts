import { describe, it, expect, vi } from 'vitest'
import { tradingPolicySchema } from '../internal-tools/trading/policy.schema.js'
import { executeTradingPolicyTool } from '../internal-tools/trading/policy.js'

describe('tradingPolicySchema', () => {
  it('has correct name', () => {
    expect(tradingPolicySchema.name).toBe('get_trading_policy')
  })

  it('is marked as safe', () => {
    expect(tradingPolicySchema.dangerLevel).toBe('safe')
  })

  it('has enrichment metadata', () => {
    expect(tradingPolicySchema.when_to_use).toBeDefined()
    expect(tradingPolicySchema.when_to_use.length).toBeGreaterThan(0)
  })
})

describe('executeTradingPolicyTool', () => {
  it('returns disabled message when no policy exists', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      }),
    })

    const result = await executeTradingPolicyTool({
      supabase: { from: mockFrom } as any,
      userId: 'test-user',
      assistant: { id: 'test-assistant' } as any,
    } as any)

    const parsed = JSON.parse(result)
    expect(parsed.enabled).toBe(false)
    expect(parsed.message).toBeDefined()
  })
})
