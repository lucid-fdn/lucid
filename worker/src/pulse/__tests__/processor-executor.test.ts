/**
 * Processor Executor — Unit Tests
 *
 * Tests: canHandle routing, delegation to processors, throw-based contract,
 * missing events, per-job AbortController in context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessorExecutor } from '../executors/processor.js'
import type { StepExecutionContext } from '../executors/types.js'
import type { PulseJob } from '../types.js'

// ─── Mock Processors ─────────────────────────────────────────────────────────

const mockProcessInbound = vi.fn()
const mockRepairCompletedInboundDelivery = vi.fn()
const mockProcessOutbound = vi.fn()
const mockProcessScheduled = vi.fn()

vi.mock('../../processors/inbound.js', () => ({
  processInboundEvent: (...args: unknown[]) => mockProcessInbound(...args),
  repairCompletedInboundDelivery: (...args: unknown[]) => mockRepairCompletedInboundDelivery(...args),
}))

vi.mock('../../processors/outbound.js', () => ({
  processOutboundEvent: (...args: unknown[]) => mockProcessOutbound(...args),
}))

vi.mock('../../processors/scheduled.js', () => ({
  processScheduledTask: (...args: unknown[]) => mockProcessScheduled(...args),
}))

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<void>) => fn(),
}))

// ─── Mock Supabase ───────────────────────────────────────────────────────────

function createMockSupabase(data: unknown, error: unknown = null) {
  const updateSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'event-1' }], error: null }),
      }),
    }),
  })
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
      update: updateSpy,
    }),
    __updateSpy: updateSpy,
  } as any
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<PulseJob> = {}): PulseJob {
  return {
    runId: 'test:0',
    eventId: 'event-1',
    eventType: 'inbound',
    agentId: 'agent-1',
    orgId: 'org-1',
    priority: 'normal',
    attempt: 0,
    enqueuedAt: Date.now(),
    ...overrides,
  }
}

function makeCtx(job: PulseJob, supabase: any): StepExecutionContext {
  return {
    job,
    supabase,
    config: {} as any,
    encryptionService: {} as any,
    abortController: new AbortController(),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProcessorExecutor', () => {
  let executor: ProcessorExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new ProcessorExecutor()
  })

  describe('canHandle', () => {
    it('returns true for inbound', () => {
      expect(executor.canHandle('inbound')).toBe(true)
    })

    it('returns true for outbound', () => {
      expect(executor.canHandle('outbound')).toBe(true)
    })

    it('returns true for scheduled', () => {
      expect(executor.canHandle('scheduled')).toBe(true)
    })

    it('returns false for webhook', () => {
      expect(executor.canHandle('webhook')).toBe(false)
    })

    it('returns false for approval', () => {
      expect(executor.canHandle('approval')).toBe(false)
    })

    it('returns false for unknown types', () => {
      expect(executor.canHandle('custom')).toBe(false)
      expect(executor.canHandle('')).toBe(false)
    })
  })

  describe('type property', () => {
    it('is "processor"', () => {
      expect(executor.type).toBe('processor')
    })
  })

  describe('execute — inbound', () => {
    it('delegates to processInboundEvent for pending event', async () => {
      const event = { id: 'event-1', status: 'pending', channel_type: 'telegram', attempts: 0 }
      const supabase = createMockSupabase(event)
      const job = makeJob({ eventType: 'inbound' })

      await executor.execute(makeCtx(job, supabase))

      expect(mockProcessInbound).toHaveBeenCalledTimes(1)
      expect(mockProcessInbound).toHaveBeenCalledWith(event, supabase, {}, {})
      expect(supabase.__updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing', attempts: 1 }),
      )
    })

    it('delegates to processInboundEvent for processing event', async () => {
      const event = { id: 'event-1', status: 'processing', locked_by: 'pulse:test:0' }
      const supabase = createMockSupabase(event)

      await executor.execute(makeCtx(makeJob(), supabase))

      expect(mockProcessInbound).toHaveBeenCalledTimes(1)
    })

    it('skips processing event owned by another worker run', async () => {
      const event = { id: 'event-1', status: 'processing', locked_by: 'pulse:someone-else' }
      const supabase = createMockSupabase(event)

      await executor.execute(makeCtx(makeJob(), supabase))

      expect(mockProcessInbound).not.toHaveBeenCalled()
      expect(supabase.__updateSpy).not.toHaveBeenCalled()
    })

    it('skips already-completed events', async () => {
      const event = { id: 'event-1', status: 'completed' }
      const supabase = createMockSupabase(event)

      await executor.execute(makeCtx(makeJob(), supabase))

      expect(mockProcessInbound).not.toHaveBeenCalled()
    })

    it('handles missing event without throwing', async () => {
      const supabase = createMockSupabase(null, { message: 'not found' })

      // Should return normally (complete) — event may have been deleted
      await executor.execute(makeCtx(makeJob(), supabase))

      expect(mockProcessInbound).not.toHaveBeenCalled()
    })
  })

  describe('execute — outbound', () => {
    it('delegates to processOutboundEvent', async () => {
      const event = { id: 'event-1', status: 'pending', attempts: 0 }
      const supabase = createMockSupabase(event)
      const job = makeJob({ eventType: 'outbound' })

      await executor.execute(makeCtx(job, supabase))

      expect(mockProcessOutbound).toHaveBeenCalledTimes(1)
      expect(supabase.__updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing', attempts: 1 }),
      )
    })
  })

  describe('execute — scheduled', () => {
    it('delegates to processScheduledTask', async () => {
      const task = { id: 'event-1', assistant_id: 'a', org_id: 'o', task_prompt: 'test' }
      const supabase = createMockSupabase(task)
      const job = makeJob({ eventType: 'scheduled' })

      await executor.execute(makeCtx(job, supabase))

      expect(mockProcessScheduled).toHaveBeenCalledTimes(1)
    })
  })

  describe('execute — stepType override', () => {
    it('uses stepType when present instead of eventType', async () => {
      const event = { id: 'event-1', status: 'pending' }
      const supabase = createMockSupabase(event)
      // eventType is 'inbound' but stepType is 'outbound'
      const job = makeJob({ eventType: 'inbound', stepType: 'outbound' })

      await executor.execute(makeCtx(job, supabase))

      // Should call outbound processor, not inbound
      expect(mockProcessOutbound).toHaveBeenCalledTimes(1)
      expect(mockProcessInbound).not.toHaveBeenCalled()
    })
  })

  describe('throw-based contract', () => {
    it('lets processor exceptions propagate (does not catch)', async () => {
      const event = { id: 'event-1', status: 'pending' }
      const supabase = createMockSupabase(event)
      mockProcessInbound.mockRejectedValueOnce(new Error('LLM timeout'))

      await expect(executor.execute(makeCtx(makeJob(), supabase))).rejects.toThrow('LLM timeout')
    })

    it('throws for unknown step type', async () => {
      const job = makeJob({ stepType: 'unknown-type' })
      const supabase = createMockSupabase(null)

      await expect(executor.execute(makeCtx(job, supabase))).rejects.toThrow('cannot handle step type')
    })
  })

  describe('AbortController in context', () => {
    it('receives an AbortController in context', async () => {
      const event = { id: 'event-1', status: 'pending' }
      const supabase = createMockSupabase(event)
      const ac = new AbortController()
      const ctx = { ...makeCtx(makeJob(), supabase), abortController: ac }

      await executor.execute(ctx)

      // ProcessorExecutor doesn't use abortController itself,
      // but it's available in context for subclasses/decorators
      expect(ctx.abortController).toBe(ac)
    })
  })
})
