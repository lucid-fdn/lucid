import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { OpenClawChannelAdapter, type OpenClawOutbound } from '../ChannelAdapter.js'

function makeConfig() {
  return {
    channelId: 'channel-1',
    chatId: 'chat-1',
    botToken: 'token',
    channelType: 'telegram' as const,
    replyToMessageId: '123',
  }
}

function makeOutbound(overrides: Partial<OpenClawOutbound> = {}): OpenClawOutbound {
  return {
    deliveryMode: 'direct',
    chunker: (text) => [text],
    chunkerMode: 'plain',
    textChunkLimit: 4096,
    sendText: vi.fn().mockResolvedValue({ channel: 'telegram', ok: true, messageId: '42' }),
    ...overrides,
  }
}

describe('OpenClawChannelAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when finalize delivery fails', async () => {
    const outbound = makeOutbound({
      sendText: vi.fn().mockResolvedValue({ channel: 'telegram', ok: false, error: 'forbidden' }),
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      makeConfig(),
    )

    await expect(adapter.finalize('hello')).rejects.toThrow(/forbidden/)
  })

  it('throws when error delivery fails', async () => {
    const outbound = makeOutbound({
      sendText: vi.fn().mockResolvedValue({ channel: 'telegram', ok: false, error: 'blocked' }),
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      makeConfig(),
    )

    await expect(adapter.error(new Error('boom'))).rejects.toThrow(/blocked/)
  })

  it('streams Discord previews with send then edit before finalizing', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValueOnce({ channel: 'discord', ok: true, messageId: 'msg-0', chatId: 'channel-1' })
        .mockResolvedValueOnce({ channel: 'discord', ok: true, messageId: 'msg-1', chatId: 'channel-1' })
      const editText = vi.fn().mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-1' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 2000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'channel-1',
          botToken: 'token',
          channelType: 'discord',
          replyToMessageId: '123',
        },
      )

      await adapter.begin()

      expect(sendText).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'channel:channel-1',
          text: 'Lucid is thinking…',
        }),
      )

      await adapter.append('Hello from Discord')
      await vi.advanceTimersByTimeAsync(100)

      expect(editText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'channel-1',
          messageId: 'msg-0',
          text: 'Hello from Discord ▍',
        }),
      )

      await adapter.append(' streaming')
      await vi.advanceTimersByTimeAsync(100)

      expect(editText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'channel-1',
          messageId: 'msg-0',
          text: 'Hello from Discord streaming ▍',
        }),
      )

      await adapter.finalize('Hello from Discord streaming')

      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          to: 'channel-1',
          messageId: 'msg-0',
          text: 'Hello from Discord streaming',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses transient status previews without keeping them in the final answer', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValueOnce({ channel: 'discord', ok: true, messageId: 'msg-0', chatId: 'channel-1' })
      const editText = vi.fn().mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-0' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 2000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'channel-1',
          botToken: 'token',
          channelType: 'discord',
          replyToMessageId: '123',
        },
      )

      await adapter.begin()
      await adapter.status('Checking live market data')
      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          messageId: 'msg-0',
          text: 'Checking live market data ▍',
        }),
      )

      await adapter.append('Final answer starts here')
      await vi.advanceTimersByTimeAsync(0)

      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          messageId: 'msg-0',
          text: 'Final answer starts here ▍',
        }),
      )

      await adapter.finalize('Final answer starts here')
      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          messageId: 'msg-0',
          text: 'Final answer starts here',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders semantic status labels even when channel is in progress streaming mode', async () => {
    const sendText = vi
      .fn()
      .mockResolvedValueOnce({ channel: 'discord', ok: true, messageId: 'msg-0', chatId: 'channel-1' })
    const editText = vi.fn().mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-0' })
    const outbound = makeOutbound({
      deliveryMode: 'streamed',
      chunkerMode: 'plain',
      textChunkLimit: 2000,
      sendText,
      editText,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
      {
        channelId: 'channel-1',
        chatId: 'channel-1',
        botToken: 'token',
        channelType: 'discord',
        discordStreamingMode: 'progress',
      },
    )

    await adapter.begin()
    await adapter.status('Checking live market data')

    expect(editText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messageId: 'msg-0',
        text: 'Checking live market data ▍',
      }),
    )
  })

  it('edits the Discord placeholder even for very short first replies', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValueOnce({ channel: 'discord', ok: true, messageId: 'msg-0', chatId: 'channel-1' })
      const editText = vi.fn().mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-0' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 2000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 250, minBufferSize: 80, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'channel-1',
          botToken: 'token',
          channelType: 'discord',
          replyToMessageId: '123',
        },
      )

      await adapter.begin()
      await adapter.append('Hi')
      await vi.advanceTimersByTimeAsync(0)

      expect(editText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'channel-1',
          messageId: 'msg-0',
          text: 'Hi ▍',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('streams Slack previews with send then edit before finalizing', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'slack', ok: true, messageId: '171.0001', chatId: 'C123' })
      const editText = vi
        .fn()
        .mockResolvedValue({ channel: 'slack', ok: true, messageId: '171.0001', chatId: 'C123' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'C123',
          botToken: 'token',
          channelType: 'slack',
          threadId: '171.0000',
        },
      )

      await adapter.begin()

      expect(sendText).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'C123',
          text: 'Lucid is thinking…',
          threadId: '171.0000',
        }),
      )

      await adapter.append('Hello from Slack')
      await vi.advanceTimersByTimeAsync(100)

      expect(editText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'C123',
          messageId: '171.0001',
          text: 'Hello from Slack ▍',
          threadId: '171.0000',
        }),
      )

      await adapter.append(' streaming')
      await vi.advanceTimersByTimeAsync(100)

      expect(editText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'C123',
          messageId: '171.0001',
          text: 'Hello from Slack streaming ▍',
          threadId: '171.0000',
        }),
      )

      await adapter.finalize('Hello from Slack streaming')

      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          to: 'C123',
          messageId: '171.0001',
          text: 'Hello from Slack streaming',
          threadId: '171.0000',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses Slack native streaming when partial mode and thread context allow it', async () => {
    vi.useFakeTimers()
    try {
      const startNativeStream = vi.fn().mockResolvedValue({
        channel: 'slack',
        ok: true,
        streamId: 'stream-1',
      })
      const appendNativeStream = vi.fn().mockResolvedValue({ channel: 'slack', ok: true })
      const stopNativeStream = vi.fn().mockResolvedValue({ channel: 'slack', ok: true })
      const sendText = vi.fn()
      const editText = vi.fn()
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
        startNativeStream,
        appendNativeStream,
        stopNativeStream,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'C123',
          botToken: 'token',
          channelType: 'slack',
          threadId: '171.0000',
          slackStreamingMode: 'partial',
          slackNativeStreaming: true,
          slackRecipientTeamId: 'T123',
          slackRecipientUserId: 'U123',
        },
      )

      await adapter.begin()
      await adapter.append('Hello from Slack')
      await vi.advanceTimersByTimeAsync(100)

      expect(startNativeStream).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello from Slack',
          recipientTeamId: 'T123',
          recipientUserId: 'U123',
          threadId: '171.0000',
        }),
      )

      await adapter.append(' streaming')
      await vi.advanceTimersByTimeAsync(100)

      expect(appendNativeStream).toHaveBeenCalledWith({
        streamId: 'stream-1',
        text: ' streaming',
      })

      await adapter.finalize('Hello from Slack streaming complete')

      expect(stopNativeStream).toHaveBeenCalledWith({
        streamId: 'stream-1',
        text: ' complete',
      })
      expect(sendText).not.toHaveBeenCalled()
      expect(editText).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses Slack assistant thread status instead of sending status text when available', async () => {
    const sendText = vi.fn()
    const editText = vi.fn()
    const setNativeStatus = vi.fn().mockResolvedValue({ channel: 'slack', ok: true })
    const outbound = makeOutbound({
      deliveryMode: 'streamed',
      chunkerMode: 'plain',
      textChunkLimit: 40000,
      sendText,
      editText,
      setNativeStatus,
      startNativeStream: vi.fn(),
      appendNativeStream: vi.fn(),
      stopNativeStream: vi.fn(),
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
      {
        channelId: 'channel-1',
        chatId: 'C123',
        botToken: 'token',
        channelType: 'slack',
        threadId: '171.0000',
        slackStreamingMode: 'partial',
        slackNativeStreaming: true,
      },
    )

    await adapter.status('Checking live market data')

    expect(setNativeStatus).toHaveBeenCalledWith({
      channel: 'C123',
      threadTs: '171.0000',
      status: 'is checking live market data',
    })
    expect(sendText).not.toHaveBeenCalled()
    expect(editText).not.toHaveBeenCalled()
  })

  it('uses append-style Slack block streaming previews before final delivery', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'slack', ok: true, messageId: '171.0001', chatId: 'C123' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'C123',
          botToken: 'token',
          channelType: 'slack',
          threadId: '171.0000',
          slackStreamingMode: 'block',
        },
      )

      await adapter.begin()

      expect(sendText).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'C123',
          text: 'Lucid is thinking…',
          threadId: '171.0000',
        }),
      )

      await adapter.append('Preview block one')
      await vi.advanceTimersByTimeAsync(100)

      expect(sendText).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: 'C123',
          text: 'Preview block one',
          threadId: '171.0000',
        }),
      )

      await adapter.finalize('Preview block one and final reply')

      expect(sendText).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          to: 'C123',
          text: 'Preview block one and final reply',
          threadId: '171.0000',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses Slack progress mode status previews before finalizing full text', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'slack', ok: true, messageId: '171.0001', chatId: 'C123' })
      const editText = vi
        .fn()
        .mockResolvedValue({ channel: 'slack', ok: true, messageId: '171.0001', chatId: 'C123' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'C123',
          botToken: 'token',
          channelType: 'slack',
          threadId: '171.0000',
          slackStreamingMode: 'progress',
        },
      )

      await adapter.begin()
      await adapter.append('Hello from Slack')
      await vi.advanceTimersByTimeAsync(100)

      expect(sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Lucid is thinking…'),
        }),
      )

      await adapter.finalize('Hello from Slack streaming')

      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'Hello from Slack streaming',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('disables Discord live streaming when streaming mode is off', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-1', chatId: 'channel:1' })
      const editText = vi.fn()
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: '123',
          botToken: 'token',
          channelType: 'discord',
          discordStreamingMode: 'off',
        },
      )

      await adapter.begin()
      await adapter.append('Hello from Discord')
      await vi.advanceTimersByTimeAsync(100)
      await adapter.finalize('Hello from Discord')

      expect(editText).not.toHaveBeenCalled()
      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'Hello from Discord',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses Discord progress mode status previews before final delivery', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'discord', ok: true, messageId: '171.0001', chatId: '123' })
      const editText = vi
        .fn()
        .mockResolvedValue({ channel: 'discord', ok: true, messageId: '171.0001', chatId: '123' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: '123',
          botToken: 'token',
          channelType: 'discord',
          discordStreamingMode: 'progress',
        },
      )

      await adapter.begin()
      await adapter.append('Hello from Discord')
      await vi.advanceTimersByTimeAsync(100)

      expect(sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Lucid is thinking…'),
        }),
      )

      await adapter.finalize('Hello from Discord streaming')

      expect(editText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'Hello from Discord streaming',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps refreshing Discord typing feedback while generation is in progress', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.mocked(fetch)
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-0', chatId: 'channel-1' })
      const editText = vi.fn().mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-0' })
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 2000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: 'channel-1',
          botToken: 'token',
          channelType: 'discord',
          discordTypingFeedback: true,
        },
      )

      await adapter.begin()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(8000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      await adapter.finalize('Done')
      await vi.advanceTimersByTimeAsync(8000)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not duplicate final content in Discord block mode when preview already flushed it', async () => {
    vi.useFakeTimers()
    try {
      const sendText = vi
        .fn()
        .mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-1', chatId: 'channel:1' })
      const editText = vi.fn()
      const outbound = makeOutbound({
        deliveryMode: 'streamed',
        chunkerMode: 'plain',
        textChunkLimit: 40000,
        sendText,
        editText,
      })

      const adapter = new OpenClawChannelAdapter(
        outbound,
        { supportsEditing: true, flushIntervalMs: 100, minBufferSize: 10, cursorIndicator: ' ▍' },
        {
          channelId: 'channel-1',
          chatId: '123',
          botToken: 'token',
          channelType: 'discord',
          discordStreamingMode: 'block',
          discordTypingFeedback: true,
        },
      )

      await adapter.begin()
      expect(sendText).not.toHaveBeenCalled()

      await adapter.append('Preview block one')
      await vi.advanceTimersByTimeAsync(100)

      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'Preview block one',
        }),
      )

      await adapter.finalize('Preview block one')

      expect(editText).not.toHaveBeenCalled()
      expect(sendText).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('replies only on the first Discord chunk when replyToMode=first', async () => {
    const sendText = vi
      .fn()
      .mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-1', chatId: 'channel-1' })
    const outbound = makeOutbound({
      deliveryMode: 'direct',
      chunkerMode: 'plain',
      textChunkLimit: 8,
      chunker: () => ['chunk one', 'chunk two'],
      sendText,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      {
        channelId: 'channel-1',
        chatId: 'channel-1',
        botToken: 'token',
        channelType: 'discord',
        replyToMessageId: '123',
        replyToMode: 'first',
      },
    )

    await adapter.finalize('chunk one chunk two')

    expect(sendText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: 'chunk one',
        replyToId: '123',
      }),
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: 'chunk two',
        replyToId: undefined,
      }),
    )
  })

  it('does not attach reply references when Discord replyToMode=off', async () => {
    const sendText = vi
      .fn()
      .mockResolvedValue({ channel: 'discord', ok: true, messageId: 'msg-1', chatId: 'channel-1' })
    const outbound = makeOutbound({
      deliveryMode: 'direct',
      chunkerMode: 'plain',
      textChunkLimit: 8,
      chunker: () => ['chunk one', 'chunk two'],
      sendText,
    })

    const adapter = new OpenClawChannelAdapter(
      outbound,
      { supportsEditing: false },
      {
        channelId: 'channel-1',
        chatId: 'channel-1',
        botToken: 'token',
        channelType: 'discord',
        replyToMessageId: '123',
        replyToMode: 'off',
      },
    )

    await adapter.finalize('chunk one chunk two')

    expect(sendText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ replyToId: undefined }),
    )
    expect(sendText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ replyToId: undefined }),
    )
  })
})
