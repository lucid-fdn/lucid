import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockListNativeInbox = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/native/control-plane', () => ({
  listNativeInbox: (...args: unknown[]) => mockListNativeInbox(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET } from '../route'

describe('/api/native/inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000001')
  })

  it('returns the native approval wallet inbox', async () => {
    mockListNativeInbox.mockReturnValue({
      approvals: [{ id: 'approval-1', title: 'Approve run', summary: 'Risky work', risk: 'confirmation-required', status: 'pending', createdAt: '2026-05-18T00:00:00.000Z' }],
      runs: [],
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ approvals: [{ id: 'approval-1' }] })
    expect(mockListNativeInbox).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
  })
})

