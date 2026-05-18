/**
 * DagStepCreator — Unit Tests
 *
 * Phase 4N-0, Task 13. Verifies:
 *   - Novel key → { isNew: true }
 *   - Duplicate key → { isNew: false } with existing row returned via select fallback
 *   - Bumped attempt → new row with { isNew: true }
 *   - Zod rejects invalid stepType
 *   - Worker-mode (`initialStatus='running'`) anchors started_at
 *   - REST-mode (`initialStatus='pending'`) omits started_at
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DagStepCreator, buildStepRow, dagStepCreateInputSchema } from '../dag-step-creator.js'

type InsertedRow = Record<string, unknown>

function createMockSupabase(behavior: {
  // First call: the insert path
  insertData?: { id: string } | null
  insertError?: { code?: string; message: string } | null
  // Second call: the findExisting fallback path (maybeSingle)
  existingData?: { id: string } | null
  existingError?: { message: string } | null
}) {
  const insertedRows: InsertedRow[] = []

  const single = vi.fn().mockResolvedValue({
    data: behavior.insertData ?? null,
    error: behavior.insertError ?? null,
  })
  const maybeSingle = vi.fn().mockResolvedValue({
    data: behavior.existingData ?? null,
    error: behavior.existingError ?? null,
  })

  const from = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockImplementation((row: InsertedRow) => {
      insertedRows.push(row)
      return {
        select: vi.fn().mockReturnValue({ single }),
      }
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    }),
  }))

  return {
    supabase: { from } as any,
    insertedRows,
  }
}

const VALID_INPUT = {
  eventId: '11111111-1111-1111-1111-111111111111',
  attempt: 0,
  stepType: 'webhook' as const,
  executorType: 'webhook',
  agentId: '22222222-2222-2222-2222-222222222222',
  orgId: '33333333-3333-3333-3333-333333333333',
  runId: 'evt-run-1',
  initialStatus: 'pending' as const,
}

describe('DagStepCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns isNew=true on successful insert of novel key', async () => {
    const { supabase } = createMockSupabase({ insertData: { id: 'step-abc' } })
    const creator = new DagStepCreator(supabase)
    const result = await creator.create(VALID_INPUT)

    expect(result).toEqual({ stepId: 'step-abc', isNew: true })
  })

  it('returns isNew=false with existing stepId on duplicate key', async () => {
    const { supabase } = createMockSupabase({
      insertError: { code: '23505', message: 'duplicate key value' },
      existingData: { id: 'existing-step-id' },
    })
    const creator = new DagStepCreator(supabase)
    const result = await creator.create(VALID_INPUT)

    expect(result).toEqual({ stepId: 'existing-step-id', isNew: false })
  })

  it('treats bumped attempt as a novel key', async () => {
    const { supabase, insertedRows } = createMockSupabase({ insertData: { id: 'step-attempt-1' } })
    const creator = new DagStepCreator(supabase)
    const result = await creator.create({ ...VALID_INPUT, attempt: 1 })

    expect(result).toEqual({ stepId: 'step-attempt-1', isNew: true })
    expect(insertedRows[0].attempt).toBe(1)
  })

  it('throws on non-conflict insert errors', async () => {
    const { supabase } = createMockSupabase({
      insertError: { code: '42P01', message: 'relation does not exist' },
    })
    const creator = new DagStepCreator(supabase)
    await expect(creator.create(VALID_INPUT)).rejects.toMatchObject({
      code: '42P01',
    })
  })

  it('Zod rejects unknown stepType', () => {
    expect(() =>
      dagStepCreateInputSchema.parse({
        ...VALID_INPUT,
        stepType: 'bogus',
      }),
    ).toThrow()
  })

  it('Zod rejects non-uuid eventId', () => {
    expect(() =>
      dagStepCreateInputSchema.parse({
        ...VALID_INPUT,
        eventId: 'not-a-uuid',
      }),
    ).toThrow()
  })

  describe('buildStepRow', () => {
    it('omits started_at when initialStatus is pending (REST path)', () => {
      const parsed = dagStepCreateInputSchema.parse({ ...VALID_INPUT, initialStatus: 'pending' })
      const row = buildStepRow(parsed)

      expect(row.status).toBe('pending')
      expect(row.started_at).toBeUndefined()
    })

    it('anchors started_at when initialStatus is running (worker path)', () => {
      const parsed = dagStepCreateInputSchema.parse({ ...VALID_INPUT, initialStatus: 'running' })
      const row = buildStepRow(parsed)

      expect(row.status).toBe('running')
      expect(row.started_at).toBeTypeOf('string')
      // ISO-8601 format sanity check
      expect(new Date(row.started_at as string).toString()).not.toBe('Invalid Date')
    })

    it('sets callback_status when webhookUrl is provided', () => {
      const parsed = dagStepCreateInputSchema.parse({
        ...VALID_INPUT,
        webhookUrl: 'https://example.com/cb',
      })
      const row = buildStepRow(parsed)

      expect(row.webhook_url).toBe('https://example.com/cb')
      expect(row.callback_status).toBe('pending')
    })

    it('leaves callback_status null when webhookUrl is absent', () => {
      const parsed = dagStepCreateInputSchema.parse(VALID_INPUT)
      const row = buildStepRow(parsed)

      expect(row.webhook_url).toBeNull()
      expect(row.callback_status).toBeNull()
    })

    it('nulls DAG linkage columns when input omits them (REST / non-DAG path)', () => {
      // Non-DAG callers (Phase 3N step pipeline, REST runtime enqueue)
      // must land NULLs in the four DAG columns so the legacy
      // `idx_orch_steps_idempotent` partial index (WHERE dag_id IS NULL)
      // covers them.
      const parsed = dagStepCreateInputSchema.parse(VALID_INPUT)
      const row = buildStepRow(parsed)

      expect(row.dag_id).toBeNull()
      expect(row.dag_node_id).toBeNull()
      expect(row.runtime_target).toBeNull()
      expect(row.route_class).toBeNull()
    })

    it('persists DAG linkage columns when scheduler passes them (DAG path)', () => {
      // Scheduler-driven leaves MUST land `dag_id`, `dag_node_id`,
      // `runtime_target`, and `route_class` so the DAG-scoped
      // idempotency index (`idx_orch_steps_dag_attempt`) can enforce
      // uniqueness across (dag_id, dag_node_id, attempt). Before this
      // wiring, `buildStepRow` dropped all four columns and every DAG
      // row collided on the legacy (event_id, attempt, step_type) key.
      const parsed = dagStepCreateInputSchema.parse({
        ...VALID_INPUT,
        dagId: '44444444-4444-4444-8444-444444444444',
        dagNodeId: '55555555-5555-4555-8555-555555555555',
        runtimeTarget: 'dedicated' as const,
        routeClass: 'strong' as const,
      })
      const row = buildStepRow(parsed)

      expect(row.dag_id).toBe('44444444-4444-4444-8444-444444444444')
      expect(row.dag_node_id).toBe('55555555-5555-4555-8555-555555555555')
      expect(row.runtime_target).toBe('dedicated')
      expect(row.route_class).toBe('strong')
    })
  })
})
