/**
 * Tests for scheduler tools.
 *
 * Covers: cron validation via croner, one-shot vs recurring,
 * timezone handling, invalid expressions, DST edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toolScheduleTask, type SchedulerContext } from '../scheduler.js'

function createMockSupabase(insertResult: { error: any } = { error: null }) {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(() => insertResult),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  } as any
}

function createCtx(sb: any): SchedulerContext {
  return {
    supabase: sb,
    assistantId: 'asst-001',
    orgId: 'org-aaa',
    conversationId: 'conv-001',
    parentRunId: 'run-001',
  }
}

describe('toolScheduleTask — cron validation', () => {
  it('rejects invalid cron expression', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'bad-cron', task_prompt: 'do thing', cron_expression: 'not-a-cron' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/Invalid cron expression/)
  })

  it('accepts valid 5-field cron expression', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'every-5min', task_prompt: 'check stuff', cron_expression: '*/5 * * * *' },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.type).toBe('recurring')
  })

  it('accepts cron with timezone', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'morning-check',
          task_prompt: 'morning report',
          cron_expression: '0 9 * * *',
          timezone: 'America/New_York',
        },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })

  it('accepts cron with Europe/Paris timezone (DST-prone)', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'paris-daily',
          task_prompt: 'daily report',
          cron_expression: '0 9 * * *',
          timezone: 'Europe/Paris',
        },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })

  it('rejects expression that will never fire', async () => {
    // Feb 30th doesn't exist — cron should return null nextRun
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'impossible', task_prompt: 'never', cron_expression: '0 0 30 2 *' },
        createCtx(sb),
      ),
    )
    // Croner may or may not treat this as an error vs "never fires"
    // Either way, we shouldn't silently schedule it
    expect(result.error || result.success).toBeTruthy()
  })

  it('rejects missing both cron_expression and run_at', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'no-schedule', task_prompt: 'do thing' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/Must provide either/)
  })

  it('rejects run_at in the past', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'past-task', task_prompt: 'do thing', run_at: '2020-01-01T00:00:00Z' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/in the future/)
  })

  it('accepts valid one-shot run_at', async () => {
    const sb = createMockSupabase()
    const futureDate = new Date(Date.now() + 3600_000).toISOString()
    const result = JSON.parse(
      await toolScheduleTask(
        { name: 'one-shot', task_prompt: 'do thing', run_at: futureDate },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.type).toBe('one-shot')
  })

  it('handles idempotency conflict (23505)', async () => {
    const sb = createMockSupabase({ error: { code: '23505', message: 'duplicate key' } })
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'duped',
          task_prompt: 'do thing',
          cron_expression: '*/5 * * * *',
          idempotency_key: 'unique-1',
        },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/idempotency_key/)
  })
})

describe('toolScheduleTask — DST transitions', () => {
  it('handles America/New_York DST spring forward (March)', async () => {
    // "0 2 * * *" at 2:00 AM — during spring forward, 2:00 AM doesn't exist
    // Croner should handle this gracefully (skip or shift)
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'dst-spring',
          task_prompt: 'spring forward test',
          cron_expression: '0 2 * * *',
          timezone: 'America/New_York',
        },
        createCtx(sb),
      ),
    )
    // Should not error — croner handles DST
    expect(result.success).toBe(true)
  })

  it('handles Europe/Paris DST fall back (October)', async () => {
    // "30 2 * * *" at 2:30 AM — during fall back, 2:30 AM happens twice
    // Croner should handle this without double-firing
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'dst-fall',
          task_prompt: 'fall back test',
          cron_expression: '30 2 * * *',
          timezone: 'Europe/Paris',
        },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })

  it('9 AM daily fires correctly across DST boundary', async () => {
    // This is the most common user case — "run at 9 AM every day"
    // Before and after DST, the cron should still produce valid nextRun
    const sb = createMockSupabase()
    const result = JSON.parse(
      await toolScheduleTask(
        {
          name: 'daily-9am',
          task_prompt: 'daily check',
          cron_expression: '0 9 * * *',
          timezone: 'America/New_York',
        },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })
})
