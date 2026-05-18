import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockGetNativeRunDetail = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/native/control-plane', () => ({
  getNativeRunDetail: (...args: unknown[]) => mockGetNativeRunDetail(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET } from '../route'

describe('/api/native/runs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000001')
  })

  it('returns a native run timeline', async () => {
    mockGetNativeRunDetail.mockReturnValue({
      run: { id: 'run-1', title: 'Checkout QA', status: 'running', progress: 72, needsApproval: false, updatedAt: '2026-05-18T00:00:00.000Z' },
      timeline: [{ id: 'event-1', at: '2026-05-18T00:00:00.000Z', title: 'Run registered', level: 'info' }],
    })

    const response = await GET(new Request('https://app.lucid.example/api/native/runs/run-1'), {
      params: Promise.resolve({ id: 'run-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ timeline: [{ id: 'event-1' }] })
    expect(mockGetNativeRunDetail).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'run-1')
  })
})
