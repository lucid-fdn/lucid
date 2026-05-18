import { describe, expect, it } from 'vitest'
import { selectClientTools } from '../selector.js'
import type { ClientToolDefinition } from '../types.js'

function tool(name: string): ClientToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `${name} description`,
    },
  }
}

describe('selectClientTools', () => {
  it('keeps all tools when provider has no configured cap', () => {
    const tools = [tool('wallet_balance'), tool('github__list_issues')]
    const selected = selectClientTools(tools, {
      engine: 'hermes',
      model: 'claude-3-7-sonnet',
    })

    expect(selected.clientTools).toEqual(tools)
    expect(selected.selection.provider).toBe('anthropic')
    expect(selected.selection.selectedCount).toBe(2)
    expect(selected.selection.maxClientTools).toBeUndefined()
    expect(selected.selection.decisions.every((decision) => decision.included)).toBe(true)
  })

  it('caps openai tool surfaces to a provider-safe budget with built-ins first', () => {
    const builtIns = [
      tool('wallet_balance'),
      tool('wallet_transfer'),
      tool('spawn_subagent'),
      tool('crew_complete'),
    ]
    const plugins = Array.from({ length: 130 }, (_, index) => tool(`github__tool_${index}`))
    const selected = selectClientTools([...plugins, ...builtIns], {
      engine: 'openclaw',
      model: 'openai/gpt-4.1',
      reservedToolSlots: 4,
    }, {
      prioritizedToolNames: new Set(builtIns.map((entry) => entry.function.name)),
    })

    expect(selected.selection.provider).toBe('openai')
    expect(selected.selection.originalCount).toBe(134)
    expect(selected.selection.selectedCount).toBe(124)
    expect(selected.selection.maxClientTools).toBe(124)
    expect(selected.selection.reservedToolSlots).toBe(4)
    expect(selected.clientTools.slice(0, 4).map((entry) => entry.function.name)).toEqual(
      builtIns.map((entry) => entry.function.name),
    )
    expect(selected.clientTools).toHaveLength(124)
    expect(selected.selection.decisions.filter((decision) => !decision.included)).toHaveLength(10)
    expect(selected.selection.decisions.at(-1)?.reason).toBe('provider_budget')
  })

  it('reserves provider-visible tool slots when explicitly requested by the engine context', () => {
    const tools = Array.from({ length: 128 }, (_, index) => tool(`github__tool_${index}`))
    const selected = selectClientTools(tools, {
      engine: 'openclaw',
      model: 'openai/gpt-4.1',
      reservedToolSlots: 4,
    })

    expect(selected.clientTools).toHaveLength(124)
    expect(selected.selection.maxClientTools).toBe(124)
    expect(selected.selection.reservedToolSlots).toBe(4)
  })

  it('records unknown-provider selections without trimming', () => {
    const tools = [tool('wallet_balance'), tool('notion__search')]
    const selected = selectClientTools(tools, {
      engine: 'openclaw',
      model: 'lucid-auto',
    })

    expect(selected.clientTools).toEqual(tools)
    expect(selected.selection.provider).toBe('unknown')
    expect(selected.selection.decisions.every((decision) => decision.reason === 'unknown_provider')).toBe(true)
  })
})
