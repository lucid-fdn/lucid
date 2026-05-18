import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMaybeSingle = vi.fn()
const mockSelect = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockIn = vi.fn(() => ({ select: mockSelect }))
const mockEq = vi.fn(() => ({ in: mockIn }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ update: mockUpdate }))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: { captureException: vi.fn() },
}))

import { claimCheckoutAttempt } from '@/lib/db/checkout-attempts'

describe('claimCheckoutAttempt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'attempt-1',
        status: 'completed',
      },
      error: null,
    })
  })

  it('claims attempts from pending or partial status', async () => {
    const result = await claimCheckoutAttempt('attempt-1')

    expect(result).toEqual({
      id: 'attempt-1',
      status: 'completed',
    })
    expect(mockFrom).toHaveBeenCalledWith('checkout_attempts')
    expect(mockEq).toHaveBeenCalledWith('id', 'attempt-1')
    expect(mockIn).toHaveBeenCalledWith('status', ['pending', 'partial'])
  })
})
