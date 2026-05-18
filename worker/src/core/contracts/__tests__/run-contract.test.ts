import { describe, expect, it } from 'vitest'

import {
  normalizeEngineRunResult,
  normalizeRuntimeRunResult,
} from '../run-contract.js'

describe('run-contract normalization', () => {
  it('keeps diagnostics stable across engine and runtime normalization', () => {
    const assistant = {
      engine: 'openclaw' as const,
      runtime_flavor: 'shared' as const,
    }
    const capabilitySurface = {
      tools: { selectedCount: 2, hiddenCount: 1 },
      integrations: { activeCount: 1 },
    }

    const engineResult = normalizeEngineRunResult({
      text: 'engine response',
      usage: {
        promptTokens: 10,
        completionTokens: 6,
      },
      steps: 2,
      toolCallsUsed: 1,
      budgetExhausted: false,
      diagnostics: {
        model: 'openai/gpt-4.1',
        durationMs: 123,
        stopReason: 'end_turn',
        error: {
          kind: 'provider',
          message: 'retry later',
        },
        capabilitySurface,
      },
    }, assistant)

    const runtimeResult = normalizeRuntimeRunResult({
      text: 'runtime response',
      toolCallsUsed: 1,
      meta: {
        durationMs: 123,
        model: 'openai/gpt-4.1',
        usage: {
          input: 10,
          output: 6,
          total: 16,
        },
        stopReason: 'end_turn',
        error: {
          kind: 'provider',
          message: 'retry later',
        },
        capabilitySurface,
      },
    }, assistant)

    expect(engineResult.diagnostics).toEqual({
      model: 'openai/gpt-4.1',
      durationMs: 123,
      stopReason: 'end_turn',
      error: {
        kind: 'provider',
        message: 'retry later',
      },
      capabilitySurface,
    })
    expect(runtimeResult.diagnostics).toEqual(engineResult.diagnostics)

    expect(engineResult.source).toEqual({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      executionMode: 'engine',
    })
    expect(runtimeResult.source).toEqual({
      engine: 'openclaw',
      runtimeFlavor: 'shared',
      executionMode: 'runtime',
    })
    expect(engineResult.usage).toEqual({
      promptTokens: 10,
      completionTokens: 6,
      totalTokens: 16,
    })
    expect(runtimeResult.usage).toEqual(engineResult.usage)
  })
})
