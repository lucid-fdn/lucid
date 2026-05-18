import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessageDiscord = vi.fn()
const editMessageDiscord = vi.fn()
const sendVoiceMessageDiscord = vi.fn()

vi.mock('../../openclaw-channel-shim.js', () => ({
  sendMessageDiscord: (...args: unknown[]) => sendMessageDiscord(...args),
  editMessageDiscord: (...args: unknown[]) => editMessageDiscord(...args),
  sendVoiceMessageDiscord: (...args: unknown[]) => sendVoiceMessageDiscord(...args),
}))

describe('DiscordPlugin', () => {
  beforeEach(() => {
    sendMessageDiscord.mockReset()
    editMessageDiscord.mockReset()
    sendVoiceMessageDiscord.mockReset()
  })

  it('exposes Discord as a streamed plain-text bridge for ChannelAdapter', async () => {
    const { createDiscordPlugin } = await import('../DiscordPlugin.js')

    const plugin = createDiscordPlugin({ bot_token: 'token' })

    expect(plugin.outbound.deliveryMode).toBe('streamed')
    expect(plugin.outbound.chunkerMode).toBe('plain')
    expect(plugin.outbound.editText).toBeTypeOf('function')
  })

  it('passes explicit bot token through sendText and editText', async () => {
    const { createDiscordPlugin } = await import('../DiscordPlugin.js')
    sendMessageDiscord.mockResolvedValueOnce({ messageId: '1', channelId: 'discord-channel-1' })
    editMessageDiscord.mockResolvedValueOnce({ id: '1' })

    const plugin = createDiscordPlugin({ bot_token: 'token' })

    await plugin.outbound.sendText({
      to: 'channel:discord-channel-1',
      text: 'hello',
      replyToId: 'reply-1',
    })
    await plugin.outbound.editText?.({
      to: 'channel:discord-channel-1',
      messageId: '1',
      text: 'hello again',
    })

    expect(sendMessageDiscord).toHaveBeenCalledWith('channel:discord-channel-1', 'hello', {
      token: 'token',
      replyTo: 'reply-1',
    })
    expect(editMessageDiscord).toHaveBeenCalledWith(
      'channel:discord-channel-1',
      '1',
      { content: 'hello again' },
      { token: 'token' },
    )
  })

  it('chunks fenced Discord output without leaving code fences unbalanced', async () => {
    const { createDiscordPlugin } = await import('../DiscordPlugin.js')

    const plugin = createDiscordPlugin({ bot_token: 'token' })
    const chunks = plugin.outbound.chunker(
      '```ts\nconst first = 1\nconst second = 2\nconst third = 3\n```',
      28,
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.includes('```'))).toBe(true)
  })

  it('honors a custom soft line cap for Discord chunking', async () => {
    const { createDiscordPlugin } = await import('../DiscordPlugin.js')

    const plugin = createDiscordPlugin({ bot_token: 'token' }, { maxLinesPerMessage: 4 })
    const chunks = plugin.outbound.chunker(
      'line 1\nline 2\nline 3\nline 4\nline 5\nline 6',
      2000,
    )

    expect(chunks.length).toBeGreaterThan(1)
  })
})
