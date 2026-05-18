import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chatStreamMock = vi.fn()

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chatStream: chatStreamMock,
  })),
}))

describe('SlackPlugin', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    chatStreamMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses replyToId as thread_ts when explicit threadId is absent', async () => {
    const { createSlackPlugin } = await import('../SlackPlugin.js')

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ts: '171.0002',
        channel: 'C123',
      }),
    })

    const plugin = createSlackPlugin({ bot_token: 'xoxb-test' })

    await plugin.outbound.sendText({
      to: 'C123',
      text: 'hello from slack',
      replyToId: '171.0001',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          channel: 'C123',
          text: 'hello from slack',
          thread_ts: '171.0001',
        }),
      }),
    )
  })

  it('starts, appends, and stops native Slack streams', async () => {
    const append = vi.fn().mockResolvedValue(undefined)
    const stop = vi.fn().mockResolvedValue(undefined)
    chatStreamMock.mockReturnValue({ append, stop })

    const { createSlackPlugin } = await import('../SlackPlugin.js')
    const plugin = createSlackPlugin({ bot_token: 'xoxb-test' })

    const start = await plugin.nativeStreaming.start({
      channel: 'C123',
      threadTs: '171.0001',
      text: 'Hello',
      recipientTeamId: 'T123',
      recipientUserId: 'U123',
    })

    expect(start.ok).toBe(true)
    expect(chatStreamMock).toHaveBeenCalledWith({
      channel: 'C123',
      thread_ts: '171.0001',
      recipient_team_id: 'T123',
      recipient_user_id: 'U123',
    })
    expect(append).toHaveBeenCalledWith({ markdown_text: 'Hello' })

    await expect(
      plugin.nativeStreaming.append({
        streamId: start.streamId!,
        text: ' world',
      }),
    ).resolves.toEqual({ ok: true })
    expect(append).toHaveBeenLastCalledWith({ markdown_text: ' world' })

    await expect(
      plugin.nativeStreaming.stop({
        streamId: start.streamId!,
        text: '!',
      }),
    ).resolves.toEqual({ ok: true })
    expect(stop).toHaveBeenCalledWith({ markdown_text: '!' })
  })

  it('sets Slack assistant thread status with channel_id and thread_ts', async () => {
    const { createSlackPlugin } = await import('../SlackPlugin.js')

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const plugin = createSlackPlugin({ bot_token: 'xoxb-test' })

    await expect(
      plugin.nativeStreaming.setStatus({
        channel: 'C123',
        threadTs: '171.0001',
        status: 'is checking live market data',
      }),
    ).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://slack.com/api/assistant.threads.setStatus',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          channel_id: 'C123',
          thread_ts: '171.0001',
          status: 'is checking live market data',
        }),
      }),
    )
  })
})
