import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireUserId = vi.fn()
const mockDecideNativeApproval = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  requireUserId: () => mockRequireUserId(),
}))

vi.mock('@/lib/native/control-plane', () => ({
  decideNativeApproval: (...args: unknown[]) => mockDecideNativeApproval(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

describe('/api/native/approvals/[id]/decision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserId.mockResolvedValue('00000000-0000-4000-8000-000000000001')
  })

  it('records approve and deny decisions with confirmation metadata', async () => {
    mockDecideNativeApproval.mockReturnValue({
      approval: { id: 'approval-1', title: 'Approve', summary: 'Risky', risk: 'confirmation-required', status: 'approved', createdAt: '2026-05-18T00:00:00.000Z' },
      receipt: { actionId: 'approve:approval-1', status: 'queued', receiptId: 'receipt-1' },
    })
    const request = new NextRequest('https://app.lucid.example/api/native/approvals/approval-1/decision', {
      method: 'POST',
      body: JSON.stringify({
        decision: 'approve',
        confirmation: { confirmedAt: '2026-05-18T00:00:00.000Z', method: 'biometric' },
      }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'approval-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ receipt: { receiptId: 'receipt-1' } })
    expect(mockDecideNativeApproval).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'approval-1', {
      decision: 'approve',
      confirmation: { confirmedAt: '2026-05-18T00:00:00.000Z', method: 'biometric' },
    })
  })
})

