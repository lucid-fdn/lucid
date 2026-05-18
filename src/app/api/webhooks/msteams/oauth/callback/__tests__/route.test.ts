import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetProjectByIdForWorkspace = vi.fn()
const mockVerifyTeamsOAuthState = vi.fn()
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

vi.mock('@/lib/msteams/oauth-state', () => ({
  verifyTeamsOAuthState: (...args: unknown[]) => mockVerifyTeamsOAuthState(...args),
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
  process.env.MSTEAMS_HOSTED_APP_ID = 'teams-app-id'
  process.env.MSTEAMS_HOSTED_APP_PASSWORD = 'teams-app-password'
  process.env.MSTEAMS_HOSTED_TENANT_ID = 'tenant-1'
  process.env.ENCRYPTION_KEY = 'x'.repeat(32)

  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockGetOrganizationById.mockReset()
  mockGetProjectByIdForWorkspace.mockReset()
  mockVerifyTeamsOAuthState.mockReset()
  mockEncryptChannelSecrets.mockReset()
  mockCreateServiceClient.mockReset()
})

describe('teams oauth callback route', () => {
  it('rejects invalid state tokens', async () => {
    mockVerifyTeamsOAuthState.mockReturnValue(null)

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/msteams/oauth/callback?state=bad')
    const response = await GET(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired state',
    })
  })

  it('stores a pending hosted bind and redirects back to the assistant page', async () => {
    mockVerifyTeamsOAuthState.mockReturnValue({
      assistantId: 'assistant-1',
      orgId: 'org-1',
      userId: 'user-1',
    })
    mockGetUserId.mockResolvedValue('user-1')
    mockGetOrganizationById.mockResolvedValue({ id: 'org-1', slug: 'acme' })
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1', project_id: 'project-1' })
    mockGetProjectByIdForWorkspace.mockResolvedValue({ id: 'project-1', slug: 'ops' })
    mockEncryptChannelSecrets.mockReturnValue('encrypted-secrets')

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

    const request = new NextRequest('https://www.lucid.foundation/api/webhooks/msteams/oauth/callback?state=signed&tenant_id=tenant-1&tenant_name=Acme')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/acme/projects/ops/agents/assistant-1')
    expect(location.searchParams.get('toast')).toBe('success')
    expect(location.searchParams.get('toast_msg')).toContain('Microsoft Teams installed. Open the Teams conversation where this agent should be active and run "bind".')
    expect(assistantChannelsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant_id: 'assistant-1',
        channel_type: 'msteams',
        connection_mode: 'hosted',
        external_channel_id: null,
        is_active: false,
        encrypted_secrets_id: 'secret-1',
      }),
    )
  })
})
