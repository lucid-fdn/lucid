import { describe, expect, it, vi } from 'vitest'
import {
  assertOpenClawOutboundContract,
  type OpenClawChannelPluginBridgeContract,
} from '../../worker/src/channels/bridge/OpenClawBridgeContract.js'
import {
  createTelegramBridgeOutput,
  createTelegramBridgeRegistration,
} from '../../worker/src/channels/bridge/telegram/TelegramOpenClawBridge.js'

function makePlugin(overrides: Partial<OpenClawChannelPluginBridgeContract> = {}): OpenClawChannelPluginBridgeContract {
  return {
    id: 'telegram',
    outbound: {
      deliveryMode: 'direct',
      chunker: (text, limit) => (text.length <= limit ? [text] : [text.slice(0, limit), text.slice(limit)]),
      chunkerMode: 'markdown',
      textChunkLimit: 4000,
      sendText: vi.fn(async ({ to }) => ({ channel: 'telegram', chatId: to, messageId: 'm1' })),
    },
    ...overrides,
  }
}

describe('OpenClaw bridge contract + telegram skeleton', () => {
  it('accepts a valid outbound bridge contract', () => {
    const plugin = makePlugin()
    expect(() => assertOpenClawOutboundContract('telegram', plugin.outbound)).not.toThrow()
  })

  it('rejects invalid outbound contract shape', () => {
    const plugin = makePlugin({
      outbound: {
        deliveryMode: 'direct',
        chunker: (t: string) => [t],
        chunkerMode: 'markdown',
        textChunkLimit: 4000,
      } as unknown as OpenClawChannelPluginBridgeContract['outbound'],
    })

    expect(() => assertOpenClawOutboundContract('telegram', plugin.outbound)).toThrow(
      /outbound\.sendText must be a function/
    )
  })

  it('enforces telegram plugin id in bridge registration', () => {
    const plugin = makePlugin({ id: 'discord' as 'telegram' })
    expect(() => createTelegramBridgeRegistration(plugin)).toThrow(/expected plugin.id='telegram'/)
  })

  it('creates registration with override-friendly streaming defaults', () => {
    const plugin = makePlugin()
    const registration = createTelegramBridgeRegistration(plugin, {
      streaming: { flushIntervalMs: 500, minBufferSize: 32 },
    })

    expect(registration.channelType).toBe('telegram')
    expect(registration.streaming.supportsEditing).toBe(true)
    expect(registration.streaming.flushIntervalMs).toBe(500)
    expect(registration.streaming.minBufferSize).toBe(32)
    expect(registration.streaming.cursorIndicator).toBe(' ▍')
  })

  it('creates an adapter output that routes finalize through outbound sendText', async () => {
    const sendText = vi.fn(async ({ to }) => ({ channel: 'telegram', chatId: to, messageId: 'm1' }))
    const plugin = makePlugin({
      outbound: {
        deliveryMode: 'direct',
        chunker: (text: string) => [text],
        chunkerMode: 'markdown',
        textChunkLimit: 4000,
        sendText,
      },
    })

    const output = createTelegramBridgeOutput(plugin, {
      channelId: 'ch_1',
      chatId: 'chat_1',
      botToken: 'token',
      channelType: 'telegram',
    })

    // direct+markdown bridge should be non-streaming begin
    const ref = await output.begin()
    expect(ref).toBeNull()

    await output.finalize('hello from bridge')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText.mock.calls[0][0].to).toBe('chat_1')
    expect(sendText.mock.calls[0][0].text).toBe('hello from bridge')
  })
})
