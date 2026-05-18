import { beforeEach, describe, expect, it, vi } from 'vitest'

import { repairOrScheduleCompletedInboundDelivery } from '../legacy-inbound-repair.js'

const mockRepairCompletedInboundDelivery = vi.fn()

vi.mock('../../processors/inbound.js', () => ({
  repairCompletedInboundDelivery: (...args: unknown[]) => mockRepairCompletedInboundDelivery(...args),
}))

describe('repairOrScheduleCompletedInboundDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns true immediately when repair succeeds', async () => {
    mockRepairCompletedInboundDelivery.mockResolvedValueOnce(true)

    const repaired = await repairOrScheduleCompletedInboundDelivery({
      supabase: {} as any,
      config: {} as any,
      eventId: 'event-1',
      logPrefix: '[pulse:test]',
    })

    expect(repaired).toBe(true)
    expect(mockRepairCompletedInboundDelivery).toHaveBeenCalledTimes(1)
  })

  it('schedules a retry when the immediate repair does not succeed', async () => {
    vi.useFakeTimers()
    mockRepairCompletedInboundDelivery
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const repaired = await repairOrScheduleCompletedInboundDelivery({
      supabase: {} as any,
      config: {} as any,
      eventId: 'event-1',
      logPrefix: '[pulse:test]',
      delayMs: 25,
    })

    expect(repaired).toBe(false)
    expect(mockRepairCompletedInboundDelivery).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(25)

    expect(mockRepairCompletedInboundDelivery).toHaveBeenCalledTimes(2)
  })
})
