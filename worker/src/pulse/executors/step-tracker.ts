/**
 * Pulse Step Tracker — Best-Effort CRUD for orchestration_steps
 *
 * All operations are best-effort: errors are logged, not thrown.
 * Same pattern as agent-runs.ts — step tracking is observability,
 * not control flow. A failed step insert must never block job processing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { DagStepCreator, type DagStepType } from '../dag/dag-step-creator.js'

export interface CreateStepParams {
  runId: string
  eventId: string
  attempt: number
  stepType: string
  executorType: string
  agentId: string
  orgId: string
  webhookUrl?: string
  timeoutAt?: string
  input?: Record<string, unknown>
}

/**
 * Create a step record. Returns the step ID or null on failure.
 *
 * Delegates to `DagStepCreator` (Phase 4N-0, Task 11). Preserves the
 * historical never-throw contract by catching any error from the creator
 * and logging it — step tracking is observability, not control flow, so
 * a failed insert must not block job processing.
 */
export async function createStep(
  supabase: SupabaseClient,
  params: CreateStepParams,
): Promise<string | null> {
  try {
    const creator = new DagStepCreator(supabase)
    const result = await creator.create({
      runId: params.runId,
      eventId: params.eventId,
      attempt: params.attempt,
      stepType: params.stepType as DagStepType,
      executorType: params.executorType,
      agentId: params.agentId,
      orgId: params.orgId,
      initialStatus: 'running',
      webhookUrl: params.webhookUrl,
      timeoutAt: params.timeoutAt,
      input: params.input,
    })
    return result.stepId
  } catch (err) {
    console.error(
      '[pulse:step-tracker] Failed to create step:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Update step status and optional output/error fields.
 */
export async function updateStepStatus(
  supabase: SupabaseClient,
  stepId: string,
  updates: {
    status: string
    output?: string
    errorMessage?: string
    durationMs?: number
    callbackStatus?: string
    completedAt?: string
    approvalId?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  try {
    const row: Record<string, unknown> = { status: updates.status }
    // Phase 4N-0: anchor claim time for orphan detector partial index.
    if (updates.status === 'claimed') row.started_at = new Date().toISOString()
    if (updates.output !== undefined) row.output = updates.output
    if (updates.errorMessage !== undefined) row.error_message = updates.errorMessage
    if (updates.durationMs !== undefined) row.duration_ms = updates.durationMs
    if (updates.callbackStatus !== undefined) row.callback_status = updates.callbackStatus
    if (updates.completedAt !== undefined) row.completed_at = updates.completedAt
    if (updates.approvalId !== undefined) row.approval_id = updates.approvalId
    if (updates.metadata !== undefined) row.metadata = updates.metadata

    const { error } = await supabase
      .from('orchestration_steps')
      .update(row)
      .eq('id', stepId)

    if (error) {
      console.error('[pulse:step-tracker] Failed to update step:', error.message)
    }
  } catch (err) {
    console.error('[pulse:step-tracker] Failed to update step:', err instanceof Error ? err.message : err)
  }
}

/**
 * Load a step by ID for callback verification.
 * Returns the step row or null.
 */
export async function getStepById(
  supabase: SupabaseClient,
  stepId: string,
): Promise<{
  id: string
  run_id: string
  event_id: string
  status: string
  callback_status: string | null
  output: string | null
  error_message: string | null
} | null> {
  try {
    const { data, error } = await supabase
      .from('orchestration_steps')
      .select('id, run_id, event_id, status, callback_status, output, error_message')
      .eq('id', stepId)
      .single()

    if (error || !data) return null
    return data
  } catch {
    return null
  }
}
