import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetTelegramChatScope = vi.fn()
const mockRequireAssistantChannelAdminAccess = vi.fn()
const mockCreateChannelAliasWithConflictCheck = vi.fn()
const mockDeleteOwnedChannelAlias = vi.fn()

vi.mock('@/lib/db', () => ({
  getTelegramChatScope: (...args: unknown[]) => mockGetTelegramChatScope(...args),
}))

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
  mockGetTelegramChatScope.mockReset()
  mockRequireAssistantChannelAdminAccess.mockReset()
  mockCreateChannelAliasWithConflictCheck.mockReset()
  mockDeleteOwnedChannelAlias.mockReset()

  mockRequireAssistantChannelAdminAccess.mockResolvedValue({
    assistant: { id: 'assistant-1', org_id: 'org-1' },
  })
  mockGetTelegramChatScope.mockResolvedValue({ orgId: 'org-1' })
})

describe('assistant telegram aliases route', () => {
  it('returns a 409 when the alias is already used by another assistant in the workspace', async () => {
    mockCreateChannelAliasWithConflictCheck.mockResolvedValue({
      ok: false,
      existingAssistantId: 'assistant-2',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/assistants/assistant-1/telegram-aliases', {
        method: 'POST',
        body: JSON.stringify({ chatId: 'chat-1', alias: 'marketing' }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '"marketing" is already used by another agent in this Telegram workspace.',
      conflict: { assistantId: 'assistant-2' },
    })
  })

  it('returns a 404 when the chat scope no longer exists', async () => {
    mockGetTelegramChatScope.mockResolvedValueOnce(null)

    const response = await DELETE(
      new NextRequest('http://localhost/api/assistants/assistant-1/telegram-aliases', {
        method: 'DELETE',
        body: JSON.stringify({
          chatId: 'chat-missing',
          aliasId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
      { params: Promise.resolve({ id: 'assistant-1' }) } as never,
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Telegram chat scope not found.',
    })
  })
})
