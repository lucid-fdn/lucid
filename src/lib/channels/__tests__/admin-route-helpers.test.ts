import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveAssistantChannelAlias = vi.fn()
const mockCreateAssistantChannelAlias = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: vi.fn(),
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/db/channel-routing', () => ({
  createAssistantChannelAlias: (...args: unknown[]) => mockCreateAssistantChannelAlias(...args),
  deleteAssistantChannelAlias: vi.fn(),
  listAssistantChannelAliases: vi.fn(),
  resolveAssistantChannelAlias: (...args: unknown[]) => mockResolveAssistantChannelAlias(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))

import { createChannelAliasWithConflictCheck } from '../admin-route-helpers'

describe('createChannelAliasWithConflictCheck', () => {
  beforeEach(() => {
    mockResolveAssistantChannelAlias.mockReset()
    mockCreateAssistantChannelAlias.mockReset()
  })

  it('returns a clean conflict when the insert loses a uniqueness race', async () => {
    mockResolveAssistantChannelAlias
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'alias-1',
        assistant_id: 'assistant-2',
      })
    mockCreateAssistantChannelAlias.mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    })

    await expect(
      createChannelAliasWithConflictCheck({
        assistantId: 'assistant-1',
        channelType: 'discord',
        surfaceOwnerKind: 'guild',
        surfaceOwnerId: 'guild-1',
        alias: 'sales',
      }),
    ).resolves.toEqual({
      ok: false,
      existingAssistantId: 'assistant-2',
    })
  })
})
