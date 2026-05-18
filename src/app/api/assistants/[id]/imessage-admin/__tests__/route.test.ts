import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mockListIMessageChannelsForChat = vi.fn()
const mockSetPrimaryIMessageChannel = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockBuildAssistantAliasMap = vi.fn()

vi.mock('@/lib/db', () => ({
  listIMessageChannelsForChat: (...args: unknown[]) => mockListIMessageChannelsForChat(...args),
  setPrimaryIMessageChannel: (...args: unknown[]) => mockSetPrimaryIMessageChannel(...args),
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
  mockListIMessageChannelsForChat.mockReset()
  mockSetPrimaryIMessageChannel.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockBuildAssistantAliasMap.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1' },
  })
  mockBuildAssistantAliasMap.mockResolvedValue(new Map())
})

describe('assistant imessage admin route', () => {
  it('rejects chats that contain bindings from another org', async () => {
    mockListIMessageChannelsForChat.mockResolvedValue([
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
      new NextRequest('http://localhost/api/assistants/assistant-1/imessage-admin?chatId=chat-1'),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This iMessage chat is linked to another workspace and cannot be managed here.',
    })
  })

  it('rejects setting a chat default when the binding does not belong to the current assistant', async () => {
    mockListIMessageChannelsForChat.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        assistant_id: 'assistant-2',
        org_id: 'org-1',
        assistant_name: 'Other',
        assistant_description: null,
        is_primary: true,
      },
    ])

    const response = await PATCH(
      new NextRequest('http://localhost/api/assistants/assistant-1/imessage-admin', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_chat_default',
          chatId: 'chat-1',
          bindingChannelId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    expect(mockSetPrimaryIMessageChannel).not.toHaveBeenCalled()
  })
})
