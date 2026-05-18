import { describe, expect, it, vi } from 'vitest'
import {
  assertOpenClawOutboundContract,
  type OpenClawChannelPluginBridgeContract,
} from '../../worker/src/channels/bridge/OpenClawBridgeContract.js'
import {
  createWhatsAppBridgeOutput,
  createWhatsAppBridgeRegistration,
} from '../../worker/src/channels/bridge/whatsapp/WhatsAppOpenClawBridge.js'

function makePlugin(overrides: Partial<OpenClawChannelPluginBridgeContract> = {}): OpenClawChannelPluginBridgeContract {
  return {
    id: 'whatsapp',
    outbound: {
      deliveryMode: 'direct',
      chunker: (text, limit) => (text.length <= limit ? [text] : [text.slice(0, limit), text.slice(limit)]),
      chunkerMode: 'plain',
      textChunkLimit: 4096,
      sendText: vi.fn(async ({ to }) => ({ channel: 'whatsapp', chatId: to, messageId: 'wam_1' })),
    },
    ...overrides,
  }
}

describe('OpenClaw bridge contract + whatsapp bridge', () => {
  it('accepts a valid outbound bridge contract', () => {
    const plugin = makePlugin()
    expect(() => assertOpenClawOutboundContract('whatsapp', plugin.outbound)).not.toThrow()
  })

  it('rejects invalid outbound contract shape (missing sendText)', () => {
    const plugin = makePlugin({
      outbound: {
        deliveryMode: 'direct',
        chunker: (t: string) => [t],
        chunkerMode: 'plain',
        textChunkLimit: 4096,
      } as unknown as OpenClawChannelPluginBridgeContract['outbound'],
    })

    expect(() => assertOpenClawOutboundContract('whatsapp', plugin.outbound)).toThrow(
      /outbound\.sendText must be a function/
    )
  })

  it('enforces whatsapp plugin id in bridge registration', () => {
    const plugin = makePlugin({ id: 'telegram' as 'whatsapp' })
    expect(() => createWhatsAppBridgeRegistration(plugin)).toThrow(/expected plugin.id='whatsapp'/)
  })

  it('creates registration with correct defaults (no editing support)', () => {
    const plugin = makePlugin()
    const registration = createWhatsAppBridgeRegistration(plugin)

    expect(registration.channelType).toBe('whatsapp')
    expect(registration.streaming.supportsEditing).toBe(false)
    expect(registration.streaming.cursorIndicator).toBe('')
  })

  it('allows streaming config overrides', () => {
    const plugin = makePlugin()
    const registration = createWhatsAppBridgeRegistration(plugin, {
      streaming: { flushIntervalMs: 2000, minBufferSize: 100 },
    })

    expect(registration.streaming.supportsEditing).toBe(false) // unchanged
    expect(registration.streaming.flushIntervalMs).toBe(2000)
    expect(registration.streaming.minBufferSize).toBe(100)
  })

  it('creates an adapter output that routes finalize through outbound sendText', async () => {
    const sendText = vi.fn(async ({ to }) => ({ channel: 'whatsapp', chatId: to, messageId: 'wam_1' }))
    const plugin = makePlugin({
      outbound: {
        deliveryMode: 'direct',
        chunker: (text: string) => [text],
        chunkerMode: 'plain',
        textChunkLimit: 4096,
        sendText,
      },
    })

    const output = createWhatsAppBridgeOutput(plugin, {
      channelId: 'ch_wa_1',
      chatId: '+1234567890',
      botToken: '',
      channelType: 'whatsapp',
    })

    // direct delivery — begin returns null (no placeholder message)
    const ref = await output.begin()
    expect(ref).toBeNull()

    await output.finalize('hello from whatsapp bridge')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText.mock.calls[0][0].to).toBe('+1234567890')
    expect(sendText.mock.calls[0][0].text).toBe('hello from whatsapp bridge')
  })

  it('handles multi-chunk finalize for long messages', async () => {
    const sendText = vi.fn(async ({ to, text }) => ({
      channel: 'whatsapp',
      chatId: to,
      messageId: `wam_${text.length}`,
    }))

    const plugin = makePlugin({
      outbound: {
        deliveryMode: 'direct',
        chunker: (text: string, limit: number) => {
          // Simple chunker: split at limit
          if (text.length <= limit) return [text]
          return [text.slice(0, limit), text.slice(limit)]
        },
        chunkerMode: 'plain',
        textChunkLimit: 20, // Very small limit to force chunking
        sendText,
      },
    })

    const output = createWhatsAppBridgeOutput(plugin, {
      channelId: 'ch_wa_2',
      chatId: '+9876543210',
      botToken: '',
      channelType: 'whatsapp',
    })

    await output.begin()
    await output.finalize('This is a long message that exceeds the chunk limit')

    // Should have been chunked into multiple sendText calls
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText.mock.calls[0][0].to).toBe('+9876543210')
    expect(sendText.mock.calls[1][0].to).toBe('+9876543210')
  })
})