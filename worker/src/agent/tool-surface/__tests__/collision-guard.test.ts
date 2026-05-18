import { describe, it, expect, vi } from 'vitest'
import { assertNoCollisions, assertUniqueClientToolNames } from '../collision-guard.js'
import type { ClientToolDefinition } from '../types.js'

// Mock sentry
vi.mock('../../../monitoring/sentry.js', () => ({
  captureMessage: vi.fn(),
}))

function makeTool(name: string): ClientToolDefinition {
  return { type: 'function', function: { name, description: `Tool ${name}` } }
}

describe('assertNoCollisions', () => {
  it('returns all clientTools when no collision', () => {
    const tools = [makeTool('cron_schedule'), makeTool('sessions_send')]
    const native = new Set(['web_search', 'web_fetch'])
    const result = assertNoCollisions(native, tools)
    expect(result).toHaveLength(2)
  })

  it('throws on collision in hard mode', () => {
    const tools = [makeTool('web_search')]
    const native = new Set(['web_search', 'web_fetch'])
    expect(() => assertNoCollisions(native, tools)).toThrow('SECURITY')
  })

  it('soft-fail removes colliding tools and returns the rest', () => {
    const tools = [makeTool('web_search'), makeTool('cron_schedule')]
    const native = new Set(['web_search', 'web_fetch'])
    const result = assertNoCollisions(native, tools, { softFail: true })
    expect(result).toHaveLength(1)
    expect(result[0].function.name).toBe('cron_schedule')
  })
})

describe('assertUniqueClientToolNames', () => {
  it('passes with unique names', () => {
    const tools = [makeTool('a'), makeTool('b'), makeTool('c')]
    expect(() => assertUniqueClientToolNames(tools, 'merged')).not.toThrow()
  })

  it('throws on duplicates with context-aware message', () => {
    const tools = [makeTool('a'), makeTool('a')]
    expect(() => assertUniqueClientToolNames(tools, 'plugin')).toThrow('plugin')
    expect(() => assertUniqueClientToolNames(tools, 'builtin')).toThrow('builtin')
  })
})
