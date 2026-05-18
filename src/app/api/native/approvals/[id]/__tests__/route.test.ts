import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockGetNativeApprovalDetail = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/native/control-plane', () => ({
  getNativeApprovalDetail: (...args: unknown[]) => mockGetNativeApprovalDetail(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET } from '../route'

describe('/api/native/approvals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000001')
  })

  it('returns approval detail with policy checks', async () => {
    mockGetNativeApprovalDetail.mockReturnValue({
      approval: { id: 'approval-1', title: 'Approve', summary: 'Risky', risk: 'confirmation-required', status: 'pending', createdAt: '2026-05-18T00:00:00.000Z' },
      explanation: 'Agent needs confirmation.',
      recommendedDecision: 'approve',
      policyChecks: [{ label: 'User confirmation', status: 'warn', detail: 'Waiting for approval.' }],
    })

    const response = await GET(new Request('https://app.lucid.example/api/native/approvals/approval-1'), {
      params: Promise.resolve({ id: 'approval-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ recommendedDecision: 'approve' })
    expect(mockGetNativeApprovalDetail).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'approval-1')
  })
})
