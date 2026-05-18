import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetOrgMemberRole = vi.fn()
const mockIssueTeamsOAuthState = vi.fn()

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

vi.mock('@/lib/features', () => ({
  FEATURES: {
    teamsHosted: true,
  },
}))

vi.mock('@/lib/msteams/oauth-state', () => ({
  issueTeamsOAuthState: (...args: unknown[]) => mockIssueTeamsOAuthState(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  process.env.MSTEAMS_HOSTED_INSTALL_URL = 'https://teams.microsoft.com/oauth/install'

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetOrgMemberRole.mockReset()
  mockIssueTeamsOAuthState.mockReset()
})

describe('teams oauth install route', () => {
  it('returns 503 when hosted Teams install is not configured', async () => {
    delete process.env.MSTEAMS_HOSTED_INSTALL_URL

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/msteams/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'MSTEAMS_HOSTED_INSTALL_URL is not configured',
    })
  })

  it('redirects authorized admins without requiring a share toggle', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({
      id: 'a1',
      org_id: 'org-1',
      msteams_share_enabled: false,
    })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetOrgMemberRole.mockResolvedValue('owner')
    mockIssueTeamsOAuthState.mockReturnValue('signed-state')

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/msteams/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://teams.microsoft.com/oauth/install')
    expect(location.searchParams.get('state')).toBe('signed-state')
    expect(location.searchParams.get('assistant_id')).toBe('a1')
    expect(mockIssueTeamsOAuthState).toHaveBeenCalledWith({
      assistantId: 'a1',
      orgId: 'org-1',
      userId: 'user-1',
    })
  })
})
