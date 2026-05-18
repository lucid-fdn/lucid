import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetProjectByIdForWorkspace = vi.fn()
const mockVerifySlackOAuthState = vi.fn()
const mockEncryptChannelSecrets = vi.fn()
const mockCreateServiceClient = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
}))

vi.mock('@/lib/db/organizations', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
}))

vi.mock('@/lib/db/projects', () => ({
  getProjectByIdForWorkspace: (...args: unknown[]) => mockGetProjectByIdForWorkspace(...args),
}))

vi.mock('@/lib/slack/oauth-state', () => ({
  verifySlackOAuthState: (...args: unknown[]) => mockVerifySlackOAuthState(...args),
}))

vi.mock('@/lib/channels/secrets', () => ({
  encryptChannelSecrets: (...args: unknown[]) => mockEncryptChannelSecrets(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { GET } from '../route'

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.lucid.foundation'
  process.env.SLACK_HOSTED_CLIENT_ID = 'slack-client-id'
  process.env.SLACK_HOSTED_CLIENT_SECRET = 'slack-client-secret'
  process.env.SLACK_HOSTED_APP_TOKEN = 'xapp-slack-app-token'
  process.env.ENCRYPTION_KEY = 'x'.repeat(32)

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockGetOrganizationById.mockReset()
  mockGetProjectByIdForWorkspace.mockReset()
  mockVerifySlackOAuthState.mockReset()
  mockEncryptChannelSecrets.mockReset()
  mockCreateServiceClient.mockReset()
  vi.restoreAllMocks()
})

describe('slack oauth callback route', () => {
  it('rejects invalid state tokens', async () => {
    mockVerifySlackOAuthState.mockReturnValue(null)

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/slack/oauth/callback?state=bad')
    const response = await GET(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired state',
    })
  })

  it('redirects unauthenticated callbacks to login with the original callback as next', async () => {
    mockVerifySlackOAuthState.mockReturnValue({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      userId: 'user-1',
    })
    mockGetUserId.mockResolvedValue(null)

    const request = new NextRequest(
      'https://www.lucid.foundation/api/webhooks/slack/oauth/callback?state=signed&code=oauth-code',
    )
    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://www.lucid.foundation/login?next=%2Fapi%2Fwebhooks%2Fslack%2Foauth%2Fcallback%3Fstate%3Dsigned%26code%3Doauth-code',
    )
  })

  it('persists the hosted install and returns popup completion html on success', async () => {
    mockVerifySlackOAuthState.mockReturnValue({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      userId: 'user-1',
    })
    mockGetUserId.mockResolvedValue('user-1')
    mockGetOrganizationById.mockResolvedValue({ id: 'org-1', slug: 'acme' })
    mockGetAssistant.mockResolvedValue({
      id: 'assistant-1',
      org_id: 'org-1',
      project_id: 'project-1',
    })
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'alpha' })
    mockEncryptChannelSecrets.mockReturnValue('encrypted-secrets')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          access_token: 'xoxb-access-token',
          team: { id: 'T123', name: 'Acme Workspace' },
          bot_user_id: 'U999',
        }),
        { status: 200 },
      ),
    )

    const secretsInsert = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'secret-1' }, error: null }),
      }),
    }
    const assistantChannelsSelect = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    assistantChannelsSelect.eq.mockReturnValue(assistantChannelsSelect)
    const assistantChannelsInsert = vi.fn().mockResolvedValue({ error: null })

    mockCreateServiceClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'encrypted_secrets') {
          return {
            insert: vi.fn().mockReturnValue(secretsInsert),
          }
        }
        if (table === 'assistant_channels') {
          return {
            select: vi.fn().mockReturnValue(assistantChannelsSelect),
            insert: assistantChannelsInsert,
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/slack/oauth/callback?state=signed&code=oauth-code')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('slack-install-result')
    expect(html).toContain('Slack installed. Open the Lucid app in Slack to choose a DM or channel')
    expect(html).toContain('/acme/projects/alpha/agents/assistant-1?toast=success')
    expect(html).toContain('channel_modal=1')
    expect(html).toContain('channel_type=slack')
    expect(html).toContain('connection_mode=hosted')

    expect(assistantChannelsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant_id: 'assistant-1',
        channel_type: 'slack',
        connection_mode: 'hosted',
        external_channel_id: null,
        is_active: false,
        encrypted_secrets_id: 'secret-1',
        channel_config: expect.objectContaining({
          hosted: true,
          install_status: 'installed_unbound',
          slack_team_id: 'T123',
          slack_team_name: 'Acme Workspace',
        }),
      }),
    )
  })
})
