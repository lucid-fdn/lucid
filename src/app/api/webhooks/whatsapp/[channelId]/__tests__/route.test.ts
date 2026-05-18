import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAssistantChannelForWebhook = vi.fn()
const mockHasWhatsAppInboundForChatMessage = vi.fn()
const mockInsertAssistantInboundEvent = vi.fn()
const mockPublishWakeForChannel = vi.fn()
const mockDecryptChannelSecrets = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  getAssistantChannelForWebhook: (...args: unknown[]) => mockGetAssistantChannelForWebhook(...args),
  hasWhatsAppInboundForChatMessage: (...args: unknown[]) => mockHasWhatsAppInboundForChatMessage(...args),
  insertAssistantInboundEvent: (...args: unknown[]) => mockInsertAssistantInboundEvent(...args),
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishWakeForChannel: (...args: unknown[]) => mockPublishWakeForChannel(...args),
}))

vi.mock('@/lib/channels/secrets', () => ({
  decryptChannelSecrets: (...args: unknown[]) => mockDecryptChannelSecrets(...args),
}))

describe('WhatsApp BYOB webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TRUSTGATE_BASE_URL', 'https://trustgate-api-production.up.railway.app')
    vi.stubEnv('TRUSTGATE_API_KEY', 'trustgate-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    mockHasWhatsAppInboundForChatMessage.mockResolvedValue(false)
    mockInsertAssistantInboundEvent.mockResolvedValue(undefined)
    mockPublishWakeForChannel.mockResolvedValue(undefined)
    mockDecryptChannelSecrets.mockReturnValue({
      verify_token: 'verify-me',
      app_secret: 'super-secret',
    })
    mockGetAssistantChannelForWebhook.mockResolvedValue({
      id: 'channel-1',
      assistant_id: 'assistant-1',
      encrypted_secrets: { encrypted_data: 'enc' },
    })
  })

  it('verifies GET subscribe challenge with channel-scoped verify token', async () => {
    const { GET } = await import('../route')
    const request = new Request('http://localhost/api/webhooks/whatsapp/channel-1?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc')
    const response = await GET(request as any, { params: Promise.resolve({ channelId: 'channel-1' }) })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('abc')
  })

  it('accepts signed POST and inserts inbound event', async () => {
    const { POST } = await import('../route')
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            contacts: [{ wa_id: '15551234567', profile: { name: 'Ada' } }],
            messages: [{
              from: '15551234567',
              id: 'wamid.1',
              timestamp: '123',
              type: 'text',
              text: { body: 'Hello' },
            }],
          },
        }],
      }],
    })

    const crypto = await import('crypto')
    const signature = crypto.createHmac('sha256', 'super-secret').update(payload).digest('hex')
    const request = new Request('http://localhost/api/webhooks/whatsapp/channel-1', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
    })

    const response = await POST(request as any, { params: Promise.resolve({ channelId: 'channel-1' }) })

    expect(response.status).toBe(200)
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        external_chat_id: '15551234567',
        message_text: 'Hello',
      }),
    )
    expect(mockPublishWakeForChannel).toHaveBeenCalledWith('channel-1')
  })

  it('transcribes WhatsApp audio messages on the BYOB webhook path', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://graph.facebook.com/v21.0/media-1') {
        return new Response(JSON.stringify({ url: 'https://media.example/byob-audio', mime_type: 'audio/ogg' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://media.example/byob-audio') {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Please call me back tomorrow' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    mockDecryptChannelSecrets.mockReturnValue({
      verify_token: 'verify-me',
      app_secret: 'super-secret',
      access_token: 'wa-byob-token',
    })

    const { POST } = await import('../route')
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            contacts: [{ wa_id: '15551234567', profile: { name: 'Ada' } }],
            messages: [{
              from: '15551234567',
              id: 'wamid.audio.1',
              timestamp: '123',
              type: 'audio',
              audio: { id: 'media-1', mime_type: 'audio/ogg', voice: true },
            }],
          },
        }],
      }],
    })

    const crypto = await import('crypto')
    const signature = crypto.createHmac('sha256', 'super-secret').update(payload).digest('hex')
    const request = new Request('http://localhost/api/webhooks/whatsapp/channel-1', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
    })

    const response = await POST(request as any, { params: Promise.resolve({ channelId: 'channel-1' }) })

    expect(response.status).toBe(200)
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        message_text: expect.stringContaining('WhatsApp voice note transcript:\nPlease call me back tomorrow'),
        message_data: expect.objectContaining({
          whatsapp_audio_input: true,
        }),
      }),
    )
  })
})
