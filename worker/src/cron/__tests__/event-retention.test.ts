/**
 * Tests for event retention cleanup cron.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase chain builder
function createMockChain(batches: Array<{ data: any[] | null; error: any }>) {
  let callIndex = 0
  const chain = {
    delete: vi.fn().mockReturnValue({
      lt: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockImplementation(() => {
            const result = batches[callIndex] ?? { data: [], error: null }
            callIndex++
            return Promise.resolve(result)
          }),
        }),
      }),
    }),
  }
  return chain
}

function createMockSupabase(tableChains: Record<string, ReturnType<typeof createMockChain>>) {
  return {
    from: vi.fn((table: string) => tableChains[table] ?? createMockChain([{ data: [], error: null }])),
  } as any
}

const { cleanupEventRetention } = await import('../event-retention.js')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cleanupEventRetention', () => {
  it('deletes events older than 30 days', async () => {
    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([
        { data: [{ id: '1' }, { id: '2' }], error: null },
        { data: [], error: null },
      ]),
      vps_health_snapshots: createMockChain([{ data: [], error: null }]),
    })

    await cleanupEventRetention(mockSupabase)

    expect(mockSupabase.from).toHaveBeenCalledWith('runtime_events')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('cleaned up 2 events, 0 snapshots')
    )
  })

  it('deletes snapshots older than 30 days', async () => {
    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([{ data: [], error: null }]),
      vps_health_snapshots: createMockChain([
        { data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null },
        { data: [], error: null },
      ]),
    })

    await cleanupEventRetention(mockSupabase)

    expect(mockSupabase.from).toHaveBeenCalledWith('vps_health_snapshots')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('cleaned up 0 events, 3 snapshots')
    )
  })

  it('handles empty tables gracefully', async () => {
    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([{ data: [], error: null }]),
      vps_health_snapshots: createMockChain([{ data: [], error: null }]),
    })

    await cleanupEventRetention(mockSupabase)

    // No log when nothing deleted
    expect(console.log).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('handles runtime_events errors without throwing', async () => {
    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([
        { data: null, error: { message: 'DB connection lost' } },
      ]),
      vps_health_snapshots: createMockChain([{ data: [], error: null }]),
    })

    // Should not throw
    await cleanupEventRetention(mockSupabase)

    expect(console.error).toHaveBeenCalledWith(
      '[cron:event-retention] runtime_events cleanup error:',
      'DB connection lost'
    )
  })

  it('handles vps_health_snapshots errors without throwing', async () => {
    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([{ data: [], error: null }]),
      vps_health_snapshots: createMockChain([
        { data: null, error: { message: 'Permission denied' } },
      ]),
    })

    await cleanupEventRetention(mockSupabase)

    expect(console.error).toHaveBeenCalledWith(
      '[cron:event-retention] vps_health_snapshots cleanup error:',
      'Permission denied'
    )
  })

  it('batch deletion loops until fewer than batch size returned', async () => {
    // Simulate 2 full batches (1000 each) + 1 partial batch (500)
    const fullBatch = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))
    const partialBatch = Array.from({ length: 500 }, (_, i) => ({ id: String(i + 2000) }))

    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([
        { data: fullBatch, error: null },
        { data: fullBatch, error: null },
        { data: partialBatch, error: null },
      ]),
      vps_health_snapshots: createMockChain([{ data: [], error: null }]),
    })

    await cleanupEventRetention(mockSupabase)

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('cleaned up 2500 events, 0 snapshots')
    )
  })

  it('stops batch loop on error', async () => {
    const fullBatch = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))

    const mockSupabase = createMockSupabase({
      runtime_events: createMockChain([
        { data: fullBatch, error: null },
        { data: null, error: { message: 'Timeout' } },
      ]),
      vps_health_snapshots: createMockChain([{ data: [], error: null }]),
    })

    await cleanupEventRetention(mockSupabase)

    expect(console.error).toHaveBeenCalledWith(
      '[cron:event-retention] runtime_events cleanup error:',
      'Timeout'
    )
    // Should still log partial progress
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('cleaned up 1000 events, 0 snapshots')
    )
  })

  it('handles unexpected exceptions gracefully', async () => {
    const mockSupabase = {
      from: vi.fn(() => { throw new Error('Unexpected crash') }),
    } as any

    // Should not throw
    await cleanupEventRetention(mockSupabase)

    expect(console.error).toHaveBeenCalledWith(
      '[cron:event-retention] Error:',
      expect.any(Error)
    )
  })
})
