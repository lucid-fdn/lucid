import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  RUNTIME_AUTO_REDEPLOY_RETRY_COOLDOWN_MS,
  RUNTIME_OFFLINE_AFTER_MS,
  RUNTIME_STALE_AFTER_MS,
  deriveRuntimePresenceStatus,
  getRuntimePresenceThresholds,
  isWithinRuntimeRetryCooldown,
} from './policy'

describe('runtime policy', () => {
  it('derives connected, stale, and offline presence states from lastSeenAt', () => {
    const now = Date.UTC(2026, 3, 21, 12, 0, 0)

    expect(
      deriveRuntimePresenceStatus(new Date(now - 60_000).toISOString(), now),
    ).toBe('connected')
    expect(
      deriveRuntimePresenceStatus(new Date(now - RUNTIME_STALE_AFTER_MS - 1_000).toISOString(), now),
    ).toBe('stale')
    expect(
      deriveRuntimePresenceStatus(new Date(now - RUNTIME_OFFLINE_AFTER_MS - 1_000).toISOString(), now),
    ).toBe('offline')
  })

  it('treats missing or invalid presence timestamps as offline', () => {
    const now = Date.UTC(2026, 3, 21, 12, 0, 0)

    expect(deriveRuntimePresenceStatus(null, now)).toBe('offline')
    expect(deriveRuntimePresenceStatus('not-a-date', now)).toBe('offline')
  })

  it('computes stale/offline thresholds from a shared clock', () => {
    const now = Date.UTC(2026, 3, 21, 12, 0, 0)
    const thresholds = getRuntimePresenceThresholds(now)

    expect(thresholds.staleBefore.toISOString()).toBe(new Date(now - RUNTIME_STALE_AFTER_MS).toISOString())
    expect(thresholds.offlineBefore.toISOString()).toBe(new Date(now - RUNTIME_OFFLINE_AFTER_MS).toISOString())
  })

  it('applies the shared auto-redeploy cooldown window', () => {
    const now = Date.UTC(2026, 3, 21, 12, 0, 0)

    expect(
      isWithinRuntimeRetryCooldown(new Date(now - 60_000).toISOString(), now),
    ).toBe(true)
    expect(
      isWithinRuntimeRetryCooldown(
        new Date(now - RUNTIME_AUTO_REDEPLOY_RETRY_COOLDOWN_MS - 1_000).toISOString(),
        now,
      ),
    ).toBe(false)
  })
})
