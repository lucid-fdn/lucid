import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetOrgMemberRole = vi.fn()
const mockIssueSlackOAuthState = vi.fn()

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
    slackHosted: true,
  },
}))

vi.mock('@/lib/slack/oauth-state', () => ({
  issueSlackOAuthState: (...args: unknown[]) => mockIssueSlackOAuthState(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  process.env.SLACK_HOSTED_CLIENT_ID = 'slack-client-id'
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation'
  delete process.env.SLACK_HOSTED_REDIRECT_BASE_URL

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetOrgMemberRole.mockReset()
  mockIssueSlackOAuthState.mockReset()
})

describe('slack oauth install route', () => {
  it('returns 503 when hosted Slack is not configured', async () => {
    delete process.env.SLACK_HOSTED_CLIENT_ID

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/slack/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Slack hosted install is not configured. Set SLACK_HOSTED_CLIENT_ID or SLACK_HOSTED_INSTALL_URL.',
    })
  })

  it('returns 503 on localhost without an HTTPS redirect override', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

    const request = new NextRequest('http://localhost:3000/api/webhooks/slack/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Slack hosted install needs a public HTTPS callback URL. Set SLACK_HOSTED_REDIRECT_BASE_URL to an HTTPS tunnel URL, or use the deployed Lucid site.',
    })
  })

  it('uses SLACK_HOSTED_REDIRECT_BASE_URL when building the Slack redirect_uri', async () => {
    process.env.SLACK_HOSTED_REDIRECT_BASE_URL = 'https://lucid-dev.ngrok.app'

    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'a1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockGetOrgMemberRole.mockResolvedValue('owner')
    mockIssueSlackOAuthState.mockReturnValue('signed-state')

    const request = new NextRequest('http://localhost:3000/api/webhooks/slack/oauth/install?assistant_id=a1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://slack.com/oauth/v2/authorize')
    expect(location.searchParams.get('client_id')).toBe('slack-client-id')
    expect(location.searchParams.get('state')).toBe('signed-state')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://lucid-dev.ngrok.app/api/webhooks/slack/oauth/callback',
    )
    expect(mockIssueSlackOAuthState).toHaveBeenCalledWith({
      assistantId: 'a1',
      orgId: 'org-1',
      userId: 'user-1',
    })
  })
})
