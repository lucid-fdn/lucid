import { describe, expect, it, vi } from 'vitest'

import { createHermesNativeTransportAdapter } from '../HermesNativeTransportAdapter.js'

describe('HermesNativeTransportAdapter', () => {
  it('delegates to the shared native channel adapter implementation', async () => {
    const delegate = {
      channelType: 'telegram',
      start: vi.fn(async () => {}),
    }
    const adapter = createHermesNativeTransportAdapter('telegram', {
      delegate,
    })

    const signal = new AbortController().signal
    const handlers = {
      onMessage: async () => undefined,
    }

    await adapter.start(
      {
        accountId: 'bot-1',
        credentials: { token: 'secret' },
      },
      signal,
      handlers,
    )

    expect(delegate.start).toHaveBeenCalledWith(
      {
        accountId: 'bot-1',
        credentials: { token: 'secret' },
      },
      signal,
      handlers,
    )
  })
})
