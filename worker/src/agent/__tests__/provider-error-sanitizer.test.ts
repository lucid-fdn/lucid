import { describe, expect, it, vi } from 'vitest'

vi.mock('@lucid/openclaw-runtime', () => ({
  runEmbeddedPiAgent: vi.fn(),
}))

vi.mock('../runtime/index.js', () => ({
  getRuntime: vi.fn(),
}))

vi.mock('../PluginBridge.js', () => ({
  executePluginTool: vi.fn(),
}))

vi.mock('../BuiltInToolExecutor.js', () => ({
  executeBuiltInTool: vi.fn(),
  isBuiltInTool: vi.fn(() => false),
  resetRunToolCalls: vi.fn(),
}))

import { sanitizeProviderError } from '../OpenClawAgent.js'

describe('OpenClaw provider error sanitizer', () => {
  it('hides raw LiteLLM routing errors from assistant replies', () => {
    expect(
      sanitizeProviderError(
        'HTTP 400: "LiteLLM error (400): no healthy deployments for model_group=lucid-auto"',
      ),
    ).toBe('The AI service is temporarily unavailable. Please try again in a moment.')
  })
})
