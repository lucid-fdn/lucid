import { describe, it, expect } from 'vitest'
import { buildToolPrompt } from '@lucid-fdn/agent-tools-core'
import type { EnrichedToolDefinition } from '@lucid-fdn/agent-tools-core'

const mockReadTool: EnrichedToolDefinition = {
  name: 'get_price',
  description: 'Get current USD price of a token',
  category: 'read',
  dangerLevel: 'safe',
  parameters: { type: 'object', properties: { chain: { type: 'string' } } },
  when_to_use: ['user asks "price of X"', 'need current value before swap', 'third trigger that should be capped'],
  examples: [
    { user: 'what is SOL worth?', tool_call: { chain: 'solana', address: 'SOL' } },
    { user: 'ETH price', tool_call: { chain: 'ethereum', address: 'ETH' } },
  ],
  related_tools: ['search_token'],
}

const mockActTool: EnrichedToolDefinition = {
  name: 'dex_swap',
  description: 'Execute a token swap via DEX aggregator',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: { type: 'object', properties: {} },
  when_to_use: ['user wants to swap tokens'],
  requires_confirmation: true,
  related_tools: ['dex_get_quote', 'risk_check'],
}

const mockReasonTool: EnrichedToolDefinition = {
  name: 'risk_check',
  description: 'Assess risk before trading',
  category: 'reason',
  dangerLevel: 'safe',
  parameters: { type: 'object', properties: {} },
  when_to_use: ['before any trade to assess safety'],
}

describe('buildToolPrompt', () => {
  it('includes tool name and description', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('get_price')
    expect(result).toContain('Get current USD price of a token')
  })

  it('includes when_to_use triggers (capped at 2)', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('user asks "price of X"')
    expect(result).toContain('need current value before swap')
    // Third trigger should be omitted (cap at 2)
    expect(result).not.toContain('third trigger that should be capped')
  })

  it('includes first example only', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('what is SOL worth?')
    // Second example should be omitted
    expect(result).not.toContain('ETH price')
  })

  it('includes related_tools as hints', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('search_token')
  })

  it('marks elevated tools that require confirmation', () => {
    const result = buildToolPrompt([mockActTool])
    expect(result).toContain('requires confirmation')
  })

  it('returns empty string for empty array', () => {
    expect(buildToolPrompt([])).toBe('')
  })

  it('groups and sorts by category: read before reason before act', () => {
    // Pass in wrong order — output should be sorted
    const result = buildToolPrompt([mockActTool, mockReadTool, mockReasonTool])
    const readPos = result.indexOf('get_price')
    const reasonPos = result.indexOf('risk_check')
    const actPos = result.indexOf('dex_swap')
    expect(readPos).toBeLessThan(reasonPos)
    expect(reasonPos).toBeLessThan(actPos)
  })

  it('does not contain undefined or null strings', () => {
    const result = buildToolPrompt([mockReadTool, mockActTool, mockReasonTool])
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
  })
})
