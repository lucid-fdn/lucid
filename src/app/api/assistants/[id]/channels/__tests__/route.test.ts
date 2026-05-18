import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockUpdateHostedDiscordChannelSettings = vi.fn()
const mockReactivateAssistantChannelWithSecrets = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
  updateHostedDiscordChannelSettings: (...args: unknown[]) =>
    mockUpdateHostedDiscordChannelSettings(...args),
  reactivateAssistantChannelWithSecrets: (...args: unknown[]) =>
    mockReactivateAssistantChannelWithSecrets(...args),
  createAssistantChannel: vi.fn(),
  deleteAssistantChannel: vi.fn(),
  ensureHostedIMessageSurfaceChannel: vi.fn(),
  listAssistantChannels: vi.fn(),
}))

vi.mock('@/lib/db/channel-provider', () => ({
  createProviderSurfaceToken: vi.fn(),
  ensureChannelProviderSurface: vi.fn(),
}))

vi.mock('@/lib/channels/validate-discord-token', () => ({
  validateDiscordBotToken: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))

import { PATCH } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockUpdateHostedDiscordChannelSettings.mockReset()
  mockReactivateAssistantChannelWithSecrets.mockReset()

  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
  mockIsUserOrgMember.mockResolvedValue(true)
})

describe('assistant channels route', () => {
  it('passes hosted Discord routing fields through the settings patch path', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/assistants/assistant-1/channels', {
        method: 'PATCH',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
          dedicatedChannelIds: ['123', '456'],
          prefix: '!lucid',
          respondOnMention: false,
          threadSupport: true,
          ignoreBots: false,
          allowedUsers: ['123456789012345678'],
          ackReaction: 'eyes',
          typingReaction: 'hourglass_flowing_sand',
          streamingPreview: false,
          streamingMode: 'progress',
          replyToMode: 'all',
          threadHistoryScope: 'channel',
          threadInheritParent: true,
          threadInitialHistoryLimit: 12,
          maxLinesPerMessage: 24,
          chunkMode: 'newline',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(200)
    expect(mockUpdateHostedDiscordChannelSettings).toHaveBeenCalledWith({
      channelId: '11111111-1111-4111-8111-111111111111',
      dedicatedChannelIds: ['123', '456'],
      prefix: '!lucid',
      respondOnMention: false,
      threadSupport: true,
      ignoreBots: false,
      allowedUserIds: ['123456789012345678'],
      ackReaction: 'eyes',
      typingReaction: 'hourglass_flowing_sand',
      streamingPreview: false,
      streamingMode: 'progress',
      replyToMode: 'all',
      threadHistoryScope: 'channel',
      threadInheritParent: true,
      threadInitialHistoryLimit: 12,
      maxLinesPerMessage: 24,
      chunkMode: 'newline',
    })
    expect(mockReactivateAssistantChannelWithSecrets).not.toHaveBeenCalled()
  })

  it('rejects a hosted Discord settings patch with no fields to update', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/assistants/assistant-1/channels', {
        method: 'PATCH',
        body: JSON.stringify({
          channelId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(400)
    expect(mockUpdateHostedDiscordChannelSettings).not.toHaveBeenCalled()
  })
})
