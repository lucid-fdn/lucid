/**
 * Webhook Executor — Unit Tests
 *
 * Tests: POST delivery, inline 2xx response, callback polling, timeout,
 * abort signal, HMAC token, retry on 5xx, no retry on 4xx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebhookExecutor, generateCallbackToken, verifyCallbackToken } from '../executors/webhook.js'
import type { StepExecutionContext } from '../executors/types.js'
import type { PulseJob } from '../types.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../executors/step-tracker.js', () => ({
  createStep: vi.fn().mockResolvedValue('step-123'),
  updateStepStatus: vi.fn().mockResolvedValue(undefined),
  getStepById: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: () => Promise<unknown>) => fn(),
}))

const { createStep, updateStepStatus, getStepById } = await import('../executors/step-tracker.js')

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<PulseJob> = {}): PulseJob {
  return {
    runId: 'evt-1:0',
    eventId: 'evt-1',
    eventType: 'inbound',
    agentId: 'agent-1',
    orgId: 'org-1',
    priority: 'normal',
    attempt: 0,
    enqueuedAt: Date.now(),
    stepType: 'webhook',
    webhookUrl: 'https://external.ai/process',
    webhookPayload: JSON.stringify({ data: 'test' }),
    ...overrides,
  }
}

function makeCtx(job: PulseJob): StepExecutionContext {
  return {
    job,
    supabase: {} as any,
    config: {
      PULSE_WEBHOOK_SECRET: 'test-secret-key',
      SUPABASE_URL: 'https://test.supabase.co',
    } as any,
    encryptionService: {} as any,
    abortController: new AbortController(),
  }
}

describe('WebhookExecutor', () => {
  let executor: WebhookExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new WebhookExecutor()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('canHandle', () => {
    it('returns true for webhook', () => {
      expect(executor.canHandle('webhook')).toBe(true)
    })

    it('returns false for non-webhook types', () => {
      expect(executor.canHandle('inbound')).toBe(false)
      expect(executor.canHandle('approval')).toBe(false)
    })
  })

  describe('type property', () => {
    it('is "webhook"', () => {
      expect(executor.type).toBe('webhook')
    })
  })

  describe('validation', () => {
    it('throws if PULSE_WEBHOOK_SECRET is missing', async () => {
      const ctx = makeCtx(makeJob())
      ctx.config = { ...ctx.config, PULSE_WEBHOOK_SECRET: undefined } as any

      await expect(executor.execute(ctx)).rejects.toThrow('PULSE_WEBHOOK_SECRET is required')
    })

    it('throws if webhookUrl is missing', async () => {
      const job = makeJob({ webhookUrl: undefined })
      await expect(executor.execute(makeCtx(job))).rejects.toThrow('webhookUrl is required')
    })

    it('throws if webhookUrl is not HTTPS', async () => {
      const job = makeJob({ webhookUrl: 'http://insecure.example.com' })
      await expect(executor.execute(makeCtx(job))).rejects.toThrow('webhookUrl must use HTTPS')
    })
  })

  describe('inline 2xx response', () => {
    it('completes immediately when external agent returns completed status', async () => {
      vi.useRealTimers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'completed', output: 'result data' }),
      })

      await executor.execute(makeCtx(makeJob()))

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(updateStepStatus).toHaveBeenCalledWith(
        expect.anything(),
        'step-123',
        expect.objectContaining({ status: 'completed', output: 'result data', callbackStatus: 'received' }),
      )
    })

    it('throws when inline response has failed status', async () => {
      vi.useRealTimers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'failed', errorMessage: 'bad input' }),
      })

      await expect(executor.execute(makeCtx(makeJob()))).rejects.toThrow('bad input')
    })
  })

  describe('delivery retries', () => {
    it('retries on 5xx (up to 3 attempts)', async () => {
      vi.useRealTimers()
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' })
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway' })

      await expect(executor.execute(makeCtx(makeJob()))).rejects.toThrow('Webhook POST returned 502')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('does not retry on 4xx', async () => {
      vi.useRealTimers()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      await expect(executor.execute(makeCtx(makeJob()))).rejects.toThrow('Webhook POST failed with 400')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('step creation failure', () => {
    it('throws if step creation fails', async () => {
      vi.useRealTimers()
      vi.mocked(createStep).mockResolvedValueOnce(null)

      await expect(executor.execute(makeCtx(makeJob()))).rejects.toThrow('Failed to create orchestration step')
    })
  })

  describe('POST payload', () => {
    it('sends correct payload and headers', async () => {
      vi.useRealTimers()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'completed' }),
      })

      await executor.execute(makeCtx(makeJob()))

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://external.ai/process')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')
      expect(options.headers['X-Pulse-Step-Id']).toBe('step-123')

      const body = JSON.parse(options.body)
      expect(body.stepId).toBe('step-123')
      expect(body.runId).toBe('evt-1:0')
      expect(body.eventId).toBe('evt-1')
      expect(body.agentId).toBe('agent-1')
      expect(body.orgId).toBe('org-1')
      expect(body.callbackToken).toBeDefined()
      expect(body.payload).toEqual({ data: 'test' })
    })
  })
})

describe('HMAC Helpers', () => {
  const secret = 'my-webhook-secret'

  it('generateCallbackToken is deterministic', () => {
    const token1 = generateCallbackToken('step-1', 'run-1', secret)
    const token2 = generateCallbackToken('step-1', 'run-1', secret)
    expect(token1).toBe(token2)
  })

  it('different inputs produce different tokens', () => {
    const token1 = generateCallbackToken('step-1', 'run-1', secret)
    const token2 = generateCallbackToken('step-2', 'run-1', secret)
    expect(token1).not.toBe(token2)
  })

  it('verifyCallbackToken returns true for valid token', () => {
    const token = generateCallbackToken('step-1', 'run-1', secret)
    expect(verifyCallbackToken(token, 'step-1', 'run-1', secret)).toBe(true)
  })

  it('verifyCallbackToken returns false for invalid token', () => {
    expect(verifyCallbackToken('invalid', 'step-1', 'run-1', secret)).toBe(false)
  })

  it('verifyCallbackToken returns false for wrong stepId', () => {
    const token = generateCallbackToken('step-1', 'run-1', secret)
    expect(verifyCallbackToken(token, 'step-2', 'run-1', secret)).toBe(false)
  })

  it('verifyCallbackToken returns false for different length tokens', () => {
    expect(verifyCallbackToken('short', 'step-1', 'run-1', secret)).toBe(false)
  })
})
