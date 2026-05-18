import { describe, expect, it } from 'vitest'

import {
  normalizeAgentOpsChannelCommandArg,
  parseChannelNativeCommand,
  listChannelNativeCommandChoices,
} from '../channel-native'

describe('channel-native commands', () => {
  it('normalizes check, research, and plan into Agent Ops commands', () => {
    expect(parseChannelNativeCommand('check https://example.com')).toEqual({
      kind: 'agent_ops',
      command: {
        workflowId: 'check-page',
        target: 'https://example.com',
        runMode: undefined,
        intent: 'agent_ops',
      },
    })
    expect(parseChannelNativeCommand('research pricing pages')).toEqual({
      kind: 'agent_ops',
      command: {
        workflowId: 'research-site',
        target: 'pricing pages',
        runMode: undefined,
        intent: 'knowledge_think',
      },
    })
    expect(parseChannelNativeCommand('plan release readiness')).toEqual({
      kind: 'agent_ops',
      command: {
        workflowId: 'autoplan',
        target: 'release readiness',
        runMode: 'plan_only',
        intent: 'plan_only',
      },
    })
    expect(parseChannelNativeCommand('buy weekly groceries under $120 from Carrefour')).toEqual({
      kind: 'agent_ops',
      command: {
        workflowId: 'buy-stuff',
        target: 'weekly groceries under $120 from Carrefour',
        runMode: 'handoff',
        intent: 'agent_ops',
      },
    })
  })

  it('normalizes search, remember, claims, and forget into Knowledge-native actions', () => {
    expect(parseChannelNativeCommand('search release blockers')).toEqual({
      kind: 'global_search',
      query: 'release blockers',
    })
    expect(parseChannelNativeCommand('remember Finance approval is required')).toEqual({
      kind: 'knowledge_remember',
      text: 'Finance approval is required',
    })
    expect(parseChannelNativeCommand('claims pricing risk')).toEqual({
      kind: 'knowledge_claims',
      query: 'pricing risk',
    })
    expect(parseChannelNativeCommand('claims')).toEqual({
      kind: 'knowledge_claims',
      query: null,
    })
    expect(parseChannelNativeCommand('forget 11111111-1111-4111-8111-111111111111')).toEqual({
      kind: 'knowledge_forget',
      id: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('normalizes first-party capability template commands', () => {
    expect(parseChannelNativeCommand('whales watched wallet moved 2,100 ETH to Coinbase')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'whales',
        prompt: 'watched wallet moved 2,100 ETH to Coinbase',
        templateKey: 'web3-whale-watchtower',
        workflowId: 'web3-whale-watchtower-brief',
      }),
    })
    expect(parseChannelNativeCommand('token LUCID liquidity fell')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'token',
        templateKey: 'web3-token-war-room',
      }),
    })
    expect(parseChannelNativeCommand('markets probability moved 41% to 57%')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'markets',
        templateKey: 'web3-prediction-market-alpha-desk',
      }),
    })
    expect(parseChannelNativeCommand('portfolio review 42% concentration')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'portfolio',
        templateKey: 'web3-portfolio-risk-agent',
      }),
    })
    expect(parseChannelNativeCommand('copy draft a smart-wallet copy plan')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'copy',
        templateKey: 'web3-smart-wallet-copy-desk',
      }),
    })
    expect(parseChannelNativeCommand('web3 daily operating brief')).toEqual({
      kind: 'capability_template',
      command: expect.objectContaining({
        command: 'web3',
        templateKey: 'web3-intelligence-suite',
      }),
    })
  })

  it('accepts direct short commands without the ops wrapper', () => {
    expect(normalizeAgentOpsChannelCommandArg('search browser operator')).toBe('search browser operator')
    expect(normalizeAgentOpsChannelCommandArg('remember Use evidence-backed claims')).toBe('remember Use evidence-backed claims')
    expect(normalizeAgentOpsChannelCommandArg('claims')).toBe('claims')
    expect(normalizeAgentOpsChannelCommandArg('forget 11111111-1111-4111-8111-111111111111')).toBe('forget 11111111-1111-4111-8111-111111111111')
    expect(normalizeAgentOpsChannelCommandArg('whales watched wallet moved to Coinbase')).toBe('whales watched wallet moved to Coinbase')
  })

  it('lists capability template commands in native command choices', () => {
    expect(listChannelNativeCommandChoices('wh')).toEqual([
      expect.objectContaining({ name: expect.stringContaining('Whale Watchtower'), value: 'whales' }),
    ])
  })
})
