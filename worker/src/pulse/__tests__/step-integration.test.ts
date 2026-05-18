/**
 * Step Execution Integration Tests
 *
 * End-to-end tests verifying multi-executor scenarios:
 * - Registry routing to correct executor
 * - ProcessorExecutor backwards compat
 * - Mixed executors in same registry
 * - Per-job AbortController behavior
 * - Step tracking across executor types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ExecutorRegistry } from '../executors/registry.js'
import { WebhookExecutor } from '../executors/webhook.js'
import { ApprovalExecutor } from '../executors/approval.js'
import { ProcessorExecutor } from '../executors/processor.js'
import { createDefaultRegistry } from '../executors/index.js'
import type { StepExecutor, StepExecutionContext } from '../executors/types.js'
import type { PulseJob } from '../types.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../executors/step-tracker.js', () => ({
  createStep: vi.fn().mockResolvedValue('step-int-1'),
  updateStepStatus: vi.fn().mockResolvedValue(undefined),
  getStepById: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) => fn(),
}))

vi.mock('../../processors/inbound.js', () => ({
  processInboundEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../processors/outbound.js', () => ({
  processOutboundEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../processors/scheduled.js', () => ({
  processScheduledTask: vi.fn().mockResolvedValue(undefined),
}))

const { createStep, updateStepStatus } = await import('../executors/step-tracker.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<PulseJob> = {}): PulseJob {
  return {
    runId: 'evt-int:0',
    eventId: 'evt-int',
    eventType: 'inbound',
    agentId: 'agent-1',
    orgId: 'org-1',
    priority: 'normal',
    attempt: 0,
    enqueuedAt: Date.now(),
    ...overrides,
  }
}

function makeCtx(job: PulseJob, supabaseOverrides?: any): StepExecutionContext {
  return {
    job,
    supabase: supabaseOverrides ?? {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'evt-int' }, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'evt-int' }, error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'step-int-1' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any,
    config: {
      PULSE_WEBHOOK_SECRET: 'test-secret',
      SUPABASE_URL: 'https://test.supabase.co',
    } as any,
    encryptionService: {} as any,
    abortController: new AbortController(),
  }
}

describe('Step Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createDefaultRegistry', () => {
    it('creates registry with WebhookExecutor, ApprovalExecutor, and ProcessorExecutor', () => {
      const registry = createDefaultRegistry()

      // Webhook should resolve
      expect(registry.resolve('webhook')).toBeInstanceOf(WebhookExecutor)
      // Approval should resolve
      expect(registry.resolve('approval')).toBeInstanceOf(ApprovalExecutor)
      // Standard types fall through to ProcessorExecutor
      expect(registry.resolve('inbound')).toBeInstanceOf(ProcessorExecutor)
      expect(registry.resolve('outbound')).toBeInstanceOf(ProcessorExecutor)
      expect(registry.resolve('scheduled')).toBeInstanceOf(ProcessorExecutor)
    })

    it('ProcessorExecutor is last (catch-all)', () => {
      const registry = createDefaultRegistry()
      // Unknown type returns null (ProcessorExecutor only handles known types)
      expect(registry.resolve('unknown')).toBeNull()
    })
  })

  describe('registry routing', () => {
    it('routes webhook step to WebhookExecutor', () => {
      const registry = createDefaultRegistry()
      const executor = registry.resolve('webhook')
      expect(executor?.type).toBe('webhook')
    })

    it('routes approval step to ApprovalExecutor', () => {
      const registry = createDefaultRegistry()
      const executor = registry.resolve('approval')
      expect(executor?.type).toBe('approval')
    })

    it('routes inbound to ProcessorExecutor', () => {
      const registry = createDefaultRegistry()
      const executor = registry.resolve('inbound')
      expect(executor?.type).toBe('processor')
    })

    it('first-match semantics — specialized before catch-all', () => {
      const registry = new ExecutorRegistry()
      // Register a custom webhook handler first
      const custom: StepExecutor = {
        type: 'custom-webhook',
        canHandle: (t: string) => t === 'webhook',
        execute: vi.fn(),
      }
      registry.register(custom)
      registry.register(new WebhookExecutor())

      const resolved = registry.resolve('webhook')
      expect(resolved?.type).toBe('custom-webhook')
    })
  })

  describe('mixed executors coexistence', () => {
    it('all three executors resolve independently', () => {
      const registry = createDefaultRegistry()

      const webhook = registry.resolve('webhook')
      const approval = registry.resolve('approval')
      const processor = registry.resolve('inbound')

      expect(webhook).not.toBe(approval)
      expect(approval).not.toBe(processor)
      expect(webhook?.type).toBe('webhook')
      expect(approval?.type).toBe('approval')
      expect(processor?.type).toBe('processor')
    })
  })

  describe('per-job AbortController', () => {
    it('each context has independent AbortController', () => {
      const ctx1 = makeCtx(makeJob({ runId: 'run-1:0' }))
      const ctx2 = makeCtx(makeJob({ runId: 'run-2:0' }))

      ctx1.abortController.abort()

      expect(ctx1.abortController.signal.aborted).toBe(true)
      expect(ctx2.abortController.signal.aborted).toBe(false)
    })

    it('abort propagates to executor via signal', async () => {
      const executor = new ApprovalExecutor()
      const job = makeJob({
        stepType: 'approval',
        approvalConfig: { toolName: 'dex_swap', toolArgs: {}, timeoutSeconds: 60 },
      })

      // Create supabase that always returns pending
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'mc_pending_approvals') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'appr-1' }, error: null }),
                }),
              }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null }),
                }),
              }),
            }
          }
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'step-1' }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }),
      } as any

      const ctx = makeCtx(job, supabase)

      // Abort shortly after start
      setTimeout(() => ctx.abortController.abort(), 100)

      await expect(executor.execute(ctx)).rejects.toThrow('worker shutting down')
    })
  })

  describe('step tracking across executor types', () => {
    it('webhook executor creates step with type webhook', async () => {
      const executor = new WebhookExecutor()
      const job = makeJob({
        stepType: 'webhook',
        webhookUrl: 'https://external.ai/process',
        webhookPayload: JSON.stringify({ data: 'test' }),
      })

      // Mock fetch for inline response
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'completed', output: 'done' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      try {
        await executor.execute(makeCtx(job))

        expect(createStep).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            stepType: 'webhook',
            executorType: 'webhook',
          }),
        )
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('approval executor creates step with type approval', async () => {
      const job = makeJob({
        stepType: 'approval',
        approvalConfig: { toolName: 'dex_swap', toolArgs: {}, timeoutSeconds: 300 },
      })

      // Create supabase that returns approved immediately
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'mc_pending_approvals') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'appr-1' }, error: null }),
                }),
              }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { status: 'approved' }, error: null }),
                }),
              }),
            }
          }
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'step-1' }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }),
      } as any

      const executor = new ApprovalExecutor()
      await executor.execute(makeCtx(job, supabase))

      expect(createStep).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          stepType: 'approval',
          executorType: 'approval',
        }),
      )
    })
  })

  describe('ProcessorExecutor backwards compat', () => {
    it('still handles standard event types when registered', () => {
      const processor = new ProcessorExecutor()
      expect(processor.canHandle('inbound')).toBe(true)
      expect(processor.canHandle('outbound')).toBe(true)
      expect(processor.canHandle('scheduled')).toBe(true)
    })

    it('does not handle webhook or approval', () => {
      const processor = new ProcessorExecutor()
      expect(processor.canHandle('webhook')).toBe(false)
      expect(processor.canHandle('approval')).toBe(false)
    })
  })
})
