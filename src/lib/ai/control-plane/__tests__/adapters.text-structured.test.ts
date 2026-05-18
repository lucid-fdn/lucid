import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('control-plane text and structured adapters', () => {
  it('wraps text generation execution with receipt metadata', async () => {
    const { textGenerationAdapter } = await import('../adapters/text')
    const output = await textGenerationAdapter({
      execute: () => 'hello',
      provider: 'trustgate',
      model: 'lucid-auto',
      metadata: { route: '/api/ai/chat' },
    })

    expect(output.result).toBe('hello')
    expect(output).toMatchObject({
      provider: 'trustgate',
      model: 'lucid-auto',
      receipt: {
        metadata: { route: '/api/ai/chat' },
      },
    })
  })

  it('wraps structured generation execution with receipt metadata', async () => {
    const { structuredGenerationAdapter } = await import('../adapters/structured')
    const output = await structuredGenerationAdapter({
      execute: async () => ({ nodes: [] }),
      provider: 'trustgate',
      model: 'lucid-auto',
      usage: { totalTokens: 12 },
      metadata: { route: '/api/ai/generate-workflow' },
    })

    expect(output.result).toEqual({ nodes: [] })
    expect(output).toMatchObject({
      usage: { totalTokens: 12 },
      receipt: {
        metadata: { route: '/api/ai/generate-workflow' },
      },
    })
  })
})
