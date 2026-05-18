/**
 * HumanTaskEnqueuer smoke tests — Phase 1.
 *
 * Verifies:
 *   - feature-flag gating (off → null, no insert)
 *   - happy path creates work item + created event
 *   - duplicate pulse_job_run_id is treated as already enqueued
 *   - generic error returns null without throwing
 *   - SLA seconds derives due_at when not explicitly set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enqueueHumanWorkItem } from '../enqueuer.js'

type InsertResult = { data: unknown; error: { code?: string; message: string } | null }

function buildSupabase(
  workItemResult: InsertResult,
  eventResult: InsertResult = { data: {}, error: null },
  existingLookupResult?: InsertResult,
) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = []

  const supabase = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload })
          if (table === 'human_work_items') {
            return {
              select() {
                return {
                  single: () =>
                    Promise.resolve(workItemResult as { data: unknown; error: unknown }),
                }
              },
            }
          }
          return Promise.resolve(eventResult)
        },
        select() {
          return {
            eq() {
              return this
            },
            maybeSingle: () =>
              Promise.resolve(
                (existingLookupResult ?? { data: null, error: null }) as {
                  data: unknown
                  error: unknown
                },
              ),
          }
        },
      }
    },
    _calls: calls,
  }
  return supabase as unknown as Parameters<typeof enqueueHumanWorkItem>[0] & {
    _calls: typeof calls
  }
}

const onConfig = { FEATURE_HUMAN_WORK_ITEMS: true }
const offConfig = { FEATURE_HUMAN_WORK_ITEMS: false }

describe('enqueueHumanWorkItem', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null and does not insert when feature flag is off', async () => {
    const supabase = buildSupabase({ data: null, error: null })
    const res = await enqueueHumanWorkItem(supabase, offConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-1',
      title: 'Please review',
    })
    expect(res).toBeNull()
    expect(supabase._calls).toHaveLength(0)
  })

  it('returns null when title is empty', async () => {
    const supabase = buildSupabase({ data: null, error: null })
    const res = await enqueueHumanWorkItem(supabase, onConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-1',
      title: '   ',
    })
    expect(res).toBeNull()
    expect(supabase._calls).toHaveLength(0)
  })

  it('inserts work item + created event on happy path', async () => {
    const supabase = buildSupabase({
      data: { id: 'wi-1', org_id: 'org-1', status: 'open', priority: 'high' },
      error: null,
    })
    const res = await enqueueHumanWorkItem(supabase, onConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-1',
      title: 'Approve trade',
      priority: 'high',
      assigneeUserId: 'user-1',
      agentId: 'agent-1',
    })

    expect(res).toEqual({ id: 'wi-1', orgId: 'org-1', status: 'open', priority: 'high' })
    expect(supabase._calls).toHaveLength(2)
    expect(supabase._calls[0]?.table).toBe('human_work_items')
    expect(supabase._calls[1]?.table).toBe('human_work_item_events')

    const workItem = supabase._calls[0]?.payload as Record<string, unknown>
    expect(workItem.kind).toBe('pulse_standalone')
    expect(workItem.title).toBe('Approve trade')
    expect(workItem.priority).toBe('high')
    expect(workItem.assignee_user_id).toBe('user-1')
    expect(workItem.agent_id).toBe('agent-1')
  })

  it('derives due_at from sla_seconds when not explicitly set', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const supabase = buildSupabase({
      data: { id: 'wi-2', org_id: 'org-1', status: 'open', priority: 'normal' },
      error: null,
    })
    await enqueueHumanWorkItem(supabase, onConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-2',
      title: 'Urgent',
      slaSeconds: 3600,
    })

    const workItem = supabase._calls[0]?.payload as Record<string, unknown>
    expect(workItem.due_at).toBe(new Date(now + 3600 * 1000).toISOString())
    expect(workItem.sla_seconds).toBe(3600)
  })

  it('treats duplicate pulse_job_run_id as already enqueued (23505)', async () => {
    const supabase = buildSupabase(
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: {}, error: null },
      {
        data: { id: 'wi-existing', org_id: 'org-1', status: 'in_progress', priority: 'normal' },
        error: null,
      },
    )
    const res = await enqueueHumanWorkItem(supabase, onConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-dup',
      title: 'Duplicate',
    })

    expect(res).toEqual({
      id: 'wi-existing',
      orgId: 'org-1',
      status: 'in_progress',
      priority: 'normal',
    })
  })

  it('returns null on generic insert failure without throwing', async () => {
    const supabase = buildSupabase({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    const res = await enqueueHumanWorkItem(supabase, onConfig, {
      orgId: 'org-1',
      pulseJobRunId: 'run-err',
      title: 'Will fail',
    })
    expect(res).toBeNull()
  })
})
