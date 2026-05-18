/**
 * schedule_task / list_scheduled_tasks / cancel_scheduled_task
 *
 * Agent-facing tools for scheduling future runs.
 * Stores tasks in agent_scheduled_tasks table (Supabase outbox pattern).
 * Worker polling loop claims and executes them via runOpenClawAgent.
 *
 * Aligned with OpenClaw CronService semantics:
 * - Supports cron expressions and one-shot run_at schedules
 * - Idempotency via unique key per assistant
 * - Retry with exponential backoff + dead-letter after max retries
 */

import crypto from 'node:crypto'
import { Cron } from 'croner'
import type { SupabaseClient } from '@supabase/supabase-js'

/** UUID v4 pattern — used to guard the conversation_id FK (must be valid UUID or null) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Max scheduled tasks an agent can create per run (prevents runaway task storms) */
const MAX_TASKS_PER_RUN = 10

/** Per-run task creation counter (keyed by parentRunId or assistantId) */
const runTaskCounts = new Map<string, { count: number; createdAt: number }>()
const RUN_TASK_COUNT_TTL_MS = 300_000 // 5 min cleanup

export interface ScheduleTaskParams {
  name: string
  task_prompt: string
  cron_expression?: string
  run_at?: string
  timezone?: string
  idempotency_key?: string
  /** Optional webhook URL to POST the task output to on completion */
  webhook_url?: string
}

export interface ListScheduledTasksParams {
  status?: string
  limit?: number
}

export interface CancelScheduledTaskParams {
  task_id: string
}

export interface SchedulerContext {
  supabase: SupabaseClient
  assistantId: string
  orgId: string
  conversationId?: string
  parentRunId?: string
  toolCallId?: string
  /** Originating channel ID — stored so scheduled task output can be delivered back */
  channelId?: string
}

export async function toolScheduleTask(
  params: ScheduleTaskParams,
  ctx: SchedulerContext,
): Promise<string> {
  if (!params.cron_expression && !params.run_at) {
    return JSON.stringify({ error: 'Must provide either cron_expression or run_at' })
  }

  // Per-run rate limit: prevent a single agent run from creating unbounded tasks
  const runKey = ctx.parentRunId || ctx.assistantId
  const now = Date.now()
  const runCount = runTaskCounts.get(runKey)
  if (runCount && runCount.count >= MAX_TASKS_PER_RUN) {
    return JSON.stringify({ error: `Task creation limit (${MAX_TASKS_PER_RUN}) reached for this run. Cannot create more scheduled tasks.` })
  }

  // Lazy cleanup of stale entries
  if (runTaskCounts.size > 100) {
    for (const [key, entry] of runTaskCounts) {
      if (now - entry.createdAt > RUN_TASK_COUNT_TTL_MS) runTaskCounts.delete(key)
    }
  }

  // Validate cron expression before storing — fail fast instead of silently at poll time
  if (params.cron_expression) {
    try {
      const job = new Cron(params.cron_expression, { timezone: params.timezone || 'UTC' })
      const next = job.nextRun()
      if (!next) {
        return JSON.stringify({ error: 'Cron expression is valid but will never fire (all dates in the past or unreachable).' })
      }
      job.stop()
    } catch (err) {
      return JSON.stringify({
        error: `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}. Use standard 5-field cron syntax (minute hour day month weekday).`,
      })
    }
  }

  // Validate webhook URL if provided (must be HTTPS for security)
  if (params.webhook_url) {
    try {
      const url = new URL(params.webhook_url)
      if (url.protocol !== 'https:') {
        return JSON.stringify({ error: 'webhook_url must use HTTPS' })
      }
    } catch {
      return JSON.stringify({ error: 'webhook_url must be a valid URL' })
    }
  }

  let nextRunAt: string
  if (params.run_at) {
    const runAtDate = new Date(params.run_at)
    if (isNaN(runAtDate.getTime())) {
      return JSON.stringify({ error: 'Invalid run_at date format. Use ISO 8601.' })
    }
    if (runAtDate.getTime() < Date.now()) {
      return JSON.stringify({ error: 'run_at must be in the future' })
    }
    nextRunAt = runAtDate.toISOString()
  } else {
    // For cron, set next_run_at to now so it gets picked up on first poll cycle
    nextRunAt = new Date().toISOString()
  }

  const taskId = crypto.randomUUID()

  const { error } = await ctx.supabase
    .from('agent_scheduled_tasks')
    .insert({
      id: taskId,
      assistant_id: ctx.assistantId,
      // conversation_id is a UUID FK — only pass if it's a valid UUID, else null
      conversation_id: ctx.conversationId && UUID_RE.test(ctx.conversationId) ? ctx.conversationId : null,
      org_id: ctx.orgId,
      name: params.name,
      task_prompt: params.task_prompt,
      cron_expression: params.cron_expression || null,
      run_at: params.run_at || null,
      timezone: params.timezone || 'UTC',
      next_run_at: nextRunAt,
      parent_run_id: ctx.parentRunId || null,
      origin_tool_call_id: ctx.toolCallId || null,
      idempotency_key: params.idempotency_key || null,
      channel_id: ctx.channelId || null,
      webhook_url: params.webhook_url || null,
      status: 'pending',
      task_kind: 'assistant_run',
      target_type: 'assistant',
      target_id: ctx.assistantId,
      trigger_kind: params.cron_expression ? 'cron' : 'one_shot',
      trigger_config: params.cron_expression
        ? { cron_expression: params.cron_expression }
        : { run_at: params.run_at },
      concurrency_policy: 'skip_if_running',
      catch_up_policy: 'latest_only',
      catch_up_limit: 1,
      runtime_selector: { nativeScheduler: 'disabled' },
      capability_requirements: [{ id: 'assistant.run', required: true }],
      source_kind: 'agent_tool',
    })

  if (error) {
    if (error.code === '23505') {
      return JSON.stringify({ error: 'A task with this idempotency_key already exists for this assistant.' })
    }
    return JSON.stringify({ error: `Failed to schedule task: ${error.message}` })
  }

  // Track successful creation for rate limiting
  const existing = runTaskCounts.get(runKey)
  if (existing) {
    existing.count++
  } else {
    runTaskCounts.set(runKey, { count: 1, createdAt: Date.now() })
  }

  return JSON.stringify({
    success: true,
    task_id: taskId,
    name: params.name,
    next_run_at: nextRunAt,
    type: params.cron_expression ? 'recurring' : 'one-shot',
  })
}

export async function toolListScheduledTasks(
  params: ListScheduledTasksParams,
  ctx: SchedulerContext,
): Promise<string> {
  let query = ctx.supabase
    .from('agent_scheduled_tasks')
    .select('id, name, description, task_prompt, cron_expression, status, next_run_at, last_run_at, run_count, retry_count, enabled, created_at')
    .eq('assistant_id', ctx.assistantId)
    .order('next_run_at', { ascending: true })
    .limit(params.limit ?? 20)

  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data, error } = await query

  if (error) {
    return JSON.stringify({ error: `Failed to list tasks: ${error.message}` })
  }

  return JSON.stringify({ tasks: data || [], count: data?.length ?? 0 })
}

export async function toolCancelScheduledTask(
  params: CancelScheduledTaskParams,
  ctx: SchedulerContext,
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from('agent_scheduled_tasks')
    .update({ status: 'cancelled', enabled: false, updated_at: new Date().toISOString() })
    .eq('id', params.task_id)
    .eq('assistant_id', ctx.assistantId)
    .select('id, name, status')
    .single()

  if (error) {
    return JSON.stringify({ error: `Failed to cancel task: ${error.message}` })
  }
  if (!data) {
    return JSON.stringify({ error: 'Task not found or does not belong to this assistant' })
  }

  return JSON.stringify({ success: true, task: data })
}
