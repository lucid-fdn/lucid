/**
 * Human Task Dispatch — Unit Tests
 *
 * Phase 2 of Pulse + Nerve Human + PM Integration. Verifies:
 *   - Happy path: inserts human_work_items row + appends created event
 *   - Payload parsing: title fallback, priority validation, sla_seconds → due_at
 *   - Idempotency: 23505 unique violation returns existing id (no duplicate)
 *   - Non-conflict errors return null so the scheduler can retry
 *   - Activity-feed insert failure does NOT poison the dispatch result
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchHumanTaskNode } from '../human-task-dispatch.js'

type InsertedRow = Record<string, unknown>

interface MockBehavior {
  insertData?: { id: string } | null
  insertError?: { code?: string; message: string } | null
  existingData?: { id: string } | null
  eventInsertError?: { message: string } | null
}

function createMockSupabase(
  workItemsBehavior: MockBehavior,
  eventsBehavior: { error?: { message: string } | null } = {},
) {
  const inserted: { table: string; row: InsertedRow }[] = []

  const workItemsSingle = vi.fn().mockResolvedValue({
    data: workItemsBehavior.insertData ?? null,
    error: workItemsBehavior.insertError ?? null,
  })
  const workItemsMaybeSingle = vi.fn().mockResolvedValue({
    data: workItemsBehavior.existingData ?? null,
    error: null,
  })
  const eventsInsertResult = vi
    .fn()
    .mockResolvedValue({ data: null, error: eventsBehavior.error ?? null })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'human_work_items') {
      return {
        insert: vi.fn().mockImplementation((row: InsertedRow) => {
          inserted.push({ table, row })
          return {
            select: vi.fn().mockReturnValue({ single: workItemsSingle }),
          }
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: workItemsMaybeSingle }),
          }),
        }),
      }
    }
    if (table === 'human_work_item_events') {
      return {
        insert: vi.fn().mockImplementation((row: InsertedRow) => {
          inserted.push({ table, row })
          return eventsInsertResult()
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { supabase: { from } as any, inserted }
}

const DAG = {
  id: '11111111-1111-1111-1111-111111111111',
  org_id: '22222222-2222-2222-2222-222222222222',
  agent_id: '33333333-3333-3333-3333-333333333333',
}

const NODE = {
  id: '44444444-4444-4444-4444-444444444444',
  node_key: 'review_step',
  node_type: 'human_task' as const,
  payload: {
    title: 'Please review the draft',
    description: 'Markdown body',
    priority: 'high' as const,
    labels: ['review', 'draft'],
    assignee_user_id: '55555555-5555-5555-5555-555555555555',
    sla_seconds: 3600,
  },
}

describe('dispatchHumanTaskNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a work item and appends a created event on happy path', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-1' },
    })

    const result = await dispatchHumanTaskNode(supabase, DAG, NODE)
    expect(result).toEqual({ workItemId: 'wi-1', needsPmSync: false })

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem).toBeDefined()
    expect(workItem!.row).toMatchObject({
      org_id: DAG.org_id,
      kind: 'nerve_node',
      dag_id: DAG.id,
      dag_node_id: NODE.id,
      agent_id: DAG.agent_id,
      title: 'Please review the draft',
      description: 'Markdown body',
      priority: 'high',
      labels: ['review', 'draft'],
      assignee_user_id: '55555555-5555-5555-5555-555555555555',
      status: 'open',
      sla_seconds: 3600,
    })
    // due_at derived from sla_seconds
    expect(typeof workItem!.row.due_at).toBe('string')

    const event = inserted.find((r) => r.table === 'human_work_item_events')
    expect(event).toBeDefined()
    expect(event!.row).toMatchObject({
      work_item_id: 'wi-1',
      org_id: DAG.org_id,
      actor_kind: 'agent',
      actor_agent_id: DAG.agent_id,
      event_type: 'created',
    })
  })

  it('falls back to `Human task: <node_key>` when title is missing', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-2' },
    })

    const node = { ...NODE, payload: {} }
    await dispatchHumanTaskNode(supabase, DAG, node)

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem!.row.title).toBe(`Human task: ${NODE.node_key}`)
    expect(workItem!.row.priority).toBe('normal')
    expect(workItem!.row.labels).toEqual([])
  })

  it('returns existing id on 23505 unique violation (idempotency)', async () => {
    const { supabase } = createMockSupabase({
      insertError: { code: '23505', message: 'duplicate key' },
      existingData: { id: 'existing-wi' },
    })

    const result = await dispatchHumanTaskNode(supabase, DAG, NODE)
    expect(result).toEqual({ workItemId: 'existing-wi', needsPmSync: false })
  })

  it('returns null on non-conflict insert errors so scheduler can retry', async () => {
    const { supabase } = createMockSupabase({
      insertError: { code: '42P01', message: 'relation does not exist' },
    })

    const result = await dispatchHumanTaskNode(supabase, DAG, NODE)
    expect(result).toBeNull()
  })

  it('returns work item id even if activity-feed insert fails (best-effort)', async () => {
    const { supabase } = createMockSupabase(
      { insertData: { id: 'wi-3' } },
      { error: { message: 'events table down' } },
    )

    const result = await dispatchHumanTaskNode(supabase, DAG, NODE)
    expect(result).toEqual({ workItemId: 'wi-3', needsPmSync: false })
  })

  it('ignores invalid priority values and falls back to normal', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-4' },
    })

    const node = { ...NODE, payload: { title: 't', priority: 'bogus' } }
    await dispatchHumanTaskNode(supabase, DAG, node)

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem!.row.priority).toBe('normal')
  })

  it('sets needsPmSync=true when external_mirror is true', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-mirror-1' },
    })

    const node = { ...NODE, payload: { ...NODE.payload, external_mirror: true } }
    const result = await dispatchHumanTaskNode(supabase, DAG, node)
    expect(result).toEqual({ workItemId: 'wi-mirror-1', needsPmSync: true })

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem!.row.external_mirror).toEqual({ primary: true })
  })

  it('sets needsPmSync=true when external_mirror is an object', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-mirror-2' },
    })

    const mirror = { provider: 'linear', project_id: 'abc' }
    const node = { ...NODE, payload: { ...NODE.payload, external_mirror: mirror } }
    const result = await dispatchHumanTaskNode(supabase, DAG, node)
    expect(result).toEqual({ workItemId: 'wi-mirror-2', needsPmSync: true })

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem!.row.external_mirror).toEqual(mirror)
  })

  it('sets needsPmSync=false when external_mirror is absent', async () => {
    const { supabase } = createMockSupabase({
      insertData: { id: 'wi-no-mirror' },
    })

    const result = await dispatchHumanTaskNode(supabase, DAG, NODE)
    expect(result).toEqual({ workItemId: 'wi-no-mirror', needsPmSync: false })
  })

  it('passes through explicit due_at and skips sla_seconds derivation', async () => {
    const { supabase, inserted } = createMockSupabase({
      insertData: { id: 'wi-5' },
    })

    const explicit = '2030-01-01T00:00:00.000Z'
    const node = {
      ...NODE,
      payload: { title: 't', due_at: explicit, sla_seconds: 60 },
    }
    await dispatchHumanTaskNode(supabase, DAG, node)

    const workItem = inserted.find((r) => r.table === 'human_work_items')
    expect(workItem!.row.due_at).toBe(explicit)
  })
})
