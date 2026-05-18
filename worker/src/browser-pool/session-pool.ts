import crypto from 'node:crypto'

export type BrowserPoolLease = {
  id: string
  orgId?: string
  acquiredAt: number
  waitMs: number
}

export type BrowserSessionPoolConfig = {
  maxConcurrency: number
  maxConcurrencyPerOrg: number
  leaseWaitTimeoutMs: number
  maxLeaseMs: number
}

export type BrowserSessionPoolMetrics = {
  activeLeases: number
  queuedRequests: number
  maxConcurrency: number
  maxConcurrencyPerOrg: number
  totalLeaseRequests: number
  totalLeaseTimeouts: number
  totalLeaseReleases: number
  crashCount: number
  lastLeaseWaitMs: number
  maxLeaseWaitMs: number
  avgLeaseWaitMs: number
  activeByOrg: Record<string, number>
  pressure: 'normal' | 'high' | 'saturated'
  estimatedActiveCostUsdPerHour: number
}

type PendingLeaseRequest = {
  id: string
  orgId?: string
  requestedAt: number
  resolve: (lease: BrowserPoolLease) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

const DEFAULT_BROWSER_HOURLY_COST_USD = 0.03

export class BrowserSessionPool {
  private readonly active = new Map<string, BrowserPoolLease>()
  private readonly queue: PendingLeaseRequest[] = []
  private totalLeaseRequests = 0
  private totalLeaseTimeouts = 0
  private totalLeaseReleases = 0
  private totalLeaseWaitMs = 0
  private lastLeaseWaitMs = 0
  private maxLeaseWaitMs = 0
  private crashCount = 0

  constructor(private readonly config: BrowserSessionPoolConfig) {}

  async acquire(input: { orgId?: string } = {}): Promise<BrowserPoolLease> {
    this.totalLeaseRequests += 1
    const requestedAt = Date.now()
    if (this.canAcquire(input.orgId)) {
      return this.createLease(input.orgId, requestedAt)
    }

    return new Promise<BrowserPoolLease>((resolve, reject) => {
      const request: PendingLeaseRequest = {
        id: crypto.randomUUID(),
        orgId: input.orgId,
        requestedAt,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.removePending(request.id)
          this.totalLeaseTimeouts += 1
          reject(new Error(`Browser pool lease wait timeout after ${this.config.leaseWaitTimeoutMs}ms`))
        }, this.config.leaseWaitTimeoutMs),
      }
      this.queue.push(request)
    })
  }

  release(leaseId: string | undefined): void {
    if (!leaseId || !this.active.delete(leaseId)) return
    this.totalLeaseReleases += 1
    this.drainQueue()
  }

  sweepExpired(now = Date.now()): string[] {
    const expired: string[] = []
    for (const [leaseId, lease] of this.active.entries()) {
      if (now - lease.acquiredAt > this.config.maxLeaseMs) {
        this.active.delete(leaseId)
        expired.push(leaseId)
      }
    }
    if (expired.length > 0) this.drainQueue()
    return expired
  }

  recordBrowserCrash(): void {
    this.crashCount += 1
  }

  metrics(): BrowserSessionPoolMetrics {
    const activeByOrg = this.activeByOrg()
    const saturation = this.config.maxConcurrency <= 0
      ? 1
      : this.active.size / this.config.maxConcurrency
    return {
      activeLeases: this.active.size,
      queuedRequests: this.queue.length,
      maxConcurrency: this.config.maxConcurrency,
      maxConcurrencyPerOrg: this.config.maxConcurrencyPerOrg,
      totalLeaseRequests: this.totalLeaseRequests,
      totalLeaseTimeouts: this.totalLeaseTimeouts,
      totalLeaseReleases: this.totalLeaseReleases,
      crashCount: this.crashCount,
      lastLeaseWaitMs: this.lastLeaseWaitMs,
      maxLeaseWaitMs: this.maxLeaseWaitMs,
      avgLeaseWaitMs: this.totalLeaseRequests === 0
        ? 0
        : Math.round(this.totalLeaseWaitMs / this.totalLeaseRequests),
      activeByOrg,
      pressure: saturation >= 1 ? 'saturated' : saturation >= 0.8 ? 'high' : 'normal',
      estimatedActiveCostUsdPerHour: roundMoney(this.active.size * DEFAULT_BROWSER_HOURLY_COST_USD),
    }
  }

  private drainQueue(): void {
    for (let index = 0; index < this.queue.length;) {
      const request = this.queue[index]
      if (!request || !this.canAcquire(request.orgId)) {
        index += 1
        continue
      }
      this.queue.splice(index, 1)
      clearTimeout(request.timeout)
      request.resolve(this.createLease(request.orgId, request.requestedAt))
    }
  }

  private createLease(orgId: string | undefined, requestedAt: number): BrowserPoolLease {
    const now = Date.now()
    const lease: BrowserPoolLease = {
      id: crypto.randomUUID(),
      orgId,
      acquiredAt: now,
      waitMs: now - requestedAt,
    }
    this.active.set(lease.id, lease)
    this.lastLeaseWaitMs = lease.waitMs
    this.maxLeaseWaitMs = Math.max(this.maxLeaseWaitMs, lease.waitMs)
    this.totalLeaseWaitMs += lease.waitMs
    return lease
  }

  private canAcquire(orgId: string | undefined): boolean {
    if (this.active.size >= this.config.maxConcurrency) return false
    if (!orgId || this.config.maxConcurrencyPerOrg <= 0) return true
    return this.activeCountForOrg(orgId) < this.config.maxConcurrencyPerOrg
  }

  private activeCountForOrg(orgId: string): number {
    let count = 0
    for (const lease of this.active.values()) {
      if (lease.orgId === orgId) count += 1
    }
    return count
  }

  private activeByOrg(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const lease of this.active.values()) {
      const key = lease.orgId ?? 'unknown'
      result[key] = (result[key] ?? 0) + 1
    }
    return result
  }

  private removePending(requestId: string): void {
    const index = this.queue.findIndex((request) => request.id === requestId)
    if (index >= 0) this.queue.splice(index, 1)
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000
}
