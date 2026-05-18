import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const CURRENT_ASSISTANT_ID = '33333333-3333-4333-8333-333333333333'
const mockListDiscordChannelsForGuild = vi.fn()
const mockSetPrimaryDiscordChannel = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockBuildAssistantAliasMap = vi.fn()

vi.mock('@/lib/db', () => ({
  listDiscordChannelsForGuild: (...args: unknown[]) => mockListDiscordChannelsForGuild(...args),
  setPrimaryDiscordChannel: (...args: unknown[]) => mockSetPrimaryDiscordChannel(...args),
}))

vi.mock('@/lib/channels/admin-route-helpers', () => ({
  requireAssistantChannelAdminAccess: (...args: unknown[]) =>
    mockRequireAssistantChannelAdminAccess(...args),
  buildAssistantAliasMap: (...args: unknown[]) => mockBuildAssistantAliasMap(...args),
  ChannelAdminRouteError: class ChannelAdminRouteError extends Error {
    status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

import { GET, PATCH } from '../route'

beforeEach(() => {
  mockListDiscordChannelsForGuild.mockReset()
  mockSetPrimaryDiscordChannel.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockBuildAssistantAliasMap.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: CURRENT_ASSISTANT_ID, org_id: 'org-1' },
  })
  mockBuildAssistantAliasMap.mockResolvedValue(new Map())
})

describe('assistant discord admin route', () => {
  it('rejects guilds that contain bindings from another org', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-foreign',
        assistant_id: 'assistant-foreign',
        org_id: 'org-2',
        assistant_name: 'Foreign',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await GET(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-admin?guildId=guild-1`),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This Discord server is linked to another workspace and cannot be managed here.',
    })
  })

  it('rejects making a guild default when the current assistant is not bound in that guild', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-other',
        assistant_id: 'assistant-2',
        org_id: 'org-1',
        assistant_name: 'Other',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await PATCH(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-admin`, {
        method: 'PATCH',
        body: JSON.stringify({
          guildId: 'guild-1',
          assistantId: CURRENT_ASSISTANT_ID,
        }),
      }),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(409)
    expect(mockSetPrimaryDiscordChannel).not.toHaveBeenCalled()
  })
})
