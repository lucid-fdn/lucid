import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockListWhatsAppChannelsForChat = vi.fn()
const mockSetPrimaryWhatsAppChannel = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockBuildAssistantAliasMap = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()
const mockSetChannelSurfaceDefault = vi.fn()
const mockClearChannelSurfaceDefault = vi.fn()
const mockCreateServiceClient = vi.fn()
const mockGetChannelSecrets = vi.fn()

vi.mock('@/lib/db', () => ({
  listWhatsAppChannelsForChat: (...args: unknown[]) => mockListWhatsAppChannelsForChat(...args),
  setPrimaryWhatsAppChannel: (...args: unknown[]) => mockSetPrimaryWhatsAppChannel(...args),
}))

vi.mock('@/lib/channels/admin-route-helpers', () => ({
  requireAssistantChannelAdminAccess: (...args: unknown[]) =>
    mockRequireAssistantChannelAdminAccess(...args),
  buildAssistantAliasMap: (...args: unknown[]) => mockBuildAssistantAliasMap(...args),
  ChannelAdminRouteError: class ChannelAdminRouteError extends Error {
    status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) =>
    mockGetChannelSurfaceDefaultBinding(...args),
  setChannelSurfaceDefault: (...args: unknown[]) =>
    mockSetChannelSurfaceDefault(...args),
  clearChannelSurfaceDefault: (...args: unknown[]) =>
    mockClearChannelSurfaceDefault(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

vi.mock('@/lib/whatsapp/webhook', () => ({
  getChannelSecrets: (...args: unknown[]) => mockGetChannelSecrets(...args),
}))

import { GET, PATCH } from '../route'

beforeEach(() => {
  mockListWhatsAppChannelsForChat.mockReset()
  mockSetPrimaryWhatsAppChannel.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockBuildAssistantAliasMap.mockReset()
  mockGetChannelSurfaceDefaultBinding.mockReset()
  mockSetChannelSurfaceDefault.mockReset()
  mockClearChannelSurfaceDefault.mockReset()
  mockCreateServiceClient.mockReset()
  mockGetChannelSecrets.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1' },
  })
  mockBuildAssistantAliasMap.mockResolvedValue(new Map())
  mockGetChannelSurfaceDefaultBinding.mockResolvedValue(null)
  mockSetChannelSurfaceDefault.mockResolvedValue({
    id: 'default-1',
    assistant_id: 'assistant-1',
  })
  mockClearChannelSurfaceDefault.mockResolvedValue(undefined)
  mockGetChannelSecrets.mockReturnValue({})
})

describe('assistant whatsapp admin route', () => {
  it('rejects chats that contain bindings from another org', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      {
        id: 'binding-foreign',
        assistant_id: 'assistant-foreign',
        org_id: 'org-2',
        assistant_name: 'Foreign',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await GET(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-admin?chatId=chat-1'),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This WhatsApp chat is linked to another workspace and cannot be managed here.',
    })
  })

  it('returns BYOB setup details when loading a WhatsApp channel by id', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: '33333333-3333-4333-8333-333333333333',
          assistant_id: 'assistant-1',
          connection_mode: 'byob',
          is_active: true,
          external_channel_id: '9876543210',
          encrypted_secrets: { encrypted_data: 'ciphertext' },
          ai_assistants: { org_id: 'org-1' },
        },
        error: null,
      })),
    }
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: query.select,
        eq: query.eq,
        maybeSingle: query.maybeSingle,
      })),
    })
    mockGetChannelSecrets.mockReturnValue({
      phone_number: '+15551234567',
      phone_number_id: '9876543210',
      verify_token: 'lucid-wa-verify-token',
      business_account_id: 'waba-1',
      access_token: 'EAAG...',
      app_secret: 'meta-secret',
    })

    const response = await GET(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-admin?channelId=33333333-3333-4333-8333-333333333333'),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      mode: 'byob',
      channelId: '33333333-3333-4333-8333-333333333333',
      isActive: true,
      webhookUrl: 'http://localhost/api/webhooks/whatsapp/33333333-3333-4333-8333-333333333333',
      verifyToken: 'lucid-wa-verify-token',
      phoneNumber: '+15551234567',
      phoneNumberId: '9876543210',
      businessAccountId: 'waba-1',
      hasAccessToken: true,
      hasAppSecret: true,
    })
  })

  it('rejects setting a chat default when the binding does not belong to the current assistant', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        assistant_id: 'assistant-2',
        org_id: 'org-1',
        assistant_name: 'Other',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await PATCH(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-admin', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_chat_default',
          chatId: 'chat-1',
          bindingChannelId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    expect(mockSetPrimaryWhatsAppChannel).not.toHaveBeenCalled()
  })

  it('rejects setting a surface default with a channel from another hosted surface', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      filter: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          assistant_id: 'assistant-1',
          channel_type: 'whatsapp',
          connection_mode: 'hosted',
          is_active: true,
          channel_config: { hosted_surface_id: 'surface-2' },
          ai_assistants: { org_id: 'org-1' },
        },
        error: null,
      })),
    }
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: query.select,
        eq: query.eq,
        filter: query.filter,
        maybeSingle: query.maybeSingle,
      })),
    })

    const response = await PATCH(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-admin', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_surface_default',
          hostedSurfaceId: 'surface-1',
          assistantChannelId: '22222222-2222-4222-8222-222222222222',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    expect(mockSetChannelSurfaceDefault).not.toHaveBeenCalled()
  })
})
