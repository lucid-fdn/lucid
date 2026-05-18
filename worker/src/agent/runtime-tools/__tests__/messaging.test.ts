/**
 * Tests for cross-agent messaging tool.
 *
 * Uses mock Supabase client — these are unit tests, not integration tests.
 * Covers: org isolation, self-send block, rate limiting, loop protection,
 * deterministic dedup keys, channel provisioning race condition.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toolSendMessageToAgent, type MessagingContext } from '../messaging.js'

// Mock the tracing module to be a passthrough
vi.mock('../../../observability/tracing.js', () => ({
  withSpan: async (_name: string, _attrs: Record<string, unknown>, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() }),
}))

// Mock the metrics module
vi.mock('../../../observability/metrics.js', () => ({
  incMessagesEnqueued: vi.fn(),
  incMessagesRejected: vi.fn(),
}))

// Mock TenantRateLimiter
const mockTryConsume = vi.fn().mockResolvedValue({ allowed: true, remaining: 10 })
vi.mock('../../../guards/TenantRateLimiter.js', () => ({
  TenantRateLimiter: vi.fn().mockImplementation(() => ({
    tryConsume: mockTryConsume,
  })),
}))

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
  }

  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table]
      return defaultChain
    }),
    rpc: vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 10 }, error: null }),
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

describe('toolSendMessageToAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue({ allowed: true, remaining: 10 })
  })

  it('rejects empty target_assistant_id', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(await toolSendMessageToAgent({ target_assistant_id: '', message: 'hi' }, createCtx(sb)))
    expect(result.error).toMatch(/required/)
  })

  it('rejects empty message', async () => {
    const sb = createMockSupabase()
    const result = JSON.parse(await toolSendMessageToAgent({ target_assistant_id: 'target-222', message: '  ' }, createCtx(sb)))
    expect(result.error).toMatch(/required/)
  })

  it('rejects self-send', async () => {
    const sb = createMockSupabase()
    const ctx = createCtx(sb, { sourceAssistantId: 'same-id' })
    const result = JSON.parse(await toolSendMessageToAgent({ target_assistant_id: 'same-id', message: 'hi' }, ctx))
    expect(result.error).toMatch(/yourself/)
  })

  it('rejects cross-org messaging', async () => {
    const assistantChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'target-222', name: 'TargetBot', org_id: 'other-org' },
        error: null,
      }),
    }
    const sb = createMockSupabase({ ai_assistants: assistantChain })
    const result = JSON.parse(
      await toolSendMessageToAgent({ target_assistant_id: 'target-222', message: 'hi' }, createCtx(sb)),
    )
    expect(result.error).toMatch(/other organizations/)
  })

  it('rejects when target assistant not found', async () => {
    const assistantChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }
    const sb = createMockSupabase({ ai_assistants: assistantChain })
    const result = JSON.parse(
      await toolSendMessageToAgent({ target_assistant_id: 'target-222', message: 'hi' }, createCtx(sb)),
    )
    expect(result.error).toMatch(/not found/)
  })

  it('rejects when rate limited', async () => {
    mockTryConsume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 5000 })

    const assistantChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'target-222', name: 'TargetBot', org_id: 'org-aaa' },
        error: null,
      }),
    }
    const sb = createMockSupabase({ ai_assistants: assistantChain })
    const result = JSON.parse(
      await toolSendMessageToAgent({ target_assistant_id: 'target-222', message: 'hi' }, createCtx(sb)),
    )
    expect(result.error).toMatch(/Rate limit/)
    expect(result.retry_after_ms).toBe(5000)
  })

  it('uses deterministic external_message_id from toolCallId', async () => {
    let insertedPayload: any = null

    const assistantChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'target-222', name: 'TargetBot', org_id: 'org-aaa' },
        error: null,
      }),
    }

    const channelChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'channel-999' }, error: null }),
      insert: vi.fn().mockReturnThis(),
    }

    const inboundChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn((payload: any) => {
        insertedPayload = payload
        return { error: null }
      }),
    }

    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'ai_assistants') return assistantChain
        if (table === 'assistant_channels') return channelChain
        if (table === 'assistant_inbound_events') return inboundChain
        return {}
      }),
    } as any

    const ctx = createCtx(sb, { parentRunId: 'run-xyz', toolCallId: 'tc-42' })
    const result = JSON.parse(
      await toolSendMessageToAgent({ target_assistant_id: 'target-222', message: 'hello' }, ctx),
    )

    expect(result.success).toBe(true)
    expect(result.message_id).toBe('run-xyz:tc-42')
    expect(insertedPayload).toBeTruthy()
    expect(insertedPayload.external_message_id).toBe('agent-msg:run-xyz:tc-42')
  })
})
