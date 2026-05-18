import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAssistantChannelForWebhook = vi.fn()
const mockInsertAssistantInboundEvent = vi.fn()
const mockPublishWakeForChannel = vi.fn()
const mockCreateServiceClient = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  getAssistantChannelForWebhook: (...args: unknown[]) => mockGetAssistantChannelForWebhook(...args),
  insertAssistantInboundEvent: (...args: unknown[]) => mockInsertAssistantInboundEvent(...args),
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishWakeForChannel: (...args: unknown[]) => mockPublishWakeForChannel(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

describe('iMessage BYOB webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    mockInsertAssistantInboundEvent.mockResolvedValue({ id: 'event-1', assistant_id: 'assistant-1' })
    mockPublishWakeForChannel.mockResolvedValue(undefined)
    mockGetAssistantChannelForWebhook.mockResolvedValue({
      id: 'channel-1',
      assistant_id: 'assistant-1',
      secret_token_hash: '9caf06bb4436cdbfa20af9121a626bc1093c4f54b31c0fa937957856135345b6',
      external_channel_id: null,
    })
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    })
  })

  it('accepts a normalized inbound payload, binds the chat, and inserts the inbound event', async () => {
    const { POST } = await import('../route')
    const request = new Request('http://localhost/api/webhooks/imessage/channel-1', {
      method: 'POST',
      headers: { 'x-lucid-webhook-secret': 'test-secret' },
      body: JSON.stringify({
        messageId: 'imsg-1',
        chatId: 'chat_guid:iMessage;-;+15555550123',
        senderId: '+15555550123',
        senderName: 'Ada',
        text: 'Hello from iMessage',
      }),
    })

    const response = await POST(request as never, {
      params: Promise.resolve({ channelId: 'channel-1' }),
    } as never)

    expect(response.status).toBe(200)
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'channel-1',
        assistant_id: 'assistant-1',
        external_chat_id: 'chat_guid:iMessage;-;+15555550123',
        external_user_id: '+15555550123',
        message_text: 'Hello from iMessage',
      }),
    )
    expect(mockPublishWakeForChannel).toHaveBeenCalledWith('channel-1')
  })
})
