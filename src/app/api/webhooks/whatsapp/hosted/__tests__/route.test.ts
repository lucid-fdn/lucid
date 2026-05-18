import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConsumeWhatsAppConnectToken = vi.fn()
const mockGetAssistant = vi.fn()
const mockGetPrimaryWhatsAppChannelForChat = vi.fn()
const mockHasWhatsAppInboundForChatMessage = vi.fn()
const mockInsertAssistantInboundEvent = vi.fn()
const mockListWhatsAppChannelsForChat = vi.fn()
const mockSetPrimaryWhatsAppChannel = vi.fn()
const mockUpsertHostedWhatsAppChannel = vi.fn()
const mockPublishWakeForChannel = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  consumeWhatsAppConnectToken: (...args: unknown[]) => mockConsumeWhatsAppConnectToken(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  getPrimaryWhatsAppChannelForChat: (...args: unknown[]) => mockGetPrimaryWhatsAppChannelForChat(...args),
  hasWhatsAppInboundForChatMessage: (...args: unknown[]) => mockHasWhatsAppInboundForChatMessage(...args),
  insertAssistantInboundEvent: (...args: unknown[]) => mockInsertAssistantInboundEvent(...args),
  listWhatsAppChannelsForChat: (...args: unknown[]) => mockListWhatsAppChannelsForChat(...args),
  setPrimaryWhatsAppChannel: (...args: unknown[]) => mockSetPrimaryWhatsAppChannel(...args),
  upsertHostedWhatsAppChannel: (...args: unknown[]) => mockUpsertHostedWhatsAppChannel(...args),
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishWakeForChannel: (...args: unknown[]) => mockPublishWakeForChannel(...args),
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) => mockGetChannelSurfaceDefaultBinding(...args),
}))

describe('WhatsApp hosted webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('WHATSAPP_HOSTED_ACCESS_TOKEN', 'hosted-token')
    vi.stubEnv('WHATSAPP_HOSTED_PHONE_NUMBER', '15550001111')
    vi.stubEnv('WHATSAPP_HOSTED_PHONE_NUMBER_ID', 'phone-id')
    vi.stubEnv('WHATSAPP_HOSTED_APP_SECRET', 'hosted-secret')
    vi.stubEnv('WHATSAPP_HOSTED_VERIFY_TOKEN', 'verify-hosted')
    vi.stubEnv('TRUSTGATE_BASE_URL', 'https://trustgate-api-production.up.railway.app')
    vi.stubEnv('TRUSTGATE_API_KEY', 'trustgate-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    mockHasWhatsAppInboundForChatMessage.mockResolvedValue(false)
    mockInsertAssistantInboundEvent.mockResolvedValue(undefined)
    mockPublishWakeForChannel.mockResolvedValue(undefined)
    mockGetChannelSurfaceDefaultBinding.mockResolvedValue(null)
  })

  it('consumes connect token and binds hosted chat', async () => {
    mockConsumeWhatsAppConnectToken.mockResolvedValue({ assistantId: 'assistant-1', orgId: 'org-1' })
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', name: 'Closer' })
    mockUpsertHostedWhatsAppChannel.mockResolvedValue({ channelId: 'channel-1' })

    const { POST } = await import('../route')
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '15551234567',
              id: 'wamid.1',
              timestamp: '123',
              type: 'text',
              text: { body: 'connect token-123' },
            }],
          },
        }],
      }],
    })

    const crypto = await import('crypto')
    const signature = crypto.createHmac('sha256', 'hosted-secret').update(payload).digest('hex')
    const request = new Request('http://localhost/api/webhooks/whatsapp/hosted', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)
    expect(mockConsumeWhatsAppConnectToken).toHaveBeenCalledWith('token-123')
    expect(mockUpsertHostedWhatsAppChannel).toHaveBeenCalled()
  })

  it('routes normal text to the active hosted assistant', async () => {
    mockConsumeWhatsAppConnectToken.mockResolvedValue(null)
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'channel-1', assistant_id: 'assistant-1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'channel-1', assistant_id: 'assistant-1' })

    const { POST } = await import('../route')
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '15551234567',
              id: 'wamid.2',
              timestamp: '123',
              type: 'text',
              text: { body: 'hello there' },
            }],
          },
        }],
      }],
    })

    const crypto = await import('crypto')
    const signature = crypto.createHmac('sha256', 'hosted-secret').update(payload).digest('hex')
    const request = new Request('http://localhost/api/webhooks/whatsapp/hosted', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        message_text: 'hello there',
      }),
    )
    expect(mockPublishWakeForChannel).toHaveBeenCalledWith('channel-1')
  })

  it('transcribes hosted WhatsApp voice notes before queueing the inbound event', async () => {
    mockConsumeWhatsAppConnectToken.mockResolvedValue(null)
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'channel-1', assistant_id: 'assistant-1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'channel-1', assistant_id: 'assistant-1' })

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://graph.facebook.com/v21.0/media-1') {
        return new Response(JSON.stringify({ url: 'https://media.example/audio', mime_type: 'audio/ogg' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === 'https://media.example/audio') {
        return new Response(Buffer.from('audio-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      }
      if (url.endsWith('/v1/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Need help with my order' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { POST } = await import('../route')
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '15551234567',
              id: 'wamid.voice',
              timestamp: '123',
              type: 'audio',
              audio: { id: 'media-1', mime_type: 'audio/ogg', voice: true },
            }],
          },
        }],
      }],
    })

    const crypto = await import('crypto')
    const signature = crypto.createHmac('sha256', 'hosted-secret').update(payload).digest('hex')
    const request = new Request('http://localhost/api/webhooks/whatsapp/hosted', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body: payload,
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        message_text: expect.stringContaining('WhatsApp voice note transcript:\nNeed help with my order'),
        message_data: expect.objectContaining({
          whatsapp_audio_input: true,
        }),
      }),
    )
  })
}, 20_000)
