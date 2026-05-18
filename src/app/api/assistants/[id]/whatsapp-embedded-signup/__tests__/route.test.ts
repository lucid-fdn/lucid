import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockListAssistantChannels = vi.fn()
const mockCreateAssistantChannel = vi.fn()
const mockReactivateAssistantChannelWithSecrets = vi.fn()
const mockCreateServiceClient = vi.fn()
const mockExchangeWhatsAppEmbeddedSignupCode = vi.fn()
const mockGetWhatsAppEmbeddedSignupConfig = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  createAssistantChannel: (...args: unknown[]) => mockCreateAssistantChannel(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
  listAssistantChannels: (...args: unknown[]) => mockListAssistantChannels(...args),
  reactivateAssistantChannelWithSecrets: (...args: unknown[]) =>
    mockReactivateAssistantChannelWithSecrets(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

vi.mock('@/lib/whatsapp/embedded-signup', () => ({
  exchangeWhatsAppEmbeddedSignupCode: (...args: unknown[]) =>
    mockExchangeWhatsAppEmbeddedSignupCode(...args),
  getWhatsAppEmbeddedSignupConfig: (...args: unknown[]) =>
    mockGetWhatsAppEmbeddedSignupConfig(...args),
}))

vi.mock('@/lib/features', () => ({
  FEATURES: {
    whatsappEmbeddedSignup: true,
  },
}))

import { GET, POST } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockListAssistantChannels.mockReset()
  mockCreateAssistantChannel.mockReset()
  mockReactivateAssistantChannelWithSecrets.mockReset()
  mockCreateServiceClient.mockReset()
  mockExchangeWhatsAppEmbeddedSignupCode.mockReset()
  mockGetWhatsAppEmbeddedSignupConfig.mockReset()

  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
  mockIsUserOrgMember.mockResolvedValue(true)
  mockGetWhatsAppEmbeddedSignupConfig.mockReturnValue({
    appId: 'meta-app-id',
    appSecret: 'meta-app-secret',
    configId: 'meta-config-id',
  })
})

describe('assistant whatsapp embedded signup route', () => {
  it('returns the embedded signup launch config', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/assistants/assistant-1/whatsapp-embedded-signup'),
      { params: Promise.resolve({ id: 'assistant-1' }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      enabled: true,
      appId: 'meta-app-id',
      configId: 'meta-config-id',
    })
    expect(payload.launchUrl).toContain('https://www.facebook.com/dialog/oauth')
    expect(payload.launchUrl).toContain('config_id=meta-config-id')
  })

  it('creates a BYOB WhatsApp channel from Meta signup results', async () => {
    mockExchangeWhatsAppEmbeddedSignupCode.mockResolvedValue('embedded-access-token')
    mockListAssistantChannels.mockResolvedValue([])
    mockCreateAssistantChannel.mockResolvedValue({
      channel: {
        id: 'channel-1',
        channel_type: 'whatsapp',
        connection_mode: 'byob',
      },
    })

    const response = await POST(
      new NextRequest('http://localhost:3000/api/assistants/assistant-1/whatsapp-embedded-signup', {
        method: 'POST',
        body: JSON.stringify({
          code: 'auth-code-1',
          phoneNumberId: 'pnid-1',
          phoneNumber: '+15551234567',
          businessAccountId: 'waba-1',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mockExchangeWhatsAppEmbeddedSignupCode).toHaveBeenCalledWith({
      appId: 'meta-app-id',
      appSecret: 'meta-app-secret',
      code: 'auth-code-1',
    })
    expect(mockCreateAssistantChannel).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      channelType: 'whatsapp',
      connectionMode: 'byob',
      externalChannelId: 'pnid-1',
      secrets: expect.objectContaining({
        access_token: 'embedded-access-token',
        phone_number_id: 'pnid-1',
        phone_number: '+15551234567',
        app_secret: 'meta-app-secret',
        business_account_id: 'waba-1',
      }),
    })

    const payload = await response.json()
    expect(payload).toMatchObject({
      webhookUrl: 'http://localhost:3000/api/webhooks/whatsapp/channel-1',
      phoneNumberId: 'pnid-1',
      businessAccountId: 'waba-1',
      connectionMode: 'byob',
      source: 'embedded_signup',
    })
    expect(typeof payload.webhookVerifyToken).toBe('string')
  })

  it('reactivates an existing BYOB WhatsApp channel when one already exists', async () => {
    mockExchangeWhatsAppEmbeddedSignupCode.mockResolvedValue('embedded-access-token')
    mockListAssistantChannels.mockResolvedValue([
      {
        id: 'channel-existing',
        channel_type: 'whatsapp',
        connection_mode: 'byob',
      },
    ])

    const updateQuery = {
      update: vi.fn(() => updateQuery),
      eq: vi.fn(() => updateQuery),
      select: vi.fn(() => updateQuery),
      single: vi.fn(async () => ({
        data: {
          id: 'channel-existing',
          channel_type: 'whatsapp',
          connection_mode: 'byob',
        },
        error: null,
      })),
    }
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => updateQuery),
    })

    const response = await POST(
      new NextRequest('http://localhost:3000/api/assistants/assistant-1/whatsapp-embedded-signup', {
        method: 'POST',
        body: JSON.stringify({
          code: 'auth-code-2',
          phoneNumberId: 'pnid-2',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mockReactivateAssistantChannelWithSecrets).toHaveBeenCalled()
    expect(mockCreateAssistantChannel).not.toHaveBeenCalled()
  })
})
