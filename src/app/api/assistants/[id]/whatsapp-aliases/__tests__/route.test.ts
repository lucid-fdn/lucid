import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockCreateChannelAliasWithConflictCheck = vi.fn()
const mockDeleteOwnedChannelAlias = vi.fn()

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

import { POST, DELETE } from '../route'

beforeEach(() => {
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockCreateChannelAliasWithConflictCheck.mockReset()
  mockDeleteOwnedChannelAlias.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1' },
  })
})

describe('assistant whatsapp aliases route', () => {
  it('returns a 409 when another assistant already owns the alias in the chat', async () => {
    mockCreateChannelAliasWithConflictCheck.mockResolvedValue({
      ok: false,
      existingAssistantId: 'assistant-2',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-aliases', {
        method: 'POST',
        body: JSON.stringify({ chatId: 'chat-1', alias: 'support' }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '"support" is already used by another agent in this WhatsApp chat.',
      conflict: { assistantId: 'assistant-2' },
    })
  })

  it('returns a 404 when deleting an alias the assistant does not own', async () => {
    mockDeleteOwnedChannelAlias.mockResolvedValue(false)

    const response = await DELETE(
      new NextRequest('http://localhost/api/assistants/assistant-1/whatsapp-aliases', {
        method: 'DELETE',
        body: JSON.stringify({
          chatId: 'chat-1',
          aliasId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'WhatsApp alias not found.',
    })
  })
})
