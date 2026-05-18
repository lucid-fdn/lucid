/**
 * Tests for soul_edit agent tool.
 *
 * Covers: validation, DB update, error handling, length limits,
 * per-run rate limiting, feed event emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toolSoulEdit, clearRunEditCount } from '../soul.js'

// Mock feed event emitter
vi.mock('../feed-events.js', () => ({
  emitAgentFeedEvent: vi.fn(),
}))

import { emitAgentFeedEvent } from '../feed-events.js'

function createMockSupabase(updateResult: { error: null | { message: string } } = { error: null }) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(updateResult),
  })

  return {
    from: vi.fn(() => ({
      update: updateFn,
      insert: vi.fn().mockReturnValue({
        then: vi.fn().mockReturnValue({ catch: vi.fn() }),
      }),
    })),
    _updateFn: updateFn,
  } as any
}

function createCtx(supabase: any, runId = 'run-001') {
  return {
    supabase,
    assistantId: 'assistant-123',
    orgId: 'org-aaa',
    runId,
  }
}

describe('soul_edit', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearRunEditCount('run-001')
    clearRunEditCount('run-002')
  })

  // ── Validation ────────────────────────────────────────────────────

  it('updates soul content successfully', async () => {
    const supabase = createMockSupabase()
    const result = JSON.parse(
      await toolSoulEdit({ content: 'I am a friendly trading assistant.' }, createCtx(supabase)),
    )

    expect(result.ok).toBe(true)
    expect(result.contentLength).toBe(34)
    expect(supabase.from).toHaveBeenCalledWith('ai_assistants')
  })

  it('rejects empty content', async () => {
    const supabase = createMockSupabase()
    const result = JSON.parse(
      await toolSoulEdit({ content: '' }, createCtx(supabase)),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('required')
  })

  it('rejects missing content', async () => {
    const supabase = createMockSupabase()
    const result = JSON.parse(
      await toolSoulEdit({ content: undefined as any }, createCtx(supabase)),
    )

    expect(result.ok).toBe(false)
  })

  it('rejects content exceeding max length', async () => {
    const supabase = createMockSupabase()
    const longContent = 'x'.repeat(10_001)
    const result = JSON.parse(
      await toolSoulEdit({ content: longContent }, createCtx(supabase)),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('10000')
  })

  it('allows content at exactly max length', async () => {
    const supabase = createMockSupabase()
    const exactContent = 'x'.repeat(10_000)
    const result = JSON.parse(
      await toolSoulEdit({ content: exactContent }, createCtx(supabase)),
    )

    expect(result.ok).toBe(true)
    expect(result.contentLength).toBe(10_000)
  })

  it('handles DB errors gracefully', async () => {
    const supabase = createMockSupabase({ error: { message: 'connection refused' } })
    const result = JSON.parse(
      await toolSoulEdit({ content: 'New soul' }, createCtx(supabase)),
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to persist')
  })

  // ── Rate limiting ─────────────────────────────────────────────────

  it('allows up to 3 edits per run', async () => {
    const supabase = createMockSupabase()
    const ctx = createCtx(supabase)

    for (let i = 1; i <= 3; i++) {
      const result = JSON.parse(
        await toolSoulEdit({ content: `Soul v${i}` }, ctx),
      )
      expect(result.ok).toBe(true)
    }

    // 4th should be rejected
    const result = JSON.parse(
      await toolSoulEdit({ content: 'Soul v4' }, ctx),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('rate limit')
  })

  it('rate limits are per-run (different runs are independent)', async () => {
    const supabase = createMockSupabase()

    // Exhaust run-001
    for (let i = 1; i <= 3; i++) {
      await toolSoulEdit({ content: `Soul ${i}` }, createCtx(supabase, 'run-001'))
    }

    // run-002 should still work
    const result = JSON.parse(
      await toolSoulEdit({ content: 'Fresh run' }, createCtx(supabase, 'run-002')),
    )
    expect(result.ok).toBe(true)
  })

  it('clearRunEditCount resets the counter', async () => {
    const supabase = createMockSupabase()
    const ctx = createCtx(supabase)

    // Exhaust
    for (let i = 1; i <= 3; i++) {
      await toolSoulEdit({ content: `Soul ${i}` }, ctx)
    }

    // Clear and retry
    clearRunEditCount('run-001')
    const result = JSON.parse(
      await toolSoulEdit({ content: 'After reset' }, ctx),
    )
    expect(result.ok).toBe(true)
  })

  // ── Feed events ───────────────────────────────────────────────────

  it('emits soul_updated feed event on success', async () => {
    const supabase = createMockSupabase()
    await toolSoulEdit({ content: 'New identity' }, createCtx(supabase))

    expect(emitAgentFeedEvent).toHaveBeenCalledWith(supabase, {
      agentId: 'assistant-123',
      orgId: 'org-aaa',
      eventType: 'soul_updated',
      runId: 'run-001',
      payload: {
        content_length: 12,
        preview: 'New identity',
      },
    })
  })

  it('does not emit feed event on validation failure', async () => {
    const supabase = createMockSupabase()
    await toolSoulEdit({ content: '' }, createCtx(supabase))

    expect(emitAgentFeedEvent).not.toHaveBeenCalled()
  })

  it('does not emit feed event on DB error', async () => {
    const supabase = createMockSupabase({ error: { message: 'db error' } })
    await toolSoulEdit({ content: 'Fail' }, createCtx(supabase))

    expect(emitAgentFeedEvent).not.toHaveBeenCalled()
  })
})
