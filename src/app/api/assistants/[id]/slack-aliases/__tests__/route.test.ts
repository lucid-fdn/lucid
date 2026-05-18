import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockCreateChannelAliasWithConflictCheck = vi.fn()
const mockDeleteOwnedChannelAlias = vi.fn()
const mockGetHostedSlackInstallForAssistant = vi.fn()
const mockListHostedSlackWorkspaceAgents = vi.fn()
const mockCreateServiceClient = vi.fn()

vi.mock('@/lib/channels/admin-route-helpers', () => ({
  requireAssistantChannelAdminAccess: (...args: unknown[]) =>
    mockRequireAssistantChannelAdminAccess(...args),
  createChannelAliasWithConflictCheck: (...args: unknown[]) =>
    mockCreateChannelAliasWithConflictCheck(...args),
  deleteOwnedChannelAlias: (...args: unknown[]) => mockDeleteOwnedChannelAlias(...args),
  ChannelAdminRouteError: class ChannelAdminRouteError extends Error {
    status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/lib/slack/hosted-bindings', () => ({
  getHostedSlackInstallForAssistant: (...args: unknown[]) =>
    mockGetHostedSlackInstallForAssistant(...args),
  listHostedSlackWorkspaceAgents: (...args: unknown[]) =>
    mockListHostedSlackWorkspaceAgents(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { POST, DELETE } from '../route'

beforeEach(() => {
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockCreateChannelAliasWithConflictCheck.mockReset()
  mockDeleteOwnedChannelAlias.mockReset()
  mockGetHostedSlackInstallForAssistant.mockReset()
  mockListHostedSlackWorkspaceAgents.mockReset()
  mockCreateServiceClient.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1' },
  })
  mockGetHostedSlackInstallForAssistant.mockResolvedValue({ id: 'install-1', teamId: 'team-1' })
})

describe('assistant slack aliases route', () => {
  it('returns a 409 with owner metadata when another agent already owns the alias', async () => {
    mockCreateChannelAliasWithConflictCheck.mockResolvedValue({
      ok: false,
      existingAssistantId: 'assistant-2',
    })
    mockListHostedSlackWorkspaceAgents.mockResolvedValue([
      {
        assistantId: 'assistant-2',
        assistantName: 'Sales Agent',
      },
    ])

    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/slack-aliases', {
        method: 'POST',
        body: JSON.stringify({ alias: 'sales' }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '"sales" is already used by Sales Agent.',
      conflict: {
        assistantId: 'assistant-2',
        assistantName: 'Sales Agent',
      },
    })
  })

  it('returns a 404 when deleting a Slack alias that is not owned by this assistant', async () => {
    mockDeleteOwnedChannelAlias.mockResolvedValue(false)

    const response = await DELETE(
      new NextRequest('http://localhost/api/assistants/assistant-1/slack-aliases', {
        method: 'DELETE',
        body: JSON.stringify({
          aliasId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Slack alias not found.',
    })
  })
})
