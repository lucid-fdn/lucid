/**
 * Executor Registry — Unit Tests
 *
 * Tests: registration, first-match resolution, null for unknown, multiple executors.
 */

import { describe, it, expect } from 'vitest'
import { ExecutorRegistry } from '../executors/registry.js'
import type { StepExecutor, StepExecutionContext } from '../executors/types.js'

// ─── Mock Executors ──────────────────────────────────────────────────────────

function createMockExecutor(type: string, handles: string[]): StepExecutor {
  return {
    type,
    canHandle: (stepType: string) => handles.includes(stepType),
    execute: async () => {},
  }
}

describe('ExecutorRegistry', () => {
  it('resolves null for empty registry', () => {
    const registry = new ExecutorRegistry()
    expect(registry.resolve('inbound')).toBeNull()
  })

  it('resolves registered executor by stepType', () => {
    const registry = new ExecutorRegistry()
    const executor = createMockExecutor('processor', ['inbound', 'outbound', 'scheduled'])
    registry.register(executor)

    expect(registry.resolve('inbound')).toBe(executor)
    expect(registry.resolve('outbound')).toBe(executor)
    expect(registry.resolve('scheduled')).toBe(executor)
  })

  it('returns null for unregistered stepType', () => {
    const registry = new ExecutorRegistry()
    registry.register(createMockExecutor('processor', ['inbound']))

    expect(registry.resolve('webhook')).toBeNull()
    expect(registry.resolve('approval')).toBeNull()
    expect(registry.resolve('unknown')).toBeNull()
  })

  it('uses first-match semantics', () => {
    const registry = new ExecutorRegistry()
    const webhookExec = createMockExecutor('webhook', ['webhook'])
    const catchAll = createMockExecutor('processor', ['webhook', 'inbound'])

    registry.register(webhookExec)
    registry.register(catchAll)

    // webhook matches the first registered executor
    expect(registry.resolve('webhook')).toBe(webhookExec)
    // inbound only matches the catch-all
    expect(registry.resolve('inbound')).toBe(catchAll)
  })

  it('supports multiple specialized executors', () => {
    const registry = new ExecutorRegistry()
    const webhookExec = createMockExecutor('webhook', ['webhook'])
    const approvalExec = createMockExecutor('approval', ['approval'])
    const processorExec = createMockExecutor('processor', ['inbound', 'outbound', 'scheduled'])

    registry.register(webhookExec)
    registry.register(approvalExec)
    registry.register(processorExec)

    expect(registry.resolve('webhook')?.type).toBe('webhook')
    expect(registry.resolve('approval')?.type).toBe('approval')
    expect(registry.resolve('inbound')?.type).toBe('processor')
    expect(registry.resolve('outbound')?.type).toBe('processor')
    expect(registry.resolve('scheduled')?.type).toBe('processor')
    expect(registry.resolve('unknown')).toBeNull()
  })

  it('registration order determines priority', () => {
    const registry = new ExecutorRegistry()
    const first = createMockExecutor('first', ['inbound'])
    const second = createMockExecutor('second', ['inbound'])

    registry.register(first)
    registry.register(second)

    expect(registry.resolve('inbound')).toBe(first)
  })

  it('handles executor that handles nothing', () => {
    const registry = new ExecutorRegistry()
    registry.register(createMockExecutor('empty', []))

    expect(registry.resolve('inbound')).toBeNull()
    expect(registry.resolve('webhook')).toBeNull()
  })

  it('handles executor that handles everything', () => {
    const registry = new ExecutorRegistry()
    const catchAll: StepExecutor = {
      type: 'catch-all',
      canHandle: () => true,
      execute: async () => {},
    }
    registry.register(catchAll)

    expect(registry.resolve('inbound')).toBe(catchAll)
    expect(registry.resolve('webhook')).toBe(catchAll)
    expect(registry.resolve('anything')).toBe(catchAll)
  })
})
