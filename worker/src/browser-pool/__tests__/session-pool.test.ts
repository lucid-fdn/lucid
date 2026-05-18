import { describe, expect, it } from 'vitest'
import { BrowserSessionPool } from '../session-pool.js'

describe('BrowserSessionPool', () => {
  it('enforces per-org concurrency and releases queued leases', async () => {
    const pool = new BrowserSessionPool({
      maxConcurrency: 2,
      maxConcurrencyPerOrg: 1,
      leaseWaitTimeoutMs: 1000,
      maxLeaseMs: 60_000,
    })

    const first = await pool.acquire({ orgId: 'org-1' })
    const queued = pool.acquire({ orgId: 'org-1' })
    expect(pool.metrics()).toMatchObject({ activeLeases: 1, queuedRequests: 1 })

    pool.release(first.id)
    await expect(queued).resolves.toMatchObject({ orgId: 'org-1' })
    expect(pool.metrics().activeLeases).toBe(1)
  })

  it('tracks expired leases as released capacity', async () => {
    const pool = new BrowserSessionPool({
      maxConcurrency: 1,
      maxConcurrencyPerOrg: 1,
      leaseWaitTimeoutMs: 1000,
      maxLeaseMs: 1,
    })

    const lease = await pool.acquire({ orgId: 'org-1' })
    const expired = pool.sweepExpired(lease.acquiredAt + 10)

    expect(expired).toEqual([lease.id])
    expect(pool.metrics().activeLeases).toBe(0)
  })
})
