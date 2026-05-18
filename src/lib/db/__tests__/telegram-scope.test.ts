import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const captureExceptionMock = vi.fn()
const fromMock = vi.fn()

vi.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
  },
}))

import { persistTelegramChatScope } from '@/lib/db'

describe('persistTelegramChatScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates existing telegram channel rows without upserting partial records', async () => {
    const fetchEqChat = vi.fn().mockResolvedValue({
      data: [
        { id: 'ch-1', channel_config: { existing: true } },
        { id: 'ch-2', channel_config: null },
      ],
      error: null,
    })
    const fetchEqActive = vi.fn(() => ({ eq: fetchEqChat }))
    const fetchEqType = vi.fn(() => ({ eq: fetchEqActive }))

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: updateEq }))

    fromMock
      .mockImplementationOnce(() => ({
        select: vi.fn(() => ({ eq: fetchEqType })),
      }))
      .mockImplementationOnce(() => ({
        update: updateMock,
      }))
      .mockImplementationOnce(() => ({
        update: updateMock,
      }))

    await persistTelegramChatScope('chat-1', 'org-9')

    expect(updateMock).toHaveBeenNthCalledWith(1, {
      channel_config: { existing: true, active_workspace_org_id: 'org-9' },
    })
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      channel_config: { active_workspace_org_id: 'org-9' },
    })
    expect(updateEq).toHaveBeenNthCalledWith(1, 'id', 'ch-1')
    expect(updateEq).toHaveBeenNthCalledWith(2, 'id', 'ch-2')
  })
})
