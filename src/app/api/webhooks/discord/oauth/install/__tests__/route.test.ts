import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetOrgMemberRole = vi.fn()
const mockIssueDiscordOAuthState = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

vi.mock('@/lib/db/organizations', () => ({
  getOrgMemberRole: (...args: unknown[]) => mockGetOrgMemberRole(...args),
}))

vi.mock('@/lib/discord/oauth-state', () => ({
  issueDiscordOAuthState: (...args: unknown[]) => mockIssueDiscordOAuthState(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  process.env.DISCORD_HOSTED_CLIENT_ID = 'discord-client-id'
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation'

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetOrgMemberRole.mockReset()
  mockIssueDiscordOAuthState.mockReset()
})

describe('discord oauth install route', () => {
  it('returns 503 when hosted Discord is not configured', async () => {
    delete process.env.DISCORD_HOSTED_CLIENT_ID

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/discord/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Discord hosted bot is not configured on this deployment.',
    })
  })

  it('redirects authorized admins to Discord with a signed state token', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'a1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetOrgMemberRole.mockResolvedValue('owner')
    mockIssueDiscordOAuthState.mockReturnValue('signed-state')

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/discord/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('https://discord.com/api/oauth2/authorize?')
    expect(location).toContain('client_id=discord-client-id')
    expect(location).toContain('state=signed-state')
    expect(location).toContain('permissions=68608')
    expect(mockIssueDiscordOAuthState).toHaveBeenCalledWith({
      assistantId: 'a1',
      orgId: 'org-1',
      userId: 'user-1',
    })
  })
})
