import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getConnectionStatus } from '../types'
import type { ConnectionStatus, RuntimeProvider, RuntimeStatus } from '../types'
import { formatRelativeTime } from '../constants'
import { metricColor } from '@/components/mission-control/metric-bar'

describe('getConnectionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns offline for null lastSeenAt', () => {
    expect(getConnectionStatus(null)).toBe('offline')
  })

  it('returns connected when last seen < 60s ago', () => {
    // 30 seconds ago
    const ts = new Date(Date.now() - 30_000).toISOString()
    expect(getConnectionStatus(ts)).toBe('connected')
  })

  it('returns connected at exactly now', () => {
    expect(getConnectionStatus(new Date().toISOString())).toBe('connected')
  })

  it('returns stale when last seen 1-5 min ago', () => {
    // 2 minutes ago
    const ts = new Date(Date.now() - 120_000).toISOString()
    expect(getConnectionStatus(ts)).toBe('stale')
  })

  it('returns stale at exactly 60s boundary', () => {
    const ts = new Date(Date.now() - 60_000).toISOString()
    expect(getConnectionStatus(ts)).toBe('stale')
  })

  it('returns offline when last seen > 5 min ago', () => {
    // 10 minutes ago
    const ts = new Date(Date.now() - 600_000).toISOString()
    expect(getConnectionStatus(ts)).toBe('offline')
  })

  it('returns offline at exactly 5 min boundary', () => {
    const ts = new Date(Date.now() - 300_000).toISOString()
    expect(getConnectionStatus(ts)).toBe('offline')
  })

  it('returns offline for very old timestamps', () => {
    expect(getConnectionStatus('2020-01-01T00:00:00Z')).toBe('offline')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats seconds ago', () => {
    const ts = new Date(Date.now() - 30_000).toISOString()
    expect(formatRelativeTime(ts)).toBe('30s ago')
  })

  it('formats minutes ago', () => {
    const ts = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatRelativeTime(ts)).toBe('5m ago')
  })

  it('formats hours ago', () => {
    const ts = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(formatRelativeTime(ts)).toBe('3h ago')
  })

  it('formats days ago', () => {
    const ts = new Date(Date.now() - 2 * 86400_000).toISOString()
    expect(formatRelativeTime(ts)).toBe('2d ago')
  })

  it('returns 0s ago for current time', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('0s ago')
  })
})

describe('metricColor', () => {
  it('returns red class for values > 80', () => {
    expect(metricColor(81)).toBe('text-red-500')
    expect(metricColor(100)).toBe('text-red-500')
    expect(metricColor(95)).toBe('text-red-500')
  })

  it('returns amber class for values > 60 and <= 80', () => {
    expect(metricColor(61)).toBe('text-amber-500')
    expect(metricColor(75)).toBe('text-amber-500')
    expect(metricColor(80)).toBe('text-amber-500')
  })

  it('returns muted class for values <= 60', () => {
    expect(metricColor(0)).toBe('text-muted-foreground')
    expect(metricColor(30)).toBe('text-muted-foreground')
    expect(metricColor(60)).toBe('text-muted-foreground')
  })
})

describe('type safety', () => {
  it('ConnectionStatus type only allows valid values', () => {
    const validStatuses: ConnectionStatus[] = ['connected', 'stale', 'offline']
    expect(validStatuses).toHaveLength(3)
  })

  it('RuntimeProvider type includes all 7 providers', () => {
    const providers: RuntimeProvider[] = [
      'railway', 'akash', 'phala', 'io.net', 'nosana', 'docker', 'manual',
    ]
    expect(providers).toHaveLength(7)
  })

  it('RuntimeStatus type includes all 7 statuses', () => {
    const statuses: RuntimeStatus[] = [
      'pending', 'deploying', 'connected', 'stale', 'offline', 'failed', 'revoked',
    ]
    expect(statuses).toHaveLength(7)
  })
})
