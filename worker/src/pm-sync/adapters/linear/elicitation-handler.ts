/**
 * Linear Agent Elicitation Handler — Phase 3 of Linear Agents API Integration.
 *
 * Posts an elicitation activity on a Linear session, transitions session
 * status to 'awaiting_input', and polls for a human response. The webhook
 * handler stores the user's reply in the session row's `signal` column —
 * the poller checks for non-null, non-'stop' values.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 3
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinearAgentClient } from './agent-client.js'
import { updateLinearSessionStatus } from './agent-session-db.js'
import { redact } from '../../../utils/pii-redactor.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ElicitationOptions {
  /** Maximum time to wait for a response (default 300000ms = 5 minutes). */
  timeoutMs?: number
  /** Poll interval for checking response (default 5000ms). */
  pollIntervalMs?: number
  /** Abort signal to cancel the elicitation externally (e.g., from Mission Control). */
  abortSignal?: AbortSignal
}

export interface ElicitationResult {
  responded: boolean
  response?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Request clarification from a human via Linear's elicitation activity.
 *
 * Flow:
 *   1. Emit elicitation activity on the Linear session
 *   2. Update session DB status to 'awaiting_input'
 *   3. Poll the `signal` column for a response (set by webhook handler
 *      when it receives a `prompted` event)
 *   4. On response: update status to 'active', return { responded: true, response }
 *   5. On timeout: update status to 'active', return { responded: false }
 *
 * The webhook handler stores the user's reply in the `signal` column.
 * Non-null, non-'stop' signal values are treated as the response text.
 */
export async function requestLinearClarification(
  agentClient: LinearAgentClient,
  linearSessionId: string,
  prompt: string,
  supabase: SupabaseClient,
  sessionDbId: string,
  options?: ElicitationOptions,
): Promise<ElicitationResult> {
  const timeoutMs = options?.timeoutMs ?? 300_000
  const pollIntervalMs = options?.pollIntervalMs ?? 5_000

  // Step 1: Emit elicitation activity
  try {
    await agentClient.emitElicitation(linearSessionId, prompt)
  } catch (err) {
    // If the elicitation can't be shown to the user, don't block for 5 min
    // waiting for a response that will never come.
    console.warn(
      `[elicitation-handler] Failed to emit elicitation for session ${redact(linearSessionId)}, aborting:`,
      redact((err as Error).message),
    )
    return { responded: false }
  }

  // Step 2: Update session status to awaiting_input
  await updateLinearSessionStatus(supabase, sessionDbId, 'awaiting_input')

  // Step 3: Clear any stale signal before polling
  await supabase
    .from('linear_agent_sessions')
    .update({ signal: null, updated_at: new Date().toISOString() })
    .eq('id', sessionDbId)

  // Step 4: Poll for response
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    // Check abort signal before sleeping
    if (options?.abortSignal?.aborted) {
      await updateLinearSessionStatus(supabase, sessionDbId, 'active', { signal: null })
      return { responded: false }
    }
    await sleep(pollIntervalMs)

    const { data, error } = await supabase
      .from('linear_agent_sessions')
      .select('signal')
      .eq('id', sessionDbId)
      .single()

    if (error) {
      console.warn(
        `[elicitation-handler] Poll error for session ${redact(sessionDbId)}:`,
        redact(error.message),
      )
      continue
    }

    const signal = data?.signal
    if (signal && signal !== 'stop') {
      // Response found — restore session to active
      await updateLinearSessionStatus(supabase, sessionDbId, 'active', {
        signal: null,
      })
      return { responded: true, response: signal }
    }

    // 'stop' signal means the session was cancelled, treat as no response
    if (signal === 'stop') {
      await updateLinearSessionStatus(supabase, sessionDbId, 'active', {
        signal: null,
      })
      return { responded: false }
    }
  }

  // Step 5: Timeout — restore session to active
  console.info(
    `[elicitation-handler] Timeout waiting for response on session ${redact(sessionDbId)} after ${timeoutMs}ms`,
  )
  await updateLinearSessionStatus(supabase, sessionDbId, 'active')
  return { responded: false }
}
