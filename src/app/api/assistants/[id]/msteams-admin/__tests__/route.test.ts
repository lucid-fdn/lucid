import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const CURRENT_ASSISTANT_ID = '33333333-3333-4333-8333-333333333333'
const mockListTeamsChannelsForConversation = vi.fn()
const mockListTeamsChannelsForTenant = vi.fn()
const mockSetPrimaryTeamsChannel = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()
const mockSetChannelSurfaceDefault = vi.fn()
const mockClearChannelSurfaceDefault = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockBuildAssistantAliasMap = vi.fn()

vi.mock('@/lib/db', () => ({
  listTeamsChannelsForConversation: (...args: unknown[]) =>
    mockListTeamsChannelsForConversation(...args),
  listTeamsChannelsForTenant: (...args: unknown[]) => mockListTeamsChannelsForTenant(...args),
  setPrimaryTeamsChannel: (...args: unknown[]) => mockSetPrimaryTeamsChannel(...args),
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) =>
    mockGetChannelSurfaceDefaultBinding(...args),
  setChannelSurfaceDefault: (...args: unknown[]) => mockSetChannelSurfaceDefault(...args),
  clearChannelSurfaceDefault: (...args: unknown[]) => mockClearChannelSurfaceDefault(...args),
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
  mockListTeamsChannelsForConversation.mockReset()
  mockListTeamsChannelsForTenant.mockReset()
  mockSetPrimaryTeamsChannel.mockReset()
  mockGetChannelSurfaceDefaultBinding.mockReset()
  mockSetChannelSurfaceDefault.mockReset()
  mockClearChannelSurfaceDefault.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockBuildAssistantAliasMap.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: CURRENT_ASSISTANT_ID, org_id: 'org-1' },
  })
  mockBuildAssistantAliasMap.mockResolvedValue(new Map())
  mockGetChannelSurfaceDefaultBinding.mockResolvedValue(null)
})

describe('assistant msteams admin route', () => {
  it('rejects tenants that contain bindings from another org', async () => {
    mockListTeamsChannelsForTenant.mockResolvedValue([
      {
        id: 'tenant-binding-foreign',
        assistant_id: 'assistant-foreign',
        org_id: 'org-2',
        assistant_name: 'Foreign',
        assistant_description: null,
        is_active: true,
        is_primary: false,
        external_channel_id: 'conv-foreign',
      },
    ])

    const response = await GET(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/msteams-admin?tenantId=tenant-1`),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This Microsoft Teams tenant is linked to another workspace and cannot be managed here.',
    })
  })

  it('rejects setting the tenant default when the current assistant is not installed in that tenant', async () => {
    mockListTeamsChannelsForTenant.mockResolvedValue([
      {
        id: 'tenant-binding-other',
        assistant_id: 'assistant-2',
        org_id: 'org-1',
        assistant_name: 'Other',
        assistant_description: null,
        is_active: true,
        is_primary: false,
        external_channel_id: null,
      },
    ])

    const response = await PATCH(
      new NextRequest(`http://localhost/api/assistants/${CURRENT_ASSISTANT_ID}/msteams-admin`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_tenant_default',
          tenantId: 'tenant-1',
          assistantChannelId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: CURRENT_ASSISTANT_ID }) } as never,
    )

    expect(response.status).toBe(409)
    expect(mockSetChannelSurfaceDefault).not.toHaveBeenCalled()
  })
})
