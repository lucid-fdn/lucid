import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockEnsureHostedIMessageSurfaceChannel = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()
const mockSetChannelSurfaceDefault = vi.fn()
const mockCreateProviderSurfaceToken = vi.fn()
const mockEnsureChannelProviderSurface = vi.fn()
const mockGetChannelProviderSurface = vi.fn()
const mockCreateServiceClient = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
  ensureHostedIMessageSurfaceChannel: (...args: unknown[]) =>
    mockEnsureHostedIMessageSurfaceChannel(...args),
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) =>
    mockGetChannelSurfaceDefaultBinding(...args),
  setChannelSurfaceDefault: (...args: unknown[]) =>
    mockSetChannelSurfaceDefault(...args),
}))

vi.mock('@/lib/db/channel-provider', () => ({
  createProviderSurfaceToken: (...args: unknown[]) => mockCreateProviderSurfaceToken(...args),
  ensureChannelProviderSurface: (...args: unknown[]) => mockEnsureChannelProviderSurface(...args),
  getChannelProviderSurface: (...args: unknown[]) => mockGetChannelProviderSurface(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { POST } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockEnsureHostedIMessageSurfaceChannel.mockReset()
  mockGetChannelSurfaceDefaultBinding.mockReset()
  mockSetChannelSurfaceDefault.mockReset()
  mockCreateProviderSurfaceToken.mockReset()
  mockEnsureChannelProviderSurface.mockReset()
  mockGetChannelProviderSurface.mockReset()
  mockCreateServiceClient.mockReset()

  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
  mockIsUserOrgMember.mockResolvedValue(true)
})

describe('assistant imessage connect route', () => {
  it('returns a bridge config for an existing byob iMessage channel', async () => {
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const maybeSingle = vi.fn(async () => ({
      data: { id: 'channel-1', connection_mode: 'byob', channel_config: null },
      error: null,
    }))
    const eqChannelType = vi.fn(() => ({ maybeSingle }))
    const eqAssistantId = vi.fn(() => ({ eq: eqChannelType }))
    const eqChannelId = vi.fn(() => ({ eq: eqAssistantId }))
    const select = vi.fn(() => ({ eq: eqChannelId }))
    const from = vi.fn((table: string) =>
      table === 'assistant_channels'
        ? { select, update }
        : { update },
    )

    mockCreateServiceClient.mockReturnValue({ from })

    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/imessage-connect', {
        method: 'POST',
        body: JSON.stringify({ channelId: 'channel-1' }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        channelId: 'channel-1',
        webhookUrl: 'http://localhost/api/webhooks/imessage/channel-1',
        webhookSecret: expect.any(String),
        bridgeHeaders: {
          'x-lucid-webhook-secret': expect.any(String),
        },
      }),
    )
  })
})
