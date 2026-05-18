/**
 * Linear Agent Handler — Unit Tests.
 *
 * Covers session event handling: assignment/mention/comment triggers,
 * concurrent session cap, idempotent upsert, immediate thought emission,
 * signal handling, and prompt building.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LinearAgentHandler } from '../adapters/linear/agent-handler.js'
import type { PmWebhookEvent } from '../types.js'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockEmitThought = vi.fn().mockResolvedValue(undefined)
const mockEmitError = vi.fn().mockResolvedValue(undefined)
const mockUpdateSessionStatus = vi.fn().mockResolvedValue(undefined)

const mockAgentClient = {
  emitThought: mockEmitThought,
  emitAction: vi.fn().mockResolvedValue(undefined),
  emitElicitation: vi.fn().mockResolvedValue(undefined),
  emitResponse: vi.fn().mockResolvedValue(undefined),
  emitError: mockEmitError,
  publishPlan: vi.fn().mockResolvedValue(undefined),
  setExternalUrl: vi.fn().mockResolvedValue(undefined),
  updateSessionStatus: mockUpdateSessionStatus,
}

// Mock Supabase
function createMockSupabase(overrides: {
  countActive?: number
  activeSession?: unknown | null
  upsertResult?: unknown | null
  agentId?: string | null
} = {}) {
  const mockFrom = vi.fn().mockReturnValue({
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: overrides.upsertResult ?? {
            id: 'db-session-1',
            org_id: 'org-1',
            linear_session_id: 'lin-session-1',
            linear_issue_id: 'issue-1',
            status: 'pending',
            trigger_type: 'assignment',
            created_at: '2026-04-09T00:00:00Z',
            updated_at: '2026-04-09T00:00:00Z',
          },
          error: overrides.upsertResult === null ? { message: 'insert failed' } : null,
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: overrides.activeSession ?? null,
                  error: null,
                }),
              }),
            }),
          }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: overrides.agentId !== undefined
                ? (overrides.agentId ? { id: overrides.agentId } : null)
                : { id: 'agent-1' },
              error: null,
            }),
          }),
        }),
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: overrides.activeSession ?? null,
                error: null,
              }),
            }),
          }),
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      // For count query — return special handler
      '*': undefined,
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })

  // Separate handler for count queries
  const mockFromWithCount = vi.fn().mockImplementation((table: string) => {
    if (table === 'linear_agent_sessions') {
      return {
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: overrides.upsertResult ?? {
                id: 'db-session-1',
                org_id: 'org-1',
                linear_session_id: 'lin-session-1',
                linear_issue_id: 'issue-1',
                status: 'pending',
                trigger_type: 'assignment',
                created_at: '2026-04-09T00:00:00Z',
                updated_at: '2026-04-09T00:00:00Z',
              },
              error: overrides.upsertResult === null ? { message: 'insert failed' } : null,
            }),
          }),
        }),
        select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact') {
            // count query
            return {
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  count: overrides.countActive ?? 0,
                  error: null,
                }),
              }),
            }
          }
          // Regular select
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: overrides.activeSession ?? null,
                        error: null,
                      }),
                    }),
                  }),
                }),
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: overrides.agentId !== undefined
                      ? (overrides.agentId ? { id: overrides.agentId } : null)
                      : { id: 'agent-1' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    // ai_assistants table
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: overrides.agentId !== undefined
                  ? (overrides.agentId ? { id: overrides.agentId } : null)
                  : { id: 'agent-1' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
  })

  return { from: mockFromWithCount } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeSessionEvent(overrides: Partial<PmWebhookEvent> = {}): PmWebhookEvent {
  return {
    provider: 'linear',
    type: 'agent.session_created',
    externalId: 'issue-1',
    isEcho: false,
    agentSessionPayload: {
      sessionId: 'lin-session-1',
      issueId: 'issue-1',
      issueIdentifier: 'ENG-42',
      issueTitle: 'Fix the login bug',
      triggerType: 'assignment',
      actorId: 'user-1',
      actorName: 'Alice',
    },
    ...overrides,
  }
}

describe('LinearAgentHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleSessionEvent', () => {
    it('returns missing_payload when agentSessionPayload is absent', async () => {
      const supabase = createMockSupabase()
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const result = await handler.handleSessionEvent(
        { ...makeSessionEvent(), agentSessionPayload: undefined },
        'org-1',
      )

      expect(result.runEnqueued).toBe(false)
      expect(result.reason).toBe('missing_payload')
    })

    it('rejects when concurrent session cap is exceeded', async () => {
      const supabase = createMockSupabase({ countActive: 5 })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never, {
        maxConcurrentSessions: 3,
      })

      const result = await handler.handleSessionEvent(makeSessionEvent(), 'org-1')

      expect(result.runEnqueued).toBe(false)
      expect(result.reason).toBe('concurrent_cap_exceeded')
      expect(mockEmitError).toHaveBeenCalledWith(
        'lin-session-1',
        expect.stringContaining('Session limit reached'),
      )
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('lin-session-1', 'failed')
    })

    it('processes an assignment trigger and emits thought', async () => {
      const supabase = createMockSupabase({ countActive: 0 })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const result = await handler.handleSessionEvent(makeSessionEvent(), 'org-1')

      expect(result.runEnqueued).toBe(true)
      expect(result.sessionId).toBe('db-session-1')
      expect(mockEmitThought).toHaveBeenCalledWith(
        'lin-session-1',
        expect.stringContaining('Analyzing assigned issue'),
      )
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('lin-session-1', 'running')
    })

    it('processes a mention trigger with correct thought text', async () => {
      const supabase = createMockSupabase({ countActive: 0 })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const event = makeSessionEvent({
        agentSessionPayload: {
          sessionId: 'lin-session-2',
          issueId: 'issue-2',
          triggerType: 'mention',
          issueTitle: 'Investigate regression',
        },
      })

      const result = await handler.handleSessionEvent(event, 'org-1')

      expect(result.runEnqueued).toBe(true)
      expect(mockEmitThought).toHaveBeenCalledWith(
        'lin-session-2',
        'Reviewing mentioned issue "Investigate regression"...',
      )
    })

    it('processes a comment trigger with correct thought text', async () => {
      const supabase = createMockSupabase({ countActive: 0 })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const event = makeSessionEvent({
        agentSessionPayload: {
          sessionId: 'lin-session-3',
          issueId: 'issue-3',
          triggerType: 'comment',
        },
      })

      const result = await handler.handleSessionEvent(event, 'org-1')

      expect(result.runEnqueued).toBe(true)
      expect(mockEmitThought).toHaveBeenCalledWith(
        'lin-session-3',
        'Reading comment on issue...',
      )
    })

    it('handles signal events without enqueuing a run', async () => {
      const supabase = createMockSupabase({
        countActive: 1,
        activeSession: {
          id: 'existing-session',
          org_id: 'org-1',
          linear_session_id: 'lin-session-1',
          status: 'active',
        },
      })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const event = makeSessionEvent({
        type: 'agent.session_signal',
        agentSessionPayload: {
          sessionId: 'lin-session-1',
          issueId: 'issue-1',
          triggerType: 'assignment',
          signal: 'stop',
        },
      })

      const result = await handler.handleSessionEvent(event, 'org-1')

      expect(result.runEnqueued).toBe(false)
      expect(result.reason).toBe('signal_recorded')
    })

    it('returns db_error when upsert fails', async () => {
      const supabase = createMockSupabase({ countActive: 0, upsertResult: null })
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const result = await handler.handleSessionEvent(makeSessionEvent(), 'org-1')

      expect(result.runEnqueued).toBe(false)
      expect(result.reason).toBe('db_error')
    })
  })

  describe('buildAgentPrompt', () => {
    it('builds a prompt with issue identifier and trigger', () => {
      const supabase = createMockSupabase()
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const prompt = handler.buildAgentPrompt({
        id: 'db-1',
        org_id: 'org-1',
        agent_id: 'agent-1',
        linear_session_id: 'lin-1',
        linear_issue_id: 'issue-1',
        linear_issue_identifier: 'ENG-42',
        linear_issue_url: null,
        status: 'active',
        trigger_type: 'assignment',
        run_id: null,
        pulse_job_run_id: null,
        linear_actor_id: 'user-1',
        linear_actor_name: 'Alice',
        signal: null,
        webhook_received_at: '2026-04-09T00:00:00Z',
        thought_emitted_at: null,
        run_started_at: null,
        completed_at: null,
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      })

      expect(prompt).toContain('ENG-42')
      expect(prompt).toContain('assignment')
      expect(prompt).toContain('Alice')
      expect(prompt).toContain('Linear issue')
    })

    it('includes signal when present', () => {
      const supabase = createMockSupabase()
      const handler = new LinearAgentHandler(supabase, mockAgentClient as never)

      const prompt = handler.buildAgentPrompt({
        id: 'db-1',
        org_id: 'org-1',
        agent_id: null,
        linear_session_id: 'lin-1',
        linear_issue_id: 'issue-1',
        linear_issue_identifier: null,
        linear_issue_url: null,
        status: 'active',
        trigger_type: 'mention',
        run_id: null,
        pulse_job_run_id: null,
        linear_actor_id: null,
        linear_actor_name: null,
        signal: 'please prioritize this',
        webhook_received_at: '2026-04-09T00:00:00Z',
        thought_emitted_at: null,
        run_started_at: null,
        completed_at: null,
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      })

      expect(prompt).toContain('please prioritize this')
    })
  })
})
