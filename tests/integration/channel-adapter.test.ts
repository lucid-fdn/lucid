import { describe, it, expect, vi, afterAll } from 'vitest'
import { OpenClawChannelAdapter, type OpenClawOutbound } from '../../worker/src/channels/ChannelAdapter.js'
import type { ChannelOutputConfig } from '../../worker/src/channels/ChannelOutput.js'

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

afterAll(() => {
  consoleErrorSpy.mockRestore()
})

function baseConfig(overrides: Partial<ChannelOutputConfig> = {}): ChannelOutputConfig {
  return {
    channelId: 'ch_1',
    chatId: 'chat_1',
    botToken: 'token',
    channelType: 'telegram',
    ...overrides,
  }
}

function makeOutbound(overrides: Partial<OpenClawOutbound> = {}): OpenClawOutbound {
  return {
    deliveryMode: 'streamed',
    chunker: (text, limit) => (text.length <= limit ? [text] : [text.slice(0, limit), text.slice(limit)]),
    chunkerMode: 'markdown',
    textChunkLimit: 10,
    sendText: vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' })),
    editText: vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' })),
    ...overrides,
  }
}

describe('OpenClawChannelAdapter', () => {
  it('does not send placeholder when stream editing cannot be guaranteed', async () => {
    const outbound = makeOutbound({
      deliveryMode: 'streamed',
      editText: undefined,
      sendText: vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' })),
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    const ref = await adapter.begin()
    expect(ref).toBeNull()
    expect(outbound.sendText).not.toHaveBeenCalled()
  })

  it('waits for in-flight flush before finalize edit (no flush/finalize race)', async () => {
    let resolveSend: (() => void) | null = null
    const firstSend = new Promise<void>((resolve) => {
      resolveSend = resolve
    })

    const sendText = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstSend
        return { channel: 'telegram', messageId: 'm1' }
      })
      .mockImplementationOnce(async () => ({ channel: 'telegram', messageId: 'm2' }))

    const editText = vi
      .fn()
      .mockImplementationOnce(async () => ({ channel: 'telegram', messageId: 'm1' }))

    const outbound = makeOutbound({
      sendText,
      editText,
      chunkerMode: 'plain',
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true, minBufferSize: 1 },
      baseConfig(),
    )

    await adapter.begin()
    await adapter.append('abcdefghijklmnopqrstuvwxyz1234')

    const flushPromise = (adapter as any).flush()
    const finalizePromise = adapter.finalize('final text')

    // finalize should be blocked waiting for the in-flight flush
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(editText).toHaveBeenCalledTimes(0)
    resolveSend?.()

    await flushPromise
    await finalizePromise

    expect(editText).toHaveBeenCalledTimes(1)
    const finalCall = editText.mock.calls[0][0]
    expect(finalCall.text).toBe('final text')
  })

  it('falls back to sendText chunks when finalize edit fails', async () => {
    const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
    const editText = vi.fn(async () => {
      throw new Error('edit failed')
    })

    const outbound = makeOutbound({
      sendText,
      editText,
      chunkerMode: 'plain',
      textChunkLimit: 50,
      chunker: (text) => [text],
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    await adapter.begin()
    await adapter.append('abcdefghijklmnopqrstuvwxyz1234')
    await (adapter as any).flush()
    await adapter.finalize('delivered via fallback')

    // 1st call = initial preview, 2nd call = fallback final delivery
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText.mock.calls[1][0].text).toBe('delivered via fallback')
  })

  it('forwards accountId/threadId/deps through outbound params', async () => {
    const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
    const outbound = makeOutbound({
      deliveryMode: 'direct',
      sendText,
      editText: undefined,
      textChunkLimit: 100,
      chunker: (text) => [text],
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      baseConfig({
        accountId: 'acct_123',
        threadId: 'thread_456',
        deps: { injected: true },
      }),
    )

    await adapter.finalize('hello')

    expect(sendText).toHaveBeenCalledTimes(1)
    const params = sendText.mock.calls[0][0]
    expect(params.accountId).toBe('acct_123')
    expect(params.threadId).toBe('thread_456')
    expect(params.deps).toEqual({ injected: true })
  })

  it('suppresses streaming for markdown mode and sends only on finalize', async () => {
    const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
    const editText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
    const outbound = makeOutbound({
      deliveryMode: 'streamed',
      chunkerMode: 'markdown',
      sendText,
      editText,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    const ref = await adapter.begin()
    expect(ref).toBeNull()
    expect(sendText).not.toHaveBeenCalled()

    await adapter.append('```ts\nconst a = 1')
    await adapter.finalize('```ts\nconst a = 1\n```')

    expect(sendText).toHaveBeenCalledTimes(2)
    expect(editText).not.toHaveBeenCalled()
  })

  it('applies edit backoff after 429/rate-limit failure', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
      const editText = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValue({ channel: 'telegram', messageId: 'm1' })

      const outbound = makeOutbound({
        chunkerMode: 'plain',
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 1 },
        baseConfig(),
      )

      await adapter.begin()
      await adapter.append('abcdefghijklmnopqrstuvwxyz1234')
      await (adapter as any).flush()
      expect(sendText).toHaveBeenCalledTimes(1)

      await adapter.append(' more')
      await (adapter as any).flush()
      expect(editText).toHaveBeenCalledTimes(1)

      // During backoff window, flush should no-op
      await (adapter as any).flush()
      expect(editText).toHaveBeenCalledTimes(1)

      // Advance beyond exponential backoff (100 * 2^1 = 200ms)
      vi.advanceTimersByTime(250)
      await (adapter as any).flush()
      expect(editText).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is finalize-idempotent (second finalize is a no-op)', async () => {
    const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
    const outbound = makeOutbound({
      deliveryMode: 'direct',
      chunkerMode: 'plain',
      sendText,
      editText: undefined,
      textChunkLimit: 100,
      chunker: (text) => [text],
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      baseConfig(),
    )

    await adapter.finalize('hello once')
    await adapter.finalize('hello twice')

    expect(sendText).toHaveBeenCalledTimes(1)
    const firstCall = sendText.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    expect(firstCall?.[0]?.text).toBe('hello once')
  })

  it('treats sendText soft failure (ok=false) as a finalized delivery failure', async () => {
    const sendText = vi
      .fn()
      .mockResolvedValueOnce({ channel: 'telegram', messageId: 'm1' })
      .mockResolvedValueOnce({ channel: 'telegram', ok: false, error: 'denied' })
      .mockResolvedValueOnce({ channel: 'telegram', messageId: 'm2' })

    const editText = vi.fn(async () => {
      throw new Error('edit failed')
    })

    const outbound = makeOutbound({
      sendText,
      editText,
      chunkerMode: 'plain',
      chunker: () => ['part-a', 'part-b'],
      textChunkLimit: 999,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    await adapter.begin()
    await adapter.append('abcdefghijklmnopqrstuvwxyz1234')
    await (adapter as any).flush()
    await expect(adapter.finalize('ignored by custom chunker')).rejects.toThrow('sendText failed: denied')

    // initial preview + first fallback attempt; soft failure is surfaced so the
    // caller can retry/mark delivery failed instead of silently dropping text.
    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('does not buffer appends when streaming is suppressed', async () => {
    const outbound = makeOutbound({ chunkerMode: 'markdown' })
    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    await adapter.append('delta-1')
    await adapter.append('delta-2')

    expect((adapter as any).buffer).toBe('')
  })

  it('disables streaming when begin returns no messageId', async () => {
    const sendText = vi.fn(async () => ({ channel: 'telegram' }))
    const outbound = makeOutbound({
      chunkerMode: 'plain',
      sendText,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true },
      baseConfig(),
    )

    const ref = await adapter.begin()
    expect(ref).toBeNull()
    expect((adapter as any).streamingActive).toBe(true)

    await adapter.append('abcdefghijklmnopqrstuvwxyz1234')
    await (adapter as any).flush()
    expect((adapter as any).streamingActive).toBe(false)

    await adapter.append('should-not-buffer')
    expect((adapter as any).buffer).toBe('abcdefghijklmnopqrstuvwxyz1234')

    await adapter.finalize('final text')
    expect(sendText).toHaveBeenCalledTimes(2) // preview attempt + finalize send
  })

  it('finalize does not hang when flushInFlight never resolves', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi.fn(async () => ({ channel: 'telegram', messageId: 'm1' }))
      const outbound = makeOutbound({
        deliveryMode: 'direct',
        chunkerMode: 'plain',
        sendText,
        editText: undefined,
        textChunkLimit: 100,
        chunker: (text) => [text],
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: false },
        baseConfig(),
      )

      ;(adapter as any).flushInFlight = new Promise<void>(() => {
        // never resolves
      })

      const finalizePromise = adapter.finalize('no-hang')
      vi.advanceTimersByTime(2100)
      await finalizePromise

      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendText.mock.calls[0][0].text).toBe('no-hang')
    } finally {
      vi.useRealTimers()
    }
  })
})
