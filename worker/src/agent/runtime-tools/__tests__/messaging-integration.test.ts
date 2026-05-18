/**
 * Integration tests for cross-agent messaging tool.
 *
 * Covers: message length validation, loop protection, channel race condition,
 * dedup key determinism, full success flow, insert failure handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toolSendMessageToAgent, type MessagingContext } from '../messaging.js'

// Mock tracing → passthrough
vi.mock('../../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
}))

// Mock metrics
const mockIncEnqueued = vi.fn()
const mockIncRejected = vi.fn()
vi.mock('../../../observability/metrics.js', () => ({
  incMessagesEnqueued: (...args: any[]) => mockIncEnqueued(...args),
  incMessagesRejected: (...args: any[]) => mockIncRejected(...args),
}))

// Mock TenantRateLimiter
const mockTryConsume = vi.fn().mockResolvedValue({ allowed: true, remaining: 10 })
vi.mock('../../../guards/TenantRateLimiter.js', () => ({
  TenantRateLimiter: vi.fn().mockImplementation(() => ({
    tryConsume: mockTryConsume,
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFullMockSupabase(opts: {
  targetAssistant?: { id: string; name: string; org_id: string } | null
  targetError?: any
  existingChannel?: { id: string } | null
  channelInsertError?: any
  channelRetry?: { id: string } | null
  loopGuardResult?: { id: string } | null
  insertError?: any
} = {}) {
  const target = opts.targetAssistant ?? { id: 'target-222', name: 'TargetBot', org_id: 'org-aaa' }
  let insertedPayload: any = null

  return {
    from: vi.fn((table: string) => {
      if (table === 'ai_assistants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: opts.targetError ? null : target,
            error: opts.targetError ?? null,
          }),
        }
      }
      if (table === 'assistant_channels') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
            .mockResolvedValueOnce({
              data: opts.existingChannel ?? { id: 'channel-999' },
              error: opts.existingChannel === null ? { message: 'not found' } : null,
            })
            .mockResolvedValue({
              data: opts.channelRetry ?? { id: 'channel-retry' },
              error: null,
            }),
          insert: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: opts.channelInsertError ? null : { id: 'channel-new' },
              error: opts.channelInsertError ?? null,
            }),
          })),
        }
      }
      if (table === 'assistant_inbound_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: opts.loopGuardResult ?? null,
            error: null,
          }),
          insert: vi.fn((payload: any) => {
            insertedPayload = payload
            return { error: opts.insertError ?? null }
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
    getInsertedPayload: () => insertedPayload,
  } as any
}

function createCtx(supabase: any, extra: Partial<MessagingContext> = {}): MessagingContext {
  return {
    supabase,
    sourceAssistantId: 'source-111',
    sourceAssistantName: 'SourceBot',
    orgId: 'org-aaa',
    parentRunId: 'run-xyz',
    toolCallId: 'tool-call-1',
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('messaging — message length validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('rejects messages exceeding 50KB', async () => {
    const sb = createFullMockSupabase()
    const longMessage = 'x'.repeat(50_001)
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: longMessage },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/too long/i)
    expect(mockIncRejected).toHaveBeenCalledWith('too_long')
  })

  it('accepts messages at exactly 50KB', async () => {
    const sb = createFullMockSupabase()
    const exactMessage = 'x'.repeat(50_000)
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: exactMessage },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })

  it('accepts normal-length messages', async () => {
    const sb = createFullMockSupabase()
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'Hello from agent!' },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.delivery).toBe('async')
  })
})

describe('messaging — loop protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('blocks message when loop guard detects recent send', async () => {
    const sb = createFullMockSupabase({
      loopGuardResult: { id: 'recent-event-id' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'ping again' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/Loop protection/)
    expect(mockIncRejected).toHaveBeenCalledWith('loop_guard')
  })

  it('allows message when loop guard finds no recent send', async () => {
    const sb = createFullMockSupabase({
      loopGuardResult: null,
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'first message' },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
  })
})

describe('messaging — channel provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('reuses existing agent channel', async () => {
    const sb = createFullMockSupabase({
      existingChannel: { id: 'existing-ch-123' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hi' },
        createCtx(sb),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.channel_id).toBe('existing-ch-123')
  })

  it('handles channel creation race condition (23505)', async () => {
    const sb = createFullMockSupabase({
      existingChannel: null,
      channelInsertError: { code: '23505', message: 'duplicate key' },
      channelRetry: { id: 'channel-from-retry' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hi' },
        createCtx(sb),
      ),
    )
    // Should succeed by retrying lookup after race condition
    expect(result.success).toBe(true)
  })
})

describe('messaging — dedup and delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('generates deterministic message_id from parentRunId + toolCallId', async () => {
    const sb = createFullMockSupabase()
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hello' },
        createCtx(sb, { parentRunId: 'run-abc', toolCallId: 'tc-42' }),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.message_id).toBe('run-abc:tc-42')
  })

  it('generates random message_id when toolCallId absent', async () => {
    const sb = createFullMockSupabase()
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hello' },
        createCtx(sb, { toolCallId: undefined }),
      ),
    )
    expect(result.success).toBe(true)
    expect(result.message_id).toBeTruthy()
    // Should be a UUID (random)
    expect(result.message_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('includes correct metadata in response', async () => {
    const sb = createFullMockSupabase()
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hello' },
        createCtx(sb),
      ),
    )
    expect(result.target_assistant.id).toBe('target-222')
    expect(result.target_assistant.name).toBe('TargetBot')
    expect(result.delivery).toBe('async')
    expect(result.note).toMatch(/queued/)
  })

  it('handles inbound event insert failure', async () => {
    const sb = createFullMockSupabase({
      insertError: { message: 'constraint violation' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hello' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/Failed to send/)
  })

  it('increments enqueued metric on success', async () => {
    const sb = createFullMockSupabase()
    await toolSendMessageToAgent(
      { target_assistant_id: 'target-222', message: 'hello' },
      createCtx(sb),
    )
    expect(mockIncEnqueued).toHaveBeenCalledTimes(1)
  })
})

describe('messaging — org isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('blocks self-send with helpful message', async () => {
    const sb = createFullMockSupabase()
    const ctx = createCtx(sb, { sourceAssistantId: 'target-222' })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hi self' },
        ctx,
      ),
    )
    expect(result.error).toMatch(/yourself/)
    expect(result.error).toMatch(/spawn_subagent/)
  })

  it('blocks cross-org messaging', async () => {
    const sb = createFullMockSupabase({
      targetAssistant: { id: 'target-222', name: 'OtherBot', org_id: 'different-org' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'target-222', message: 'hi' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/other organizations/)
  })

  it('blocks when target not found', async () => {
    const sb = createFullMockSupabase({
      targetAssistant: null,
      targetError: { message: 'not found' },
    })
    const result = JSON.parse(
      await toolSendMessageToAgent(
        { target_assistant_id: 'ghost-id', message: 'hi' },
        createCtx(sb),
      ),
    )
    expect(result.error).toMatch(/not found/)
  })
})
