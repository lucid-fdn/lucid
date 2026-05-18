import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mockInsertAssistantInboundEvent = vi.fn()
const mockPublishWakeForChannel = vi.fn()
const mockValidateBotFrameworkJwt = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockFrom = vi.fn()
const mockSendTeamsText = vi.fn()
const mockGetPrimaryTeamsChannelForConversation = vi.fn()
const mockListTeamsChannelsForConversation = vi.fn()
const mockListPendingTeamsChannelsForTenant = vi.fn()
const mockBindHostedTeamsChannel = vi.fn()
const mockSetPrimaryTeamsChannel = vi.fn()
const mockUnbindTeamsChannel = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()

vi.mock('@/lib/db', () => ({
  insertAssistantInboundEvent: (...args: unknown[]) => mockInsertAssistantInboundEvent(...args),
  getPrimaryTeamsChannelForConversation: (...args: unknown[]) =>
    mockGetPrimaryTeamsChannelForConversation(...args),
  listTeamsChannelsForConversation: (...args: unknown[]) =>
    mockListTeamsChannelsForConversation(...args),
  listPendingTeamsChannelsForTenant: (...args: unknown[]) =>
    mockListPendingTeamsChannelsForTenant(...args),
  bindHostedTeamsChannel: (...args: unknown[]) => mockBindHostedTeamsChannel(...args),
  setPrimaryTeamsChannel: (...args: unknown[]) => mockSetPrimaryTeamsChannel(...args),
  unbindTeamsChannel: (...args: unknown[]) => mockUnbindTeamsChannel(...args),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) =>
    mockGetChannelSurfaceDefaultBinding(...args),
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishWakeForChannel: (...args: unknown[]) => mockPublishWakeForChannel(...args),
}))

vi.mock('@/lib/channels/msteams/jwt-validator', () => ({
  validateBotFrameworkJwt: (...args: unknown[]) => mockValidateBotFrameworkJwt(...args),
}))

vi.mock('@/lib/channels/msteams/send', () => ({
  sendTeamsText: (...args: unknown[]) => mockSendTeamsText(...args),
}))

vi.mock('@/lib/utils/rate-limiter', () => ({
  createRateLimiter: () => ({
    check: (...args: unknown[]) => mockCheckRateLimit(...args),
  }),
}))

import { GET, POST } from '../route'

function createRequest(body: unknown): NextRequest {
  return new NextRequest('https://www.lucid.foundation/api/webhooks/msteams/hosted', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function createActiveChannelQuery(data: unknown) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  query.eq.mockReturnValue(query)
  return query
}

function createUpdateQuery() {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
  }
  query.eq.mockReturnValue(query)
  query.is.mockReturnValue(query)
  return query
}

beforeEach(() => {
  delete process.env.WORKER_URL
  process.env.MSTEAMS_HOSTED_APP_ID = 'teams-app-id'
  process.env.MSTEAMS_HOSTED_APP_PASSWORD = 'teams-secret'

  mockInsertAssistantInboundEvent.mockReset()
  mockPublishWakeForChannel.mockReset()
  mockValidateBotFrameworkJwt.mockReset()
  mockCheckRateLimit.mockReset()
  mockFrom.mockReset()
  mockSendTeamsText.mockReset()
  mockGetPrimaryTeamsChannelForConversation.mockReset()
  mockListTeamsChannelsForConversation.mockReset()
  mockListPendingTeamsChannelsForTenant.mockReset()
  mockBindHostedTeamsChannel.mockReset()
  mockSetPrimaryTeamsChannel.mockReset()
  mockUnbindTeamsChannel.mockReset()
  mockGetChannelSurfaceDefaultBinding.mockReset()

  mockValidateBotFrameworkJwt.mockResolvedValue({ valid: true })
  mockCheckRateLimit.mockReturnValue(true)
  mockSendTeamsText.mockResolvedValue({ externalMessageId: 'teams-msg-1' })
  mockListTeamsChannelsForConversation.mockResolvedValue([
    { id: 'channel-1', assistant_id: 'assistant-1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
  ])
  mockListPendingTeamsChannelsForTenant.mockResolvedValue([])
  mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'channel-1', assistant_id: 'assistant-1' })
  mockBindHostedTeamsChannel.mockResolvedValue(true)
  mockGetChannelSurfaceDefaultBinding.mockResolvedValue(null)
})

describe('teams hosted webhook route', () => {
  it('serves a health payload on GET', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'msteams-hosted-webhook',
    })
  })

  it('stores inbound events for already-bound hosted conversations', async () => {
    const activeChannel = {
      id: 'channel-1',
      assistant_id: 'assistant-1',
      channel_config: { hosted: true },
    }
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'channel-1', assistant_id: 'assistant-1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'channel-1', assistant_id: 'assistant-1' })

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'assistant_channels') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(createActiveChannelQuery(activeChannel)),
        update: vi.fn().mockReturnValue(createUpdateQuery()),
      }
    })

    const response = await POST(createRequest({
      type: 'message',
      id: 'msg-1',
      text: '<at>Lucid</at> hello from teams',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      from: { id: 'user-1', name: 'Ada' },
      conversation: { id: 'conv-1', tenantId: 'tenant-1' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      assistant_id: 'assistant-1',
      external_message_id: 'msg-1',
      external_user_id: 'user-1',
      external_chat_id: 'conv-1',
      message_text: 'hello from teams',
      message_data: {
        from: { id: 'user-1', name: 'Ada' },
        conversation: { id: 'conv-1', tenantId: 'tenant-1' },
        teams_conversation_id: 'conv-1',
        teams_tenant_id: 'tenant-1',
        serviceUrl: 'https://smba.trafficmanager.net/teams',
        timestamp: undefined,
        teams_audio_input: false,
        teams_attachments: [],
      },
    })
    expect(mockPublishWakeForChannel).toHaveBeenCalledWith('channel-1')
  })

  it('preserves Teams attachment metadata on inbound events', async () => {
    const activeChannel = {
      id: 'channel-audio',
      assistant_id: 'assistant-audio',
      channel_config: { hosted: true },
    }

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'assistant_channels') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(createActiveChannelQuery(activeChannel)),
        update: vi.fn().mockReturnValue(createUpdateQuery()),
      }
    })

    const response = await POST(createRequest({
      type: 'message',
      id: 'msg-audio',
      text: '',
      attachments: [
        {
          contentType: 'audio/ogg',
          contentUrl: 'https://example.com/voice.ogg',
          name: 'voice-note.ogg',
        },
      ],
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      from: { id: 'user-audio', name: 'Ada' },
      conversation: { id: 'conv-audio', tenantId: 'tenant-audio' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith({
      channel_id: 'channel-audio',
      assistant_id: 'assistant-audio',
      external_message_id: 'msg-audio',
      external_user_id: 'user-audio',
      external_chat_id: 'conv-audio',
      message_text: 'User attached Microsoft Teams audio: voice-note.ogg.',
      message_data: {
        from: { id: 'user-audio', name: 'Ada' },
        conversation: { id: 'conv-audio', tenantId: 'tenant-audio' },
        teams_conversation_id: 'conv-audio',
        teams_tenant_id: 'tenant-audio',
        serviceUrl: 'https://smba.trafficmanager.net/teams',
        timestamp: undefined,
        teams_audio_input: true,
        teams_attachments: [
          {
            kind: 'audio',
            contentType: 'audio/ogg',
            contentUrl: 'https://example.com/voice.ogg',
            name: 'voice-note.ogg',
          },
        ],
      },
    })
  })

  it('handles explicit bind commands for unbound hosted Teams conversations without queueing work', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'assistant_channels') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(createActiveChannelQuery(null)),
        update: vi.fn().mockReturnValue(createUpdateQuery()),
      }
    })
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-2', assistant_id: 'assistant-2', assistant_name: 'Support', assistant_description: 'Ops helper' },
    ])

    const response = await POST(createRequest({
      type: 'message',
      id: 'msg-2',
      text: 'bind',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      from: { id: 'user-2' },
      conversation: { id: 'conv-2', tenantId: 'tenant-2' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockSendTeamsText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-2',
        text: 'Support is now active in this Teams conversation.',
      }),
    )
    expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
    expect(mockPublishWakeForChannel).not.toHaveBeenCalled()
  })

  it('routes plain text through the tenant surface default when no conversation binding exists yet', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'assistant_channels') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(createActiveChannelQuery(null)),
        update: vi.fn().mockReturnValue(createUpdateQuery()),
      }
    })
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    mockGetChannelSurfaceDefaultBinding.mockResolvedValue({
      assistantId: 'assistant-default',
      channel: {
        id: 'tenant-default-channel',
      },
    })

    const response = await POST(createRequest({
      type: 'message',
      id: 'msg-surface-default',
      text: 'hello team',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      from: { id: 'user-default', name: 'Ada' },
      conversation: { id: 'conv-default', tenantId: 'tenant-default' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockInsertAssistantInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'tenant-default-channel',
        assistant_id: 'assistant-default',
        external_chat_id: 'conv-default',
        message_text: 'hello team',
      }),
    )
  })

  it('handles hosted Teams commands without queueing inbound work', async () => {
    const activeChannel = {
      id: 'channel-3',
      assistant_id: 'assistant-3',
      channel_config: { hosted: true },
    }

    mockFrom.mockImplementation((table: string) => {
      if (table !== 'assistant_channels') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(createActiveChannelQuery(activeChannel)),
        update: vi.fn().mockReturnValue(createUpdateQuery()),
      }
    })

    const response = await POST(createRequest({
      type: 'message',
      id: 'msg-3',
      text: 'help',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      from: { id: 'user-3', name: 'Grace' },
      conversation: { id: 'conv-3', tenantId: 'tenant-3' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockSendTeamsText).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-3',
        text: expect.stringContaining('switch <agent name>'),
      }),
    )
    expect(mockInsertAssistantInboundEvent).not.toHaveBeenCalled()
    expect(mockPublishWakeForChannel).not.toHaveBeenCalled()
  })
})
