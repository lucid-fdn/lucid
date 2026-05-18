// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setVisibleInterval } from '@/lib/utils/visible-interval'

/**
 * Integration test: Visibility API pause/resume for ambient-presence.
 *
 * Tests setVisibleInterval — the shared utility used by TaskCountdownLine
 * in ambient-presence.tsx. Verifies:
 * - Interval fires when tab visible
 * - Interval pauses when tab hidden
 * - Callback fires immediately on visibility restore
 * - Cleanup removes listener and clears interval
 *
 * Also tests formatCountdown and formatRelative pure functions
 * (re-implemented since they're not exported from the component).
 */

// Mock document.visibilityState
let mockVisibilityState = 'visible'
let visibilityListeners: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
  mockVisibilityState = 'visible'
  visibilityListeners = []

  Object.defineProperty(document, 'visibilityState', {
    get: () => mockVisibilityState,
    configurable: true,
  })

  vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'visibilitychange') {
      visibilityListeners.push(handler as () => void)
    }
  })

  vi.spyOn(document, 'removeEventListener').mockImplementation((event, handler) => {
    if (event === 'visibilitychange') {
      visibilityListeners = visibilityListeners.filter((h) => h !== handler)
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fireVisibilityChange(state: 'visible' | 'hidden') {
  mockVisibilityState = state
  visibilityListeners.forEach((fn) => fn())
}

describe('setVisibleInterval', () => {
  it('fires callback on interval when visible', () => {
    const cb = vi.fn()
    setVisibleInterval(cb, 1000)

    vi.advanceTimersByTime(3000)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('does not fire when tab is hidden', () => {
    const cb = vi.fn()
    setVisibleInterval(cb, 1000)

    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    fireVisibilityChange('hidden')
    vi.advanceTimersByTime(5000)
    // Should not have fired more
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires immediately on visibility restore', () => {
    const cb = vi.fn()
    setVisibleInterval(cb, 1000)

    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    fireVisibilityChange('hidden')
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)

    // Restore visibility — should fire immediately
    fireVisibilityChange('visible')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('resumes normal interval after visibility restore', () => {
    const cb = vi.fn()
    setVisibleInterval(cb, 1000)

    fireVisibilityChange('hidden')
    vi.advanceTimersByTime(5000)

    fireVisibilityChange('visible')
    const countAfterRestore = cb.mock.calls.length

    vi.advanceTimersByTime(3000)
    expect(cb).toHaveBeenCalledTimes(countAfterRestore + 3)
  })

  it('cleanup removes listener and stops interval', () => {
    const cb = vi.fn()
    const cleanup = setVisibleInterval(cb, 1000)

    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledTimes(2)

    cleanup()

    vi.advanceTimersByTime(5000)
    // Should not fire more after cleanup
    expect(cb).toHaveBeenCalledTimes(2)

    // Listener removed
    expect(visibilityListeners).toHaveLength(0)
  })

  it('does not start interval when initially hidden', () => {
    mockVisibilityState = 'hidden'
    const cb = vi.fn()
    setVisibleInterval(cb, 1000)

    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(0)

    // Becomes visible
    fireVisibilityChange('visible')
    expect(cb).toHaveBeenCalledTimes(1) // Immediate callback
  })
})

// Pure function tests for ambient-presence helpers
// (Re-implemented since not exported — these test the logic, not the import)

function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes < 60) return `${minutes}m ${secs}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

describe('formatCountdown', () => {
  it('returns "now" for past timestamps', () => {
    vi.setSystemTime(new Date('2026-04-01T00:10:00Z'))
    expect(formatCountdown('2026-04-01T00:05:00Z')).toBe('now')
  })

  it('formats seconds', () => {
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))
    expect(formatCountdown('2026-04-01T00:00:45Z')).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))
    expect(formatCountdown('2026-04-01T00:05:30Z')).toBe('5m 30s')
  })

  it('formats hours and minutes', () => {
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))
    expect(formatCountdown('2026-04-01T02:15:00Z')).toBe('2h 15m')
  })
})

describe('formatRelative', () => {
  it('returns "just now" for recent timestamps', () => {
    vi.setSystemTime(new Date('2026-04-01T00:00:30Z'))
    expect(formatRelative('2026-04-01T00:00:00Z')).toBe('just now')
  })

  it('formats minutes ago', () => {
    vi.setSystemTime(new Date('2026-04-01T00:05:00Z'))
    expect(formatRelative('2026-04-01T00:00:00Z')).toBe('5m ago')
  })

  it('formats hours ago', () => {
    vi.setSystemTime(new Date('2026-04-01T03:00:00Z'))
    expect(formatRelative('2026-04-01T00:00:00Z')).toBe('3h ago')
  })
})
