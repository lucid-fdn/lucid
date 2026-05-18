/**
 * Step Tracker — Unit Tests
 *
 * Tests: create step, update status, get by ID, best-effort error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStep, updateStepStatus, getStepById } from '../executors/step-tracker.js'

// ─── Mock Supabase ───────────────────────────────────────────────────────────

function createMockSupabase(options: {
  insertData?: Record<string, unknown> | null
  insertError?: { message: string } | null
  selectData?: Record<string, unknown> | null
  selectError?: { message: string } | null
  updateError?: { message: string } | null
} = {}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: options.insertData ?? { id: 'step-1' },
            error: options.insertError ?? null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: options.updateError ?? null,
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: options.selectData ?? null,
            error: options.selectError ?? null,
          }),
        }),
      }),
    }),
  } as any
}

describe('Step Tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const EVENT_ID = '11111111-1111-1111-1111-111111111111'
  const AGENT_ID = '22222222-2222-2222-2222-222222222222'
  const ORG_ID = '33333333-3333-3333-3333-333333333333'

  describe('createStep', () => {
    it('creates step and returns ID', async () => {
      const supabase = createMockSupabase({ insertData: { id: 'step-abc' } })
      const result = await createStep(supabase, {
        runId: 'evt:0',
        eventId: EVENT_ID,
        attempt: 0,
        stepType: 'webhook',
        executorType: 'webhook',
        agentId: AGENT_ID,
        orgId: ORG_ID,
        webhookUrl: 'https://example.com/hook',
      })
      expect(result).toBe('step-abc')
    })

    it('returns null on DB error (best-effort)', async () => {
      const supabase = createMockSupabase({ insertData: null, insertError: { message: 'constraint violation' } })
      const result = await createStep(supabase, {
        runId: 'evt:0',
        eventId: EVENT_ID,
        attempt: 0,
        stepType: 'webhook',
        executorType: 'webhook',
        agentId: AGENT_ID,
        orgId: ORG_ID,
      })
      expect(result).toBeNull()
    })

    it('returns null on exception (best-effort)', async () => {
      const supabase = { from: vi.fn().mockImplementation(() => { throw new Error('crash') }) } as any
      const result = await createStep(supabase, {
        runId: 'evt:0',
        eventId: EVENT_ID,
        attempt: 0,
        stepType: 'webhook',
        executorType: 'webhook',
        agentId: AGENT_ID,
        orgId: ORG_ID,
      })
      expect(result).toBeNull()
    })

    it('sets callback_status to pending for webhook steps', async () => {
      const supabase = createMockSupabase()
      await createStep(supabase, {
        runId: 'evt:0',
        eventId: EVENT_ID,
        attempt: 0,
        stepType: 'webhook',
        executorType: 'webhook',
        agentId: AGENT_ID,
        orgId: ORG_ID,
        webhookUrl: 'https://example.com',
      })

      const insertCall = supabase.from().insert
      expect(insertCall).toHaveBeenCalled()
      const insertedRow = insertCall.mock.calls[0][0]
      expect(insertedRow.callback_status).toBe('pending')
    })
  })

  describe('updateStepStatus', () => {
    it('updates step without throwing on success', async () => {
      const supabase = createMockSupabase()
      await updateStepStatus(supabase, 'step-1', { status: 'completed', output: 'result' })
      // No throw = success
    })

    it('logs but does not throw on DB error', async () => {
      const supabase = createMockSupabase({ updateError: { message: 'db down' } })
      // Should not throw
      await updateStepStatus(supabase, 'step-1', { status: 'failed', errorMessage: 'timeout' })
    })
  })

  describe('getStepById', () => {
    it('returns step data when found', async () => {
      const step = { id: 'step-1', run_id: 'evt:0', event_id: 'evt-1', status: 'running', callback_status: 'pending', output: null, error_message: null }
      const supabase = createMockSupabase({ selectData: step })
      const result = await getStepById(supabase, 'step-1')
      expect(result).toEqual(step)
    })

    it('returns null when not found', async () => {
      const supabase = createMockSupabase({ selectData: null, selectError: { message: 'not found' } })
      const result = await getStepById(supabase, 'nonexistent')
      expect(result).toBeNull()
    })

    it('returns null on exception', async () => {
      const supabase = { from: vi.fn().mockImplementation(() => { throw new Error('crash') }) } as any
      const result = await getStepById(supabase, 'step-1')
      expect(result).toBeNull()
    })
  })
})
