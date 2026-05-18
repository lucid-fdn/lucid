import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { CreateLaunchedAgentInput } from '../../../../contracts/launchpad'

/**
 * SDK Launch input validation tests.
 * Tests the SDKLaunchInput schema used by the permissionless launch endpoint.
 */

const SDKLaunchInput = CreateLaunchedAgentInput.extend({
  system_prompt: z.string().max(10000).optional(),
  activate: z.boolean().optional().default(true),
})

describe('SDKLaunchInput', () => {
  it('accepts minimal valid input', () => {
    const result = SDKLaunchInput.safeParse({
      creator_wallet: 'Wallet111111111111111111111111111111111111111',
      slug: 'my-agent',
      display_name: 'My Agent',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activate).toBe(true) // Default
    }
  })

  it('accepts full input with all optional fields', () => {
    const result = SDKLaunchInput.safeParse({
      creator_wallet: 'Wallet111111111111111111111111111111111111111',
      slug: 'trading-bot',
      display_name: 'Trading Bot',
      description: 'An autonomous trading agent',
      category: 'trading',
      tags: ['defi', 'trading'],
      token_supply: 500_000_000,
      price_per_request: 0.05,
      system_prompt: 'You are a trading bot that...',
      activate: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activate).toBe(false)
      expect(result.data.system_prompt).toBe('You are a trading bot that...')
    }
  })

  it('rejects invalid slug format', () => {
    const result = SDKLaunchInput.safeParse({
      creator_wallet: 'Wallet111111111111111111111111111111111111111',
      slug: 'INVALID SLUG!',
      display_name: 'Bad Slug',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const result = SDKLaunchInput.safeParse({
      slug: 'test',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative price', () => {
    const result = SDKLaunchInput.safeParse({
      creator_wallet: 'Wallet111111111111111111111111111111111111111',
      slug: 'test',
      display_name: 'Test',
      price_per_request: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects excessive creator allocation', () => {
    const result = SDKLaunchInput.safeParse({
      creator_wallet: 'Wallet111111111111111111111111111111111111111',
      slug: 'test',
      display_name: 'Test',
      creator_alloc_bps: 6000, // Max is 5000 (50%)
    })
    expect(result.success).toBe(false)
  })
})
