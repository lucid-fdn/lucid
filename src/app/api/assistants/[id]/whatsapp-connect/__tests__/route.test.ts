import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockCreateWhatsAppConnectToken = vi.fn()
const mockGetHostedWhatsAppConfig = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  createWhatsAppConnectToken: (...args: unknown[]) => mockCreateWhatsAppConnectToken(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

vi.mock('@/lib/whatsapp/webhook', () => ({
  getHostedWhatsAppConfig: (...args: unknown[]) => mockGetHostedWhatsAppConfig(...args),
}))

vi.mock('@/lib/features', () => ({
  FEATURES: {
    whatsappHosted: true,
  },
}))

import { POST } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockCreateWhatsAppConnectToken.mockReset()
  mockGetHostedWhatsAppConfig.mockReset()
})

describe('assistant whatsapp connect route', () => {
  it('returns 503 when hosted WhatsApp is not fully configured', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetHostedWhatsAppConfig.mockImplementation(() => {
      throw new Error('missing')
    })

    const response = await POST(
      new NextRequest('http://localhost:3000/api/assistants/assistant-1/whatsapp-connect', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Hosted WhatsApp is not fully configured',
      details:
        'Set WHATSAPP_HOSTED_PHONE_NUMBER, WHATSAPP_HOSTED_PHONE_NUMBER_ID, WHATSAPP_HOSTED_ACCESS_TOKEN, WHATSAPP_HOSTED_APP_SECRET, and WHATSAPP_HOSTED_VERIFY_TOKEN before generating hosted connect links.',
    })
  })

  it('returns the wa.me connect URL when hosted WhatsApp is configured', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetHostedWhatsAppConfig.mockReturnValue({
      phoneNumber: '15550001111',
      phoneNumberId: 'phone-id',
      accessToken: 'hosted-token',
      appSecret: 'hosted-secret',
      verifyToken: 'verify-token',
    })
    mockCreateWhatsAppConnectToken.mockResolvedValue('token-123')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/assistants/assistant-1/whatsapp-connect', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      connectUrl: 'https://wa.me/15550001111?text=connect%20token-123',
      token: 'token-123',
      phoneNumber: '15550001111',
    })
  })
})
