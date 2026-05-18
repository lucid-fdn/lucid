import type { SupabaseClient } from '@supabase/supabase-js'

export type RoutineRunStatus = 'queued' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled' | 'skipped'

export interface RoutineReceiptTask {
  id: string
  org_id: string
  assistant_id: string | null
  team_id?: string | null
  project_id?: string | null
  target_type?: string | null
  target_id?: string | null
  task_kind?: string | null
  next_run_at?: string | null
}

export async function startRoutineRunReceipt(
  supabase: SupabaseClient,
  task: RoutineReceiptTask,
  runId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('agent_scheduled_task_runs')
      .insert({
        task_id: task.id,
        org_id: task.org_id,
        assistant_id: task.assistant_id,
        team_id: task.team_id ?? null,
        project_id: task.project_id ?? null,
        scheduled_for: task.next_run_at ?? null,
        started_at: new Date().toISOString(),
        status: 'running',
        run_id: runId,
        target_type: task.target_type ?? 'assistant',
        target_id: task.target_id ?? task.assistant_id,
        task_kind: task.task_kind ?? 'assistant_run',
      })
      .select('id')
      .maybeSingle()

    if (error) {
      if (isRoutineRunSchemaUnavailable(error)) return null
      console.warn(`[routine] Failed to start run receipt for ${task.id}: ${error.message}`)
      return null
    }
    return (data as { id?: string } | null)?.id ?? null
  } catch (error) {
    console.warn(`[routine] Failed to start run receipt for ${task.id}:`, error instanceof Error ? error.message : error)
    return null
  }
}

export async function finishRoutineRunReceipt(
  supabase: SupabaseClient,
  receiptId: string | null,
  taskId: string,
  status: RoutineRunStatus,
  details: {
    outputSummary?: string | null
    errorMessage?: string | null
    crewRunId?: string | null
    agentOpsRunId?: string | null
    browserRunId?: string | null
    engineHomeRefs?: Record<string, unknown>
    workGraphRefs?: Record<string, unknown>
    knowledgeRefs?: Record<string, unknown>
    trustgateRefs?: Record<string, unknown>
    dispatchSummary?: Record<string, unknown>
    sanitizedEvidence?: Record<string, unknown>
  } = {},
): Promise<void> {
  const now = new Date().toISOString()
  try {
    if (receiptId) {
      const { error } = await supabase
        .from('agent_scheduled_task_runs')
        .update({
          status,
          completed_at: now,
          output_summary: details.outputSummary ?? null,
          error_message: details.errorMessage ?? null,
          crew_run_id: details.crewRunId ?? null,
          agent_ops_run_id: details.agentOpsRunId ?? null,
          browser_run_id: details.browserRunId ?? null,
          engine_home_refs: details.engineHomeRefs ?? {},
          work_graph_refs: details.workGraphRefs ?? {},
          knowledge_refs: details.knowledgeRefs ?? {},
          trustgate_refs: details.trustgateRefs ?? {},
          dispatch_summary: details.dispatchSummary ?? {},
          sanitized_evidence: details.sanitizedEvidence ?? {},
        })
        .eq('id', receiptId)
      if (error && !isRoutineRunSchemaUnavailable(error)) {
        console.warn(`[routine] Failed to finish run receipt ${receiptId}: ${error.message}`)
      }
    }

    await supabase
      .from('agent_scheduled_tasks')
      .update({ last_run_status: status })
      .eq('id', taskId)
  } catch (error) {
    console.warn(`[routine] Failed to finish run receipt for ${taskId}:`, error instanceof Error ? error.message : error)
  }
}

function isRoutineRunSchemaUnavailable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
    || error.code === '42703'
    || /schema cache|agent_scheduled_task_runs|last_run_status|could not find/i.test(error.message ?? '')
}
