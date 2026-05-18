/**
 * Crew run lifecycle reconciliation tests.
 *
 * Complements the route-level unit test by covering the full
 * `starting → running → completed/failed` transitions through the
 * 10-minute stale-run safety net in `runtime-reconciler`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileStaleCrewRuns, type ReconcilerSweepResult } from '../runtime-reconciler.js'

type StaleRun = {
  id: string
  crew_id: string
  org_id: string
  status: 'starting' | 'running' | 'completed' | 'failed'
}

const FRESH_CONFIG = {
  runtimeStaleThresholdMs: 5 * 60 * 1000,
  runtimeOfflineThresholdMs: 60 * 60 * 1000,
  deadLetterPauseThreshold: 10,
  stuckEventResetLimit: 50,
  autoResumeOnReconnect: true,
}

function freshResult(): ReconcilerSweepResult {
  return {
    runtimesMarkedStale: 0,
    runtimesMarkedOffline: 0,
    runtimesTornDown: 0,
    agentsPaused: 0,
    agentsResumed: 0,
    stuckEventsReset: 0,
    intentsCleaned: 0,
    crewRunsTimedOut: 0,
    errors: [],
  }
}

/**
 * Build a chainable Supabase-like mock where each `.from(table)` call
 * dispatches to a test-controlled handler.
 */
function buildSupabaseMock(handlers: {
  staleRuns: StaleRun[]
  recentMemberByRunId?: Record<string, { id: string } | null>
  onCrewRunUpdate?: (runId: string) => { error: unknown | null }
  onFeedInsert?: (payload: Record<string, unknown>) => void
}) {
  const updatedRuns: string[] = []
  const feedInserts: Record<string, unknown>[] = []

  const from = vi.fn((table: string) => {
    if (table === 'crew_runs') {
      return {
        // Initial query for stale runs
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            lt: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: handlers.staleRuns, error: null }),
            })),
          })),
        })),
        // Update chain — mark run failed with race guard
        update: vi.fn(() => ({
          eq: vi.fn((_: string, runId: string) => ({
            in: vi.fn(() => {
              updatedRuns.push(runId)
              const result = handlers.onCrewRunUpdate?.(runId) ?? { error: null }
              return Promise.resolve(result)
            }),
          })),
        })),
      }
    }

    if (table === 'crew_run_members') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_: string, runId: string) => ({
            in: vi.fn(() => ({
              gt: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: handlers.recentMemberByRunId?.[runId] ?? null,
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        })),
      }
    }

    if (table === 'mc_agent_events') {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          feedInserts.push(payload)
          handlers.onFeedInsert?.(payload)
          // Fire-and-forget — reconciler does `.then(() => {})`
          return { then: (fn: () => void) => Promise.resolve().then(fn) }
        }),
      }
    }

    throw new Error(`Unexpected table access: ${table}`)
  })

  return {
    supabase: { from } as never,
    updatedRuns,
    feedInserts,
  }
}

describe('reconcileStaleCrewRuns — full crew run lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails a run stuck in `starting` past the 10-minute threshold', async () => {
    const { supabase, updatedRuns, feedInserts } = buildSupabaseMock({
      staleRuns: [
        { id: 'run-stuck-start', crew_id: 'crew-1', org_id: 'org-1', status: 'starting' },
      ],
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    expect(updatedRuns).toEqual(['run-stuck-start'])
    expect(result.crewRunsTimedOut).toBe(1)
    expect(feedInserts).toHaveLength(1)
    expect(feedInserts[0]).toMatchObject({
      org_id: 'org-1',
      event_type: 'crew_run_failed',
      payload: expect.objectContaining({
        crew_id: 'crew-1',
        crew_run_id: 'run-stuck-start',
        reason: 'timeout',
      }),
    })
  })

  it('fails a `running` run when no member is active (reconciler safety net)', async () => {
    const { supabase, updatedRuns } = buildSupabaseMock({
      staleRuns: [
        { id: 'run-zombie', crew_id: 'crew-2', org_id: 'org-2', status: 'running' },
      ],
      recentMemberByRunId: { 'run-zombie': null },
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    expect(updatedRuns).toEqual(['run-zombie'])
    expect(result.crewRunsTimedOut).toBe(1)
  })

  it('leaves a `running` run alone if a member has recent activity', async () => {
    const { supabase, updatedRuns, feedInserts } = buildSupabaseMock({
      staleRuns: [
        { id: 'run-active', crew_id: 'crew-3', org_id: 'org-3', status: 'running' },
      ],
      recentMemberByRunId: { 'run-active': { id: 'member-42' } },
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    expect(updatedRuns).toEqual([])
    expect(result.crewRunsTimedOut).toBe(0)
    expect(feedInserts).toEqual([])
  })

  it('processes a mixed batch — times out stuck runs while leaving active ones alone', async () => {
    const { supabase, updatedRuns, feedInserts } = buildSupabaseMock({
      staleRuns: [
        { id: 'run-A', crew_id: 'crew-A', org_id: 'org-1', status: 'starting' },
        { id: 'run-B', crew_id: 'crew-B', org_id: 'org-1', status: 'running' },
        { id: 'run-C', crew_id: 'crew-C', org_id: 'org-1', status: 'running' },
      ],
      recentMemberByRunId: {
        'run-B': { id: 'still-alive' },
        'run-C': null,
      },
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    // run-A (starting) and run-C (running+dead) get timed out.
    // run-B (running+active) is untouched.
    expect(updatedRuns.sort()).toEqual(['run-A', 'run-C'])
    expect(result.crewRunsTimedOut).toBe(2)
    expect(feedInserts).toHaveLength(2)
  })

  it('does nothing when there are no stale runs', async () => {
    const { supabase, updatedRuns, feedInserts } = buildSupabaseMock({
      staleRuns: [],
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    expect(updatedRuns).toEqual([])
    expect(result.crewRunsTimedOut).toBe(0)
    expect(feedInserts).toEqual([])
  })

  it('does not increment counter when the race-guarded update fails', async () => {
    // Simulates another writer (e.g. coordinator calling crew_complete) winning
    // the race: our WHERE status IN ('starting','running') no longer matches.
    const { supabase, updatedRuns } = buildSupabaseMock({
      staleRuns: [
        { id: 'run-raced', crew_id: 'crew-4', org_id: 'org-4', status: 'starting' },
      ],
      onCrewRunUpdate: () => ({ error: { message: 'update lost race' } }),
    })
    const result = freshResult()

    await reconcileStaleCrewRuns(supabase, FRESH_CONFIG, result)

    expect(updatedRuns).toEqual(['run-raced']) // update was attempted
    expect(result.crewRunsTimedOut).toBe(0) // but not counted
  })
})
