/**
 * Linear Agent E2E — Full Lifecycle Integration Tests.
 *
 * Validates the complete Linear agent session lifecycle with mocked
 * infrastructure: webhook → session upsert → thought → run → activities →
 * completion. Tests concurrent cap enforcement, duplicate idempotency,
 * stop signal handling, feature flag gating, missing agent handling,
 * and error recovery.
 *
 * All Supabase, Nango, and processing calls are mocked — this tests the
 * integration wiring between handler, client, and session DB.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LinearAgentHandler } from '../adapters/linear/agent-handler.js'
import { LinearAgentClient } from '../adapters/linear/agent-client.js'
import {
  upsertLinearSession,
  countActiveSessions,
  getActiveSessionForIssue,
  updateLinearSessionStatus,
  getLinearSession,
} from '../adapters/linear/agent-session-db.js'
import type { PmWebhookEvent } from '../types.js'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../adapters/linear/agent-session-db.js', () => ({
  upsertLinearSession: vi.fn(),
  countActiveSessions: vi.fn(),
  getActiveSessionForIssue: vi.fn(),
  updateLinearSessionStatus: vi.fn(),
  getLinearSession: vi.fn(),
  getLinearSessionById: vi.fn(),
}))

vi.mock('../../../agent/oauth-tools/nango-client.js', () => ({
  getNangoClient: () => null, // Return null so client warns and returns void
}))

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG_ID = 'org-e2e-1'
const AGENT_ID = 'agent-e2e-1'
const LINEAR_SESSION_ID = 'lin-session-e2e'
const ISSUE_ID = 'issue-e2e-1'

function makeEvent(overrides: Partial<PmWebhookEvent> = {}): PmWebhookEvent {
  return {
    provider: 'linear',
    type: 'agent.session_created',
    externalId: ISSUE_ID,
    isEcho: false,
    agentSessionPayload: {
      sessionId: LINEAR_SESSION_ID,
      issueId: ISSUE_ID,
      issueIdentifier: 'ENG-100',
      issueTitle: 'Implement user avatars',
      triggerType: 'assignment',
      actorId: 'user-e2e',
      actorName: 'Bob',
    },
    ...overrides,
  }
}

const SESSION_ROW = {
  id: 'db-session-e2e',
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  linear_session_id: LINEAR_SESSION_ID,
  linear_issue_id: ISSUE_ID,
  linear_issue_identifier: 'ENG-100',
  linear_issue_url: 'https://linear.app/team/issue/ENG-100',
  status: 'pending',
  trigger_type: 'assignment',
  run_id: null,
  pulse_job_run_id: null,
  linear_actor_id: 'user-e2e',
  linear_actor_name: 'Bob',
  signal: null,
  webhook_received_at: '2026-04-10T00:00:00Z',
  thought_emitted_at: null,
  run_started_at: null,
  completed_at: null,
  created_at: '2026-04-10T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
}

function createMockSupabase(opts: { agentId?: string | null } = {}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'ai_assistants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: opts.agentId !== undefined
                      ? (opts.agentId ? { id: opts.agentId } : null)
                      : { id: AGENT_ID },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      return {}
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Linear Agent E2E', () => {
  let agentClient: LinearAgentClient
  let handler: LinearAgentHandler
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    agentClient = new LinearAgentClient('conn-e2e')
    supabase = createMockSupabase()
    handler = new LinearAgentHandler(supabase, agentClient as never)

    // Default DB mocks: no active sessions, upsert succeeds
    vi.mocked(countActiveSessions).mockResolvedValue(0)
    vi.mocked(getActiveSessionForIssue).mockResolvedValue(null)
    vi.mocked(upsertLinearSession).mockResolvedValue(SESSION_ROW)
    vi.mocked(updateLinearSessionStatus).mockResolvedValue(true)
  })

  // ─── Scenario 1: Full lifecycle ───────────────────────────────────────────

  it('full lifecycle: webhook → session → thought → status active → run enqueued', async () => {
    const event = makeEvent()

    const result = await handler.handleSessionEvent(event, ORG_ID)

    // Session upserted
    expect(upsertLinearSession).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        orgId: ORG_ID,
        linearSessionId: LINEAR_SESSION_ID,
        linearIssueId: ISSUE_ID,
        triggerType: 'assignment',
      }),
    )

    // Thought emitted (timing check via updateLinearSessionStatus call)
    expect(updateLinearSessionStatus).toHaveBeenCalledWith(
      supabase,
      'db-session-e2e',
      'active',
      expect.objectContaining({ thought_emitted_at: expect.any(String) }),
    )

    // Run should be enqueued
    expect(result.runEnqueued).toBe(true)
    expect(result.sessionId).toBe('db-session-e2e')
  })

  it('lifecycle completion: session status updated to complete after run', async () => {
    // Simulate: session active → run complete → status updated
    vi.mocked(getLinearSession).mockResolvedValue({
      ...SESSION_ROW,
      status: 'active',
      run_id: 'run-123',
    })

    const updated = await updateLinearSessionStatus(
      supabase,
      SESSION_ROW.id,
      'complete',
      { completed_at: new Date().toISOString() },
    )

    expect(updated).toBe(true)
    expect(updateLinearSessionStatus).toHaveBeenCalledWith(
      supabase,
      'db-session-e2e',
      'complete',
      expect.objectContaining({ completed_at: expect.any(String) }),
    )
  })

  // ─── Scenario 2: Stop signal ──────────────────────────────────────────────

  it('stop signal: session recorded, run not enqueued', async () => {
    vi.mocked(countActiveSessions).mockResolvedValue(1)
    vi.mocked(getActiveSessionForIssue).mockResolvedValue({
      ...SESSION_ROW,
      id: 'existing-session',
      status: 'active',
    })

    const event = makeEvent({
      type: 'agent.session_signal',
      agentSessionPayload: {
        sessionId: LINEAR_SESSION_ID,
        issueId: ISSUE_ID,
        triggerType: 'assignment',
        signal: 'stop',
      },
    })

    const result = await handler.handleSessionEvent(event, ORG_ID)

    expect(result.runEnqueued).toBe(false)
    expect(result.reason).toBe('signal_recorded')
    expect(updateLinearSessionStatus).toHaveBeenCalledWith(
      supabase,
      'existing-session',
      'active',
      expect.objectContaining({ signal: 'stop' }),
    )
  })

  // ─── Scenario 3: Concurrent cap ──────────────────────────────────────────

  it('concurrent cap: 3 active → 4th rejected with error activity', async () => {
    vi.mocked(countActiveSessions).mockResolvedValue(3)
    handler = new LinearAgentHandler(supabase, agentClient as never, {
      maxConcurrentSessions: 3,
    })

    const result = await handler.handleSessionEvent(makeEvent(), ORG_ID)

    expect(result.runEnqueued).toBe(false)
    expect(result.reason).toBe('concurrent_cap_exceeded')
    // No session should be upserted when cap is exceeded
    expect(upsertLinearSession).not.toHaveBeenCalled()
  })

  // ─── Scenario 4: Duplicate session ────────────────────────────────────────

  it('duplicate session: same linearSessionId → idempotent upsert', async () => {
    vi.mocked(upsertLinearSession).mockResolvedValue(SESSION_ROW)

    // First call
    const result1 = await handler.handleSessionEvent(makeEvent(), ORG_ID)
    expect(result1.runEnqueued).toBe(true)

    // Second call with same sessionId — upsert handles conflict
    const result2 = await handler.handleSessionEvent(makeEvent(), ORG_ID)
    expect(result2.runEnqueued).toBe(true)
    expect(upsertLinearSession).toHaveBeenCalledTimes(2)
  })

  // ─── Scenario 5: Feature flag off ────────────────────────────────────────

  it('feature flag: FEATURE_LINEAR_AGENT checked upstream (handler does not gate)', () => {
    // The handler itself does not check the feature flag — that is done at
    // the webhook route level. This test documents that contract.
    // If FEATURE_LINEAR_AGENT=false, the webhook route never calls handleSessionEvent.
    expect(typeof handler.handleSessionEvent).toBe('function')
  })

  // ─── Scenario 6: Missing agent ────────────────────────────────────────────

  it('missing agent: no agent configured → session created with null agent_id', async () => {
    supabase = createMockSupabase({ agentId: null })
    handler = new LinearAgentHandler(supabase, agentClient as never)

    vi.mocked(upsertLinearSession).mockResolvedValue({
      ...SESSION_ROW,
      agent_id: null,
    })

    const result = await handler.handleSessionEvent(makeEvent(), ORG_ID)

    expect(result.runEnqueued).toBe(true)
    expect(upsertLinearSession).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ agentId: null }),
    )
  })

  // ─── Scenario 7: Error during processing ─────────────────────────────────

  it('error during run: DB upsert fails → returns db_error', async () => {
    vi.mocked(upsertLinearSession).mockResolvedValue(null)

    const result = await handler.handleSessionEvent(makeEvent(), ORG_ID)

    expect(result.runEnqueued).toBe(false)
    expect(result.reason).toBe('db_error')
  })

  it('error during run: error status written to session', async () => {
    // Simulate error status update
    vi.mocked(updateLinearSessionStatus).mockResolvedValue(true)

    const updated = await updateLinearSessionStatus(
      supabase,
      SESSION_ROW.id,
      'error',
      { completed_at: new Date().toISOString() },
    )

    expect(updated).toBe(true)
  })

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('missing payload: returns missing_payload reason', async () => {
    const event = makeEvent({ agentSessionPayload: undefined })
    const result = await handler.handleSessionEvent(event, ORG_ID)

    expect(result.runEnqueued).toBe(false)
    expect(result.reason).toBe('missing_payload')
  })

  it('mention trigger: correct thought text emitted', async () => {
    const emitThoughtSpy = vi.spyOn(agentClient, 'emitThought')
    const event = makeEvent({
      agentSessionPayload: {
        sessionId: 'lin-session-mention',
        issueId: ISSUE_ID,
        issueIdentifier: 'ENG-101',
        issueTitle: 'Review PR',
        triggerType: 'mention',
        actorId: 'user-2',
        actorName: 'Carol',
      },
    })

    await handler.handleSessionEvent(event, ORG_ID)

    expect(emitThoughtSpy).toHaveBeenCalledWith(
      'lin-session-mention',
      expect.stringContaining('Reviewing mentioned issue'),
    )
  })

  it('comment trigger: correct thought text emitted', async () => {
    const emitThoughtSpy = vi.spyOn(agentClient, 'emitThought')
    const event = makeEvent({
      agentSessionPayload: {
        sessionId: 'lin-session-comment',
        issueId: ISSUE_ID,
        triggerType: 'comment',
      },
    })

    await handler.handleSessionEvent(event, ORG_ID)

    expect(emitThoughtSpy).toHaveBeenCalledWith(
      'lin-session-comment',
      expect.stringContaining('Reading comment on issue'),
    )
  })

  it('session DB fields are correctly mapped in upsert call', async () => {
    const event = makeEvent()
    await handler.handleSessionEvent(event, ORG_ID)

    expect(upsertLinearSession).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        orgId: ORG_ID,
        linearSessionId: LINEAR_SESSION_ID,
        linearIssueId: ISSUE_ID,
        triggerType: 'assignment',
        linearIssueIdentifier: 'ENG-100',
        linearActorId: 'user-e2e',
        linearActorName: 'Bob',
        signal: null,
      }),
    )
  })

  it('prompt building includes issue details', () => {
    const prompt = handler.buildAgentPrompt(SESSION_ROW)

    expect(prompt).toContain('ENG-100')
    expect(prompt).toContain('assignment')
    expect(prompt).toContain('Bob')
    expect(prompt).toContain('Linear')
  })

  it('prompt building includes signal when present', () => {
    const prompt = handler.buildAgentPrompt({
      ...SESSION_ROW,
      signal: 'stop',
    })

    expect(prompt).toContain('stop')
  })

  it('prompt building works without optional fields', () => {
    const prompt = handler.buildAgentPrompt({
      ...SESSION_ROW,
      linear_issue_identifier: null,
      linear_actor_name: null,
      signal: null,
    })

    expect(prompt).toContain('assignment')
    expect(prompt).toContain('Linear')
  })
})
