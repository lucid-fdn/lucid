import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockBindAgentToGuildViaShare = vi.fn()
const mockGetAssistant = vi.fn()
const mockUpdateDiscordGuildMetadata = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetProjectByIdForWorkspace = vi.fn()
const mockVerifyDiscordOAuthState = vi.fn()
const mockRegisterGuildCommands = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  bindAgentToGuildViaShare: (...args: unknown[]) => mockBindAgentToGuildViaShare(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  updateDiscordGuildMetadata: (...args: unknown[]) => mockUpdateDiscordGuildMetadata(...args),
}))

vi.mock('@/lib/db/organizations', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectByIdForWorkspace: (...args: unknown[]) => mockGetProjectByIdForWorkspace(...args),
}))

vi.mock('@/lib/discord/oauth-state', () => ({
  verifyDiscordOAuthState: (...args: unknown[]) => mockVerifyDiscordOAuthState(...args),
}))

vi.mock('@/lib/discord/guild-commands', () => ({
  registerGuildCommands: (...args: unknown[]) => mockRegisterGuildCommands(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  process.env.DISCORD_HOSTED_CLIENT_ID = 'discord-client-id'
  process.env.DISCORD_HOSTED_CLIENT_SECRET = 'discord-client-secret'
  process.env.DISCORD_HOSTED_BOT_TOKEN = 'discord-bot-token'
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation'

  mockGetUserId.mockReset()
  mockBindAgentToGuildViaShare.mockReset()
  mockGetAssistant.mockReset()
  mockUpdateDiscordGuildMetadata.mockReset()
  mockGetOrganizationById.mockReset()
  mockGetProjectByIdForWorkspace.mockReset()
  mockVerifyDiscordOAuthState.mockReset()
  mockRegisterGuildCommands.mockReset()
  vi.restoreAllMocks()
})

describe('discord oauth callback route', () => {
  it('rejects invalid state tokens', async () => {
    mockVerifyDiscordOAuthState.mockReturnValue(null)

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/discord/oauth/callback?code=abc&state=bad')
    const response = await GET(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired install link. Please restart the install.',
    })
  })

  it('binds the guild and returns popup completion handoff on success', async () => {
    mockVerifyDiscordOAuthState.mockReturnValue({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      userId: 'user-1',
    })
    mockGetUserId.mockResolvedValue('user-1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ guild: { id: 'guild-1' } }), { status: 200 }),
    )
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1', project_id: 'project-1' })
    mockGetOrganizationById.mockResolvedValue({ id: 'org-1', slug: 'acme' })
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'ops' })
    mockBindAgentToGuildViaShare.mockResolvedValue({ ok: true, channelId: 'channel-1' })
    mockUpdateDiscordGuildMetadata.mockResolvedValue(undefined)
    mockRegisterGuildCommands.mockResolvedValue(undefined)

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/discord/oauth/callback?code=abc&state=signed')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('discord-install-result')
    expect(html).toContain('/acme/projects/ops/agents/assistant-1')
    expect(html).toContain('Installed on Discord.')
    expect(mockBindAgentToGuildViaShare).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      guildId: 'guild-1',
    })
    expect(mockUpdateDiscordGuildMetadata).toHaveBeenCalledWith({
      channelId: 'channel-1',
      guildId: 'guild-1',
      guildName: null,
    })
    expect(mockRegisterGuildCommands).toHaveBeenCalledWith({
      clientId: 'discord-client-id',
      botToken: 'discord-bot-token',
      guildId: 'guild-1',
    })
  })
})
