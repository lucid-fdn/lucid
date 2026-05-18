import { describe, it, expect, vi, afterEach } from 'vitest'
import { DEFAULT_POLICIES, isPolicyCoolingDown } from '../remediation-engine'
import type { RemediationPolicy } from '../remediation-engine'

describe('DEFAULT_POLICIES', () => {
  it('has 4 default policies', () => {
    expect(DEFAULT_POLICIES).toHaveLength(4)
  })

  it('contains expected policy names', () => {
    const names = DEFAULT_POLICIES.map((p) => p.name)
    expect(names).toContain('Auto-pause on high error rate')
    expect(names).toContain('Retry dead letters')
    expect(names).toContain('Cost guard — route to fast model')
    expect(names).toContain('Memory cleanup')
  })
})

describe('isPolicyCoolingDown', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const basePolicy: RemediationPolicy = {
    id: 'pol-1',
    org_id: 'org-1',
    name: 'Test Policy',
    enabled: true,
    trigger_type: 'threshold',
    condition: {},
    action_type: 'notify',
    action_config: {},
    cooldown_seconds: 600,
    last_triggered_at: null,
  }

  it('returns false when last_triggered_at is null', () => {
    expect(isPolicyCoolingDown(basePolicy)).toBe(false)
  })

  it('returns true when within cooldown period', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    const policy: RemediationPolicy = {
      ...basePolicy,
      cooldown_seconds: 600, // 10 minutes
      last_triggered_at: '2026-01-01T00:02:00Z', // 3 minutes ago
    }
    expect(isPolicyCoolingDown(policy)).toBe(true)
  })

  it('returns false when cooldown has elapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'))
    const policy: RemediationPolicy = {
      ...basePolicy,
      cooldown_seconds: 600, // 10 minutes
      last_triggered_at: '2026-01-01T00:00:00Z', // 60 minutes ago
    }
    expect(isPolicyCoolingDown(policy)).toBe(false)
  })
})
