/**
 * Linear Elicitation Handler — Unit Tests.
 *
 * Verifies elicitation emit → poll → response/timeout flow,
 * session status transitions, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { requestLinearClarification } from '../adapters/linear/elicitation-handler.js'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockEmitElicitation = vi.fn().mockResolvedValue(undefined)
const mockUpdateSession = vi.fn().mockResolvedValue(true)

vi.mock('../adapters/linear/agent-session-db.js', () => ({
  updateLinearSessionStatus: (...args: unknown[]) => mockUpdateSession(...args),
}))

function createMockClient() {
  return {
    emitElicitation: mockEmitElicitation,
    emitThought: vi.fn(),
    emitAction: vi.fn(),
    emitResponse: vi.fn(),
    emitError: vi.fn(),
    publishPlan: vi.fn(),
    setExternalUrl: vi.fn(),
    updateSessionStatus: vi.fn(),
  }
}

function createMockSupabase(pollResponses: Array<{ signal: string | null }>) {
  let pollIndex = 0
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const selectFn = vi.fn().mockImplementation(() => ({
    eq: vi.fn().mockImplementation(() => ({
      single: vi.fn().mockImplementation(async () => {
        const response = pollResponses[pollIndex] ?? { signal: null }
        if (pollIndex < pollResponses.length - 1) pollIndex++
        return { data: response, error: null }
      }),
    })),
  }))

  return {
    from: vi.fn().mockImplementation(() => ({
      select: selectFn,
      update: updateFn,
    })),
    _updateFn: updateFn,
    _selectFn: selectFn,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('requestLinearClarification', () => {
  beforeEach(() => {
    mockEmitElicitation.mockReset().mockResolvedValue(undefined)
    mockUpdateSession.mockReset().mockResolvedValue(true)
  })

  it('happy path: emit → poll → response found → return', async () => {
    const client = createMockClient()
    // First poll: null (no response yet), second poll: response
    const supabase = createMockSupabase([
      { signal: null },
      { signal: 'Use the REST API endpoint' },
    ])

    const result = await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Which API endpoint should I use?',
      supabase as never,
      'db-session-1',
      { timeoutMs: 500, pollIntervalMs: 50 },
    )

    expect(result.responded).toBe(true)
    expect(result.response).toBe('Use the REST API endpoint')

    // Verify elicitation was emitted
    expect(mockEmitElicitation).toHaveBeenCalledWith(
      'linear-session-1',
      'Which API endpoint should I use?',
    )

    // Verify status transitions: first to awaiting_input, then back to active
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      'db-session-1',
      'awaiting_input',
    )
    const activeCalls = mockUpdateSession.mock.calls.filter(
      (c: unknown[]) => c[2] === 'active',
    )
    expect(activeCalls.length).toBeGreaterThan(0)
  })

  it('timeout: no response → return { responded: false }', async () => {
    const client = createMockClient()
    // Always returns null signal
    const supabase = createMockSupabase([{ signal: null }])

    const result = await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Need info',
      supabase as never,
      'db-session-1',
      { timeoutMs: 150, pollIntervalMs: 50 },
    )

    expect(result.responded).toBe(false)
    expect(result.response).toBeUndefined()

    // Verify status restored to active after timeout
    const lastCall = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1]
    expect(lastCall[2]).toBe('active')
  })

  it('stop signal → treated as no response', async () => {
    const client = createMockClient()
    const supabase = createMockSupabase([{ signal: 'stop' }])

    const result = await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Question?',
      supabase as never,
      'db-session-1',
      { timeoutMs: 500, pollIntervalMs: 50 },
    )

    expect(result.responded).toBe(false)
  })

  it('session status transitions: active → awaiting_input → active', async () => {
    const client = createMockClient()
    const supabase = createMockSupabase([
      { signal: null },
      { signal: 'Yes, proceed' },
    ])

    await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Should I proceed?',
      supabase as never,
      'db-session-1',
      { timeoutMs: 500, pollIntervalMs: 50 },
    )

    // First call: set to awaiting_input
    expect(mockUpdateSession.mock.calls[0]).toEqual([
      expect.anything(),
      'db-session-1',
      'awaiting_input',
    ])

    // Last call: set back to active (with signal: null)
    const lastCall = mockUpdateSession.mock.calls[mockUpdateSession.mock.calls.length - 1]
    expect(lastCall[2]).toBe('active')
  })

  it('returns early when elicitation emission fails', async () => {
    const client = createMockClient()
    client.emitElicitation.mockRejectedValueOnce(new Error('Network error'))
    const supabase = createMockSupabase([{ signal: 'Got it' }])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Help?',
      supabase as never,
      'db-session-1',
      { timeoutMs: 500, pollIntervalMs: 50 },
    )

    // If the user never saw the elicitation, don't block for 5 min
    expect(result.responded).toBe(false)
    expect(result.response).toBeUndefined()
    // Should NOT have transitioned to awaiting_input
    expect(mockUpdateSession).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('handles poll DB errors gracefully and continues polling', async () => {
    const client = createMockClient()
    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => ({
            single: vi.fn().mockImplementation(async () => {
              callCount++
              if (callCount <= 2) {
                return { data: null, error: { message: 'DB error' } }
              }
              return { data: { signal: 'answer' }, error: null }
            }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await requestLinearClarification(
      client as never,
      'linear-session-1',
      'Q?',
      supabase as never,
      'db-session-1',
      { timeoutMs: 1000, pollIntervalMs: 50 },
    )

    expect(result.responded).toBe(true)
    expect(result.response).toBe('answer')
    warnSpy.mockRestore()
  })
})
