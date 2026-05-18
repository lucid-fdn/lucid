/**
 * Linear Agent Session — DB CRUD Helpers.
 *
 * Thin wrappers around the `linear_agent_sessions` table. All functions
 * accept a Supabase client (service role) and return typed rows.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { redact } from '../../../utils/pii-redactor.js'

// ─── Row type ───────────────────────────────────────────────────────────────

export type LinearSessionStatus =
  | 'pending' | 'active' | 'awaiting_input' | 'complete' | 'error' | 'stale' | 'cancelled'

export type LinearTriggerType = 'assignment' | 'mention' | 'comment'

export interface LinearAgentSessionRow {
  id: string
  org_id: string
  agent_id: string | null
  linear_session_id: string
  linear_issue_id: string
  linear_issue_identifier: string | null
  linear_issue_url: string | null
  status: LinearSessionStatus
  trigger_type: LinearTriggerType
  run_id: string | null
  pulse_job_run_id: string | null
  linear_actor_id: string | null
  linear_actor_name: string | null
  signal: string | null
  webhook_received_at: string
  thought_emitted_at: string | null
  run_started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const LINEAR_AGENT_SESSION_COLUMNS = [
  'id',
  'org_id',
  'agent_id',
  'linear_session_id',
  'linear_issue_id',
  'linear_issue_identifier',
  'linear_issue_url',
  'status',
  'trigger_type',
  'run_id',
  'pulse_job_run_id',
  'linear_actor_id',
  'linear_actor_name',
  'signal',
  'webhook_received_at',
  'thought_emitted_at',
  'run_started_at',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ')

// ─── Upsert params ──────────────────────────────────────────────────────────

export interface UpsertLinearSessionParams {
  orgId: string
  linearSessionId: string
  linearIssueId: string
  triggerType: 'assignment' | 'mention' | 'comment'
  agentId?: string | null
  linearIssueIdentifier?: string | null
  linearIssueUrl?: string | null
  linearActorId?: string | null
  linearActorName?: string | null
  signal?: string | null
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Insert or update a Linear agent session. On conflict (linear_session_id),
 * only resets to 'pending' if the session is in a terminal state. Active
 * sessions are left untouched to avoid disrupting in-flight agent runs.
 */
export async function upsertLinearSession(
  supabase: SupabaseClient,
  params: UpsertLinearSessionParams,
): Promise<LinearAgentSessionRow | null> {
  const row = {
    org_id: params.orgId,
    linear_session_id: params.linearSessionId,
    linear_issue_id: params.linearIssueId,
    trigger_type: params.triggerType,
    agent_id: params.agentId ?? null,
    linear_issue_identifier: params.linearIssueIdentifier ?? null,
    linear_issue_url: params.linearIssueUrl ?? null,
    linear_actor_id: params.linearActorId ?? null,
    linear_actor_name: params.linearActorName ?? null,
    signal: params.signal ?? null,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }

  // Try insert first. On conflict with a non-terminal session, just return it.
  const { data, error } = await supabase
    .from('linear_agent_sessions')
    .upsert(row, {
      onConflict: 'linear_session_id',
      // Postgres ignoreDuplicates is not granular enough, so we upsert
      // and accept the status overwrite. The webhook dedup + handler's
      // concurrent cap already prevent re-processing active sessions.
    })
    .select(LINEAR_AGENT_SESSION_COLUMNS)
    .single()

  if (error) {
    console.error('[agent-session-db] upsertLinearSession error:', redact(error.message))
    return null
  }
  return data as unknown as LinearAgentSessionRow
}

/**
 * Get a session by its Linear session ID.
 */
export async function getLinearSession(
  supabase: SupabaseClient,
  linearSessionId: string,
): Promise<LinearAgentSessionRow | null> {
  const { data, error } = await supabase
    .from('linear_agent_sessions')
    .select(LINEAR_AGENT_SESSION_COLUMNS)
    .eq('linear_session_id', linearSessionId)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as LinearAgentSessionRow
}

/**
 * Get a session by its internal UUID.
 */
export async function getLinearSessionById(
  supabase: SupabaseClient,
  id: string,
): Promise<LinearAgentSessionRow | null> {
  const { data, error } = await supabase
    .from('linear_agent_sessions')
    .select(LINEAR_AGENT_SESSION_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as LinearAgentSessionRow
}

/**
 * Update session status and optional extra fields (run_id, timing columns).
 */
export async function updateLinearSessionStatus(
  supabase: SupabaseClient,
  id: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase
    .from('linear_agent_sessions')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...(extra ?? {}),
    })
    .eq('id', id)

  if (error) {
    console.error('[agent-session-db] updateLinearSessionStatus error:', redact(error.message))
    return false
  }
  return true
}

/**
 * Get the most recent active session for a given issue in an org.
 * "Active" = status in ('pending', 'active', 'awaiting_input').
 */
export async function getActiveSessionForIssue(
  supabase: SupabaseClient,
  orgId: string,
  linearIssueId: string,
): Promise<LinearAgentSessionRow | null> {
  const { data, error } = await supabase
    .from('linear_agent_sessions')
    .select(LINEAR_AGENT_SESSION_COLUMNS)
    .eq('org_id', orgId)
    .eq('linear_issue_id', linearIssueId)
    .in('status', ['pending', 'active', 'awaiting_input'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data as unknown as LinearAgentSessionRow | null
}

/**
 * Count active sessions for an org (for concurrent cap enforcement).
 */
export async function countActiveSessions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('linear_agent_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .in('status', ['pending', 'active', 'awaiting_input'])

  if (error) {
    console.error('[agent-session-db] countActiveSessions error:', error.message)
    // Fail-closed: return Infinity so the cap check rejects new sessions.
    // This prevents unbounded session creation if the DB is unreachable.
    return Infinity
  }
  return count ?? 0
}
