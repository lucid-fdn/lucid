import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    rpc,
  },
}))

describe('withInternalJobLock', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('acquires and releases the lock around the job', async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })

    const { withInternalJobLock } = await import('@/lib/locks/internal-job-lock')
    const result = await withInternalJobLock('skills:catalog-reconcile', async () => 'ok')

    expect(result).toBe('ok')
    expect(rpc).toHaveBeenNthCalledWith(1, 'acquire_internal_job_lock', expect.objectContaining({
      p_lock_name: 'skills:catalog-reconcile',
    }))
    expect(rpc).toHaveBeenNthCalledWith(2, 'release_internal_job_lock', expect.objectContaining({
      p_lock_name: 'skills:catalog-reconcile',
    }))
  })

  it('throws when the lock cannot be acquired', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null })

    const { withInternalJobLock, InternalJobLockError } = await import('@/lib/locks/internal-job-lock')

    await expect(withInternalJobLock('skills:catalog-reconcile', async () => 'nope')).rejects.toBeInstanceOf(InternalJobLockError)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
