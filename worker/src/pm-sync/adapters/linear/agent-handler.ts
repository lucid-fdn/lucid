/**
 * Linear Agent Handler — Session Event Processing.
 *
 * Processes `agent.session_created` and `agent.session_prompted` webhook
 * events. Responsibilities:
 *   1. Enforce per-org concurrent session cap (AD8)
 *   2. Upsert the session in the DB
 *   3. Emit an immediate thought ("Analyzing issue...") within 10s (AD4)
 *   4. Resolve which agent should handle the issue
 *   5. Return session ID + whether to enqueue an agent run
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PmWebhookEvent } from '../../types.js'
import { LinearAgentClient } from './agent-client.js'
import {
  upsertLinearSession,
  countActiveSessions,
  getActiveSessionForIssue,
  updateLinearSessionStatus,
  type LinearAgentSessionRow,
} from './agent-session-db.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinearAgentHandlerConfig {
  maxConcurrentSessions?: number
}

export interface HandleSessionResult {
  sessionId: string
  runEnqueued: boolean
  reason?: string
}

// ─── Handler ────────────────────────────────────────────────────────────────

export class LinearAgentHandler {
  private readonly supabase: SupabaseClient
  private readonly agentClient: LinearAgentClient
  private readonly maxConcurrentSessions: number

  constructor(
    supabase: SupabaseClient,
    agentClient: LinearAgentClient,
    config: LinearAgentHandlerConfig = {},
  ) {
    this.supabase = supabase
    this.agentClient = agentClient
    this.maxConcurrentSessions = config.maxConcurrentSessions ?? 3
  }

  /**
   * Process an agent session webhook event.
   *
   * Returns the session ID and whether an agent run should be enqueued.
   * The caller is responsible for the actual Pulse enqueue.
   */
  async handleSessionEvent(
    event: PmWebhookEvent,
    orgId: string,
  ): Promise<HandleSessionResult> {
    const payload = event.agentSessionPayload
    if (!payload) {
      return { sessionId: '', runEnqueued: false, reason: 'missing_payload' }
    }

    // 1. Check concurrent session cap
    const activeCount = await countActiveSessions(this.supabase, orgId)
    if (activeCount >= this.maxConcurrentSessions) {
      console.warn(
        `[LinearAgentHandler] Org ${orgId} has ${activeCount} active sessions, cap is ${this.maxConcurrentSessions}. Rejecting.`,
      )
      // Still emit an error activity so the human knows why the agent didn't respond
      await this.agentClient.emitError(
        payload.sessionId,
        `Session limit reached (${this.maxConcurrentSessions} concurrent sessions). Please wait for active sessions to complete.`,
      )
      await this.agentClient.updateSessionStatus(payload.sessionId, 'failed')
      return {
        sessionId: payload.sessionId,
        runEnqueued: false,
        reason: 'concurrent_cap_exceeded',
      }
    }

    // 2. Check if there's already an active session for this issue
    const existingSession = await getActiveSessionForIssue(
      this.supabase,
      orgId,
      payload.issueId,
    )

    // 3. Handle signal events
    if (event.type === 'agent.session_signal' && payload.signal) {
      if (existingSession) {
        await updateLinearSessionStatus(
          this.supabase,
          existingSession.id,
          'active',
          { signal: payload.signal },
        )
      }
      return {
        sessionId: payload.sessionId,
        runEnqueued: false,
        reason: 'signal_recorded',
      }
    }

    // 4. Resolve agent for this issue
    const agentId = await this.resolveAgentForIssue(orgId, payload.issueId)

    // 5. Upsert session in DB
    const session = await upsertLinearSession(this.supabase, {
      orgId,
      linearSessionId: payload.sessionId,
      linearIssueId: payload.issueId,
      triggerType: payload.triggerType,
      agentId,
      linearIssueIdentifier: payload.issueIdentifier ?? null,
      linearActorId: payload.actorId ?? null,
      linearActorName: payload.actorName ?? null,
      signal: payload.signal ?? null,
    })

    if (!session) {
      return { sessionId: payload.sessionId, runEnqueued: false, reason: 'db_error' }
    }

    // 6. Emit immediate thought (must happen within 10s of webhook — AD4)
    const thoughtText = this.buildInitialThought(payload.triggerType, payload.issueTitle)
    await this.agentClient.emitThought(payload.sessionId, thoughtText)

    // Mark thought as emitted
    await updateLinearSessionStatus(
      this.supabase,
      session.id,
      'active',
      { thought_emitted_at: new Date().toISOString() },
    )

    // 7. Update session status to running
    await this.agentClient.updateSessionStatus(payload.sessionId, 'running')

    return {
      sessionId: session.id,
      runEnqueued: true,
    }
  }

  /**
   * Resolve which Lucid agent should handle this Linear issue.
   *
   * Phase 1: Returns the first active agent in the org. Future phases
   * will use Linear team → agent mappings from org_pm_config.
   */
  private async resolveAgentForIssue(
    orgId: string,
    _linearIssueId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('ai_assistants')
      .select('id')
      .eq('org_id', orgId)
      .eq('mc_status', 'active')
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return data.id as string
  }

  /**
   * Build the initial thought text for the agent's first activity.
   */
  private buildInitialThought(
    triggerType: string,
    issueTitle?: string,
  ): string {
    const context = issueTitle ? ` "${issueTitle}"` : ''
    switch (triggerType) {
      case 'assignment':
        return `Analyzing assigned issue${context}...`
      case 'mention':
        return `Reviewing mentioned issue${context}...`
      case 'comment':
        return `Reading comment on issue${context}...`
      default:
        return `Analyzing issue${context}...`
    }
  }

  /**
   * Build the agent prompt from session data.
   * Used by Phase 2 when the agent run processor loads the session.
   */
  buildAgentPrompt(session: LinearAgentSessionRow): string {
    const parts: string[] = []

    parts.push(`## Linear Issue`)
    if (session.linear_issue_identifier) {
      parts.push(`**Issue**: ${session.linear_issue_identifier}`)
    }
    parts.push(`**Trigger**: ${session.trigger_type}`)

    if (session.linear_actor_name) {
      parts.push(`**Requested by**: ${session.linear_actor_name}`)
    }

    if (session.signal) {
      parts.push(`\n**Signal**: ${session.signal}`)
    }

    parts.push(
      `\nYou are responding to a Linear issue via the Agents API. ` +
      `Your activities (thoughts, actions, responses) are visible to the team on Linear. ` +
      `Provide a clear, actionable response.`,
    )

    return parts.join('\n')
  }
}
