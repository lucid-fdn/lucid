import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const CURRENT_ASSISTANT_ID = '33333333-3333-4333-8333-333333333333'
const mockListDiscordChannelsForGuild = vi.fn()
const mockListChannelSurfaceDefaultBindings = vi.fn()
const mockSetChannelSurfaceDefault = vi.fn()
const mockClearChannelSurfaceDefault = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockDiscordWorkerFetch = vi.fn()

vi.mock('@/lib/db', () => ({
  listDiscordChannelsForGuild: (...args: unknown[]) => mockListDiscordChannelsForGuild(...args),
}))

vi.mock('@/lib/db/channel-routing', () => ({
  listChannelSurfaceDefaultBindings: (...args: unknown[]) =>
    mockListChannelSurfaceDefaultBindings(...args),
  setChannelSurfaceDefault: (...args: unknown[]) => mockSetChannelSurfaceDefault(...args),
  clearChannelSurfaceDefault: (...args: unknown[]) => mockClearChannelSurfaceDefault(...args),
}))

vi.mock('@/lib/channels/admin-route-helpers', () => ({
  requireAssistantChannelAdminAccess: (...args: unknown[]) =>
    mockRequireAssistantChannelAdminAccess(...args),
  ChannelAdminRouteError: class ChannelAdminRouteError extends Error {
    status: number

    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('@/lib/discord/worker-admin', () => ({
  discordWorkerFetch: (...args: unknown[]) => mockDiscordWorkerFetch(...args),
}))

import { GET, PATCH } from '../route'

beforeEach(() => {
  mockListDiscordChannelsForGuild.mockReset()
  mockListChannelSurfaceDefaultBindings.mockReset()
  mockSetChannelSurfaceDefault.mockReset()
  mockClearChannelSurfaceDefault.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockDiscordWorkerFetch.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: CURRENT_ASSISTANT_ID, org_id: 'org-1' },
  })
  mockDiscordWorkerFetch.mockResolvedValue({
    channels: [
      {
        id: 'discord-channel-1',
        name: 'general',
        type: 'text',
        parentId: null,
        parentName: null,
        position: 0,
      },
      {
        id: 'discord-channel-2',
        name: 'sales',
        type: 'text',
        parentId: null,
        parentName: null,
        position: 1,
      },
    ],
  })
  mockListChannelSurfaceDefaultBindings.mockResolvedValue([])
})

describe('assistant discord channels route', () => {
  it('returns guild channels with per-channel ownership overlays', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-1',
        assistant_id: CURRENT_ASSISTANT_ID,
        org_id: 'org-1',
        assistant_name: 'Shared',
        assistant_description: null,
        is_primary: true,
      },
      {
        id: 'binding-2',
        assistant_id: '44444444-4444-4444-8444-444444444444',
        org_id: 'org-1',
        assistant_name: 'Sales',
        assistant_description: null,
        is_primary: false,
      },
    ])
    mockListChannelSurfaceDefaultBindings.mockResolvedValue([
      {
        surfaceOwnerId: 'discord-channel-2',
        assistantId: '44444444-4444-4444-8444-444444444444',
        assistantChannelId: 'binding-2',
      },
    ])

    const response = await GET(
      new NextRequest(
        `http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-channels?guildId=guild-1`,
      ),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      guildId: 'guild-1',
      channels: [
        {
          id: 'discord-channel-1',
          assignedAssistantId: null,
          usesGuildDefault: true,
        },
        {
          id: 'discord-channel-2',
          assignedAssistantId: '44444444-4444-4444-8444-444444444444',
          assignedAssistantName: 'Sales',
          usesGuildDefault: false,
        },
      ],
    })
  })

  it('assigns a guild-connected assistant to a specific Discord channel', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-1',
        assistant_id: CURRENT_ASSISTANT_ID,
        org_id: 'org-1',
        assistant_name: 'Shared',
        assistant_description: null,
        is_primary: true,
      },
      {
        id: 'binding-2',
        assistant_id: '44444444-4444-4444-8444-444444444444',
        org_id: 'org-1',
        assistant_name: 'Sales',
        assistant_description: null,
        is_primary: false,
      },
    ])

    const response = await PATCH(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-channels`, {
        method: 'PATCH',
        body: JSON.stringify({
          guildId: 'guild-1',
          discordChannelId: 'discord-channel-2',
          assistantId: '44444444-4444-4444-8444-444444444444',
        }),
      }),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(200)
    expect(mockSetChannelSurfaceDefault).toHaveBeenCalledWith({
      channelType: 'discord',
      surfaceOwnerKind: 'discord-channel',
      surfaceOwnerId: 'discord-channel-2',
      assistantId: '44444444-4444-4444-8444-444444444444',
      assistantChannelId: 'binding-2',
    })
  })

  it('clears an explicit Discord channel assignment back to guild default', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-1',
        assistant_id: CURRENT_ASSISTANT_ID,
        org_id: 'org-1',
        assistant_name: 'Shared',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await PATCH(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-channels`, {
        method: 'PATCH',
        body: JSON.stringify({
          guildId: 'guild-1',
          discordChannelId: 'discord-channel-2',
          assistantId: null,
        }),
      }),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(200)
    expect(mockClearChannelSurfaceDefault).toHaveBeenCalledWith({
      channelType: 'discord',
      surfaceOwnerKind: 'discord-channel',
      surfaceOwnerId: 'discord-channel-2',
    })
  })

  it('surfaces a stale worker deployment with a useful error message', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-1',
        assistant_id: CURRENT_ASSISTANT_ID,
        org_id: 'org-1',
        assistant_name: 'Shared',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockDiscordWorkerFetch.mockRejectedValue(new Error('Worker 404: Not Found'))

    const response = await GET(
      new NextRequest(
        `http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-channels?guildId=guild-1`,
      ),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Discord channel inventory is not available on the current worker deployment yet. Redeploy the gateway worker on the latest commit and try again.',
    })
  })

  it('surfaces a missing Discord gateway worker with a useful error message', async () => {
    mockListDiscordChannelsForGuild.mockResolvedValue([
      {
        id: 'binding-1',
        assistant_id: CURRENT_ASSISTANT_ID,
        org_id: 'org-1',
        assistant_name: 'Shared',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockDiscordWorkerFetch.mockRejectedValue(new Error('Worker 503: {"error":"Discord gateway unavailable"}'))

    const response = await GET(
      new NextRequest(
        `http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/discord-channels?guildId=guild-1`,
      ),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error:
        'Discord channel inventory requires a gateway worker with the hosted Discord bot active. Check WORKER_ROLE and the Discord gateway deployment.',
    })
  })
})
