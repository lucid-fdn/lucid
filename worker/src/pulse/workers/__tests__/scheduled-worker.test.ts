import { describe, expect, it, vi } from 'vitest'

vi.mock('../../queue.js', () => ({
  PulseQueue: class {},
}))

describe('ScheduledWorker', () => {
  it('stays single-flight for background automation', async () => {
    const { ScheduledWorker } = await import('../scheduled-worker.js')
    const queue = {
      getQueueBacklog: vi.fn().mockResolvedValue({ backlog: 0 }),
    }
    const worker = new ScheduledWorker(
      queue as any,
      'worker-1',
      {} as any,
      {} as any,
    ) as any

    expect(worker.getMaxInflight()).toBe(1)
  })

  it('yields scheduled claims when interactive traffic is queued', async () => {
    const { ScheduledWorker } = await import('../scheduled-worker.js')
    const queue = {
      getQueueBacklog: vi
        .fn()
        .mockImplementation(async (eventType: string) => ({ backlog: eventType === 'inbound' ? 1 : 0 })),
    }
    const worker = new ScheduledWorker(
      queue as any,
      'worker-1',
      {} as any,
      {} as any,
    ) as any

    await expect(worker.shouldDeferClaim()).resolves.toBe(true)
  })
})
