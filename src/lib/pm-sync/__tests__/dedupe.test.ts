/**
 * PM Sync Dedupe — Unit tests for markEventSeen / hasSeenEvent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockSet = vi.fn()
const mockGet = vi.fn()
let mockRedis: { set: typeof mockSet; get: typeof mockGet } | null = {
  set: mockSet,
  get: mockGet,
}

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: () => mockRedis,
}))

vi.mock('@/lib/db/client', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const { markEventSeen, hasSeenEvent } = await import('../dedupe')

beforeEach(() => {
  vi.clearAllMocks()
  mockRedis = { set: mockSet, get: mockGet }
})

describe('markEventSeen', () => {
  it('returns true on first sighting (SET NX returns OK)', async () => {
    mockSet.mockResolvedValue('OK')
    const result = await markEventSeen('linear', 'evt-1')
    expect(result).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(
      'pm_sync:dedupe:linear:evt-1',
      expect.any(String),
      { nx: true, ex: 24 * 60 * 60 },
    )
  })

  it('returns false on duplicate (SET NX returns null)', async () => {
    mockSet.mockResolvedValue(null)
    const result = await markEventSeen('asana', 'evt-2')
    expect(result).toBe(false)
  })

  it('fails open when rawEventId is empty', async () => {
    const result = await markEventSeen('linear', '')
    expect(result).toBe(true)
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('fails open when redis is not configured', async () => {
    mockRedis = null
    const result = await markEventSeen('trello', 'evt-3')
    expect(result).toBe(true)
  })

  it('fails open (returns true) when redis throws', async () => {
    mockSet.mockRejectedValue(new Error('upstash down'))
    const result = await markEventSeen('monday', 'evt-4')
    expect(result).toBe(true)
  })
})

describe('hasSeenEvent', () => {
  it('returns true when key exists', async () => {
    mockGet.mockResolvedValue('2026-04-08T00:00:00Z')
    expect(await hasSeenEvent('linear', 'evt-1')).toBe(true)
  })

  it('returns false when key is missing', async () => {
    mockGet.mockResolvedValue(null)
    expect(await hasSeenEvent('linear', 'evt-1')).toBe(false)
  })

  it('returns false when redis is not configured', async () => {
    mockRedis = null
    expect(await hasSeenEvent('linear', 'evt-1')).toBe(false)
  })

  it('returns false when rawEventId is empty', async () => {
    expect(await hasSeenEvent('linear', '')).toBe(false)
  })

  it('returns false when redis throws', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    expect(await hasSeenEvent('linear', 'evt-1')).toBe(false)
  })
})
