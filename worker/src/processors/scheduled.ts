/**
 * Scheduled Task Processor — Extracted from index.ts
 *
 * Processes claimed scheduled tasks: loads assistant, runs agent loop,
 * delivers output to channel/webhook, manages cron scheduling.
 *
 * Used by both the old polling path (index.ts) and Pulse (ScheduledWorker).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'
import { incSchedulerSucceeded, incSchedulerFailed, incSchedulerDeadLettered } from '../observability/metrics.js'
import { executeRoutineDomainAdapter } from '../routines/domain-adapters.js'
import { finishRoutineRunReceipt, startRoutineRunReceipt } from '../routines/receipts.js'
import { buildRoutineExecutionContext } from '../routines/target-context.js'
import { runTeamRoutine } from '../routines/team-runner.js'

export interface ScheduledTask {
  id: string
  assistant_id: string
  org_id: string
  task_prompt: string
  cron_expression: string | null
  timezone: string
  max_retries: number
  retry_count: number
  run_count: number
  channel_id: string | null
  conversation_id: string | null
  name: string | null
  webhook_url: string | null
  task_kind?: string | null
  target_type?: string | null
  target_id?: string | null
  team_id?: string | null
  project_id?: string | null
  work_item_id?: string | null
  trigger_kind?: string | null
  trigger_config?: Record<string, unknown> | null
  context_policy?: Record<string, unknown> | null
  knowledge_scope?: Record<string, unknown> | null
  trustgate_policy?: Record<string, unknown> | null
  dispatch_policy?: Record<string, unknown> | null
  managed_resource_id?: string | null
  next_run_at?: string | null
}

export async function processScheduledTask(
  task: ScheduledTask,
  supabase: SupabaseClient,
  config: Config,
): Promise<void> {
  const { defaultWorkerRunExecutor } = await import('../core/runtime/worker-run-executor.js')
  const crypto = await import('node:crypto')
  const runId = crypto.randomUUID()
  let routineReceiptId: string | null = null

  const { withSpan } = await import('../observability/tracing.js')
  return withSpan('scheduler.task_execute', {
    'lucid.scheduler.task_id': task.id,
    'lucid.scheduler.task_name': task.name || '',
    'lucid.scheduler.cron_expression': task.cron_expression || '',
    'lucid.scheduler.run_count': task.run_count,
  }, async (span) => {

  // Mark as running
  await supabase.from('agent_scheduled_tasks').update({
    status: 'running',
    last_run_id: runId,
  }).eq('id', task.id)

  routineReceiptId = await startRoutineRunReceipt(supabase, task, runId)

  if (task.task_kind === 'team_run' || task.target_type === 'team') {
    try {
      const teamRun = await runTeamRoutine({
        id: task.id,
        org_id: task.org_id,
        assistant_id: task.assistant_id,
        team_id: task.team_id ?? null,
        target_id: task.target_id ?? null,
        name: task.name,
        task_prompt: task.task_prompt,
      }, supabase)

      const updates: Record<string, unknown> = {
        status: task.cron_expression ? 'pending' : 'completed',
        last_run_at: new Date().toISOString(),
        run_count: task.run_count + 1,
        retry_count: 0,
        claimed_by: null,
        claimed_at: null,
        last_run_output: `Team run started: ${teamRun.crewRunId}`,
      }
      if (task.cron_expression) {
        updates.next_run_at = await computeNextCronRun(task.cron_expression, task.timezone)
      }
      await supabase.from('agent_scheduled_tasks').update(updates).eq('id', task.id)
      await updateNextWakeAt(supabase, task.assistant_id)
      await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'succeeded', {
        outputSummary: `Team run started: ${teamRun.crewRunId}`,
        crewRunId: teamRun.crewRunId,
        dispatchSummary: {
          coordinator_assistant_id: teamRun.coordinatorAssistantId,
          mode: 'crew_run_start_event',
        },
      })
      incSchedulerSucceeded()
      span.setAttribute('lucid.scheduler.status', updates.status as string)
      console.log(`[scheduler] Team routine ${task.id} started crew run ${teamRun.crewRunId}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Team routine execution failed'
      incSchedulerFailed()
      span.setAttribute('lucid.scheduler.status', 'failed')
      await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'failed', { errorMessage: errorMsg })
      await markScheduledTaskFailed(task, errorMsg, supabase)
    }
    return
  }

  const domainRun = await executeRoutineDomainAdapter(task, supabase, config, routineReceiptId)
  if (domainRun.handled) {
    if (domainRun.status === 'succeeded' || domainRun.status === 'skipped') {
      const updates: Record<string, unknown> = {
        status: task.cron_expression ? 'pending' : 'completed',
        last_run_at: new Date().toISOString(),
        run_count: task.run_count + 1,
        retry_count: 0,
        claimed_by: null,
        claimed_at: null,
        last_run_output: domainRun.outputSummary,
      }
      if (task.cron_expression) {
        updates.next_run_at = await computeNextCronRun(task.cron_expression, task.timezone)
      }
      await supabase.from('agent_scheduled_tasks').update(updates).eq('id', task.id)
      await updateNextWakeAt(supabase, task.assistant_id)
      await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, domainRun.status, {
        outputSummary: domainRun.outputSummary,
        agentOpsRunId: domainRun.agentOpsRunId,
        browserRunId: domainRun.browserRunId,
        engineHomeRefs: domainRun.engineHomeRefs,
        workGraphRefs: domainRun.workGraphRefs,
        knowledgeRefs: domainRun.knowledgeRefs,
        trustgateRefs: domainRun.trustgateRefs,
        dispatchSummary: domainRun.dispatchSummary,
        sanitizedEvidence: domainRun.sanitizedEvidence,
      })
      incSchedulerSucceeded()
      span.setAttribute('lucid.scheduler.status', updates.status as string)
      console.log(`[scheduler] Domain routine ${task.id} completed via ${task.target_type}`)
    } else {
      const errorMsg = domainRun.errorMessage ?? 'Domain routine execution failed'
      incSchedulerFailed()
      span.setAttribute('lucid.scheduler.status', 'failed')
      await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'failed', {
        errorMessage: errorMsg,
        dispatchSummary: domainRun.dispatchSummary,
      })
      await markScheduledTaskFailed(task, errorMsg, supabase)
    }
    return
  }

  // Load assistant config
  const { data: assistant, error: loadErr } = await supabase
    .from('ai_assistants')
    .select('id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, passport_id, policy_config, wallet_enabled, approval_required_tools, agent_wallets(chain_type, privy_wallet_id, address, status)')
    .eq('id', task.assistant_id)
    .single()

  if (loadErr || !assistant) {
    console.error(`[scheduler] Could not load assistant ${task.assistant_id}:`, loadErr?.message)
    await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'failed', { errorMessage: 'Assistant not found' })
    await markScheduledTaskFailed(task, 'Assistant not found', supabase)
    return
  }

  try {
    const routineTarget = buildRoutineExecutionContext(task)
    const taskContext = [
      `\n\n## Scheduled Task Execution`,
      `You are executing a scheduled task autonomously — there is NO user in this conversation.`,
      `The message below is a TASK INSTRUCTION, not a user talking to you.`,
      `Your entire response will be delivered as the task output${task.channel_id ? ' to the originating channel' : ''}.`,
      ``,
      `Rules:`,
      `- Execute the instruction literally. If it says "say hi", your output should be "Hi" — do NOT respond as if someone said hi to you.`,
      `- Do NOT ask follow-up questions — there is no one to answer.`,
      `- Do NOT say "How can I help?" or similar — just produce the requested output.`,
      `- If the instruction asks you to use tools, use them and report the results.`,
      `- Keep your output concise and direct.`,
      ``,
      `Task: "${task.name || 'unnamed'}" | Run #${task.run_count + 1}${task.cron_expression ? ` | Schedule: ${task.cron_expression}` : ' | One-shot'}`,
      ``,
      `## Routine Target Contract`,
      routineTarget.systemSection,
    ].join('\n')

    const scheduledSystemPrompt = [assistant.system_prompt || '', taskContext].filter(Boolean).join('\n')

    const result = await defaultWorkerRunExecutor.execute({
      assistant: {
        ...assistant,
        engine: (assistant as { engine?: 'openclaw' | 'hermes' | null }).engine ?? 'openclaw',
        system_prompt: scheduledSystemPrompt,
        org_id: assistant.org_id || null,
        policy_config: (assistant.policy_config as Record<string, unknown>) || null,
        passport_id: assistant.passport_id ?? null,
        agent_wallets: assistant.agent_wallets || [],
      },
      conversationId: task.cron_expression
        ? `scheduled-${task.id}`
        : `scheduled-${task.id}-${Date.now()}`,
      messages: [],
      memories: [],
      userMessage: `[SCHEDULED TASK INSTRUCTION]\n${routineTarget.userMessage}`,
      budget: {
        maxLlmCalls: 1,
        maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
        maxWallTimeMs: /\b(o1|o3|o1-pro|o1-mini|o3-mini)\b/.test(assistant.lucid_model?.toLowerCase() || '')
          ? Math.max(config.DEFAULT_MAX_WALL_TIME_MS, 180_000)
          : config.DEFAULT_MAX_WALL_TIME_MS,
      },
      runId,
      // Scheduled tasks have no human user — use the assistant's own ID as the userId.
      // This ensures builtInParams is populated so built-in tools (wallet_balance,
      // get_trading_policy, etc.) are reachable during autonomous scheduled execution.
      // Using assistant_id (not a system: prefix) keeps trading policy/usage tracking
      // on the same identity as interactive runs for the same agent.
      userId: task.assistant_id,
      llmConfig: getWorkerLlmConfig(config),
      supabase,
      channelId: task.channel_id || undefined,
    })

    // ── Deliver output ──
    const responseText = result.text?.trim()
    const diagnosticError = result.diagnostics?.error
    const providerErrorOutput = Boolean(responseText && /^(?:4\d\d|5\d\d)\b/.test(responseText))
    if (result.providerError === true || diagnosticError || providerErrorOutput) {
      throw new Error(diagnosticError?.message || responseText || 'Agent provider error')
    }
    const taskLabel = task.name || 'scheduled task'

    // Success — update task state
    const updates: Record<string, unknown> = {
      status: task.cron_expression ? 'pending' : 'completed',
      last_run_at: new Date().toISOString(),
      run_count: task.run_count + 1,
      retry_count: 0,
      claimed_by: null,
      claimed_at: null,
      last_run_output: responseText || null,
    }

    if (task.cron_expression) {
      updates.next_run_at = await computeNextCronRun(task.cron_expression, task.timezone)
    }

    await supabase.from('agent_scheduled_tasks').update(updates).eq('id', task.id)

    // Update agent-level next_wake_at for the wake scanner optimization
    await updateNextWakeAt(supabase, task.assistant_id)

    // Store assistant message in conversation for chat UI continuity
    if (responseText && task.conversation_id) {
      const messageId = crypto.randomUUID()
      await supabase.from('assistant_messages').insert({
        id: messageId,
        conversation_id: task.conversation_id,
        role: 'assistant',
        content: responseText,
      })
    }

    // Create outbound event for channel delivery
    if (responseText && task.channel_id) {
      await supabase.from('assistant_outbound_events').insert({
        channel_id: task.channel_id,
        conversation_id: task.conversation_id || null,
        message_text: `[${taskLabel}]\n${responseText}`,
        reply_to_external_id: null,
      })
      console.log(`[scheduler] Delivered task ${task.id} output to channel ${task.channel_id}`)
    }

    // Webhook delivery — fire-and-forget
    if (responseText && task.webhook_url) {
      try {
        const webhookResponse = await fetch(task.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: task.id,
            task_name: taskLabel,
            assistant_id: task.assistant_id,
            output: responseText,
            run_count: task.run_count + 1,
            completed_at: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!webhookResponse.ok) {
          console.warn(`[scheduler] Webhook delivery failed for task ${task.id}: HTTP ${webhookResponse.status}`)
        } else {
          console.log(`[scheduler] Webhook delivered for task ${task.id} to ${task.webhook_url}`)
        }
      } catch (err) {
        console.warn(`[scheduler] Webhook delivery error for task ${task.id}:`, err instanceof Error ? err.message : err)
      }
    }

    incSchedulerSucceeded()
    await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'succeeded', {
      outputSummary: responseText ? responseText.slice(0, 500) : null,
      dispatchSummary: routineTarget.dispatchSummary,
      ...routineTarget.receiptRefs,
    })
    span.setAttribute('lucid.scheduler.status', updates.status as string)
    console.log(`[scheduler] Task ${task.id} completed (run #${task.run_count + 1})`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Execution failed'
    incSchedulerFailed()
    span.setAttribute('lucid.scheduler.status', 'failed')
    await finishRoutineRunReceipt(supabase, routineReceiptId, task.id, 'failed', { errorMessage: errorMsg })
    await markScheduledTaskFailed(task, errorMsg, supabase)
  }

  })
}

export async function markScheduledTaskFailed(
  task: { id: string; max_retries: number; retry_count: number },
  errorMsg: string,
  supabase: SupabaseClient,
): Promise<void> {
  const nextRetry = task.retry_count + 1
  const isDead = nextRetry >= task.max_retries

  await supabase.from('agent_scheduled_tasks').update({
    status: isDead ? 'dead_letter' : 'failed',
    last_error: errorMsg,
    retry_count: nextRetry,
    claimed_by: null,
    claimed_at: null,
    ...(isDead ? {} : { next_run_at: new Date(Date.now() + Math.pow(4, nextRetry) * 60_000).toISOString() }),
  }).eq('id', task.id)

  // Update agent-level next_wake_at for the wake scanner optimization
  // Safe to call even if assistant_id isn't on the task type — it's always present at runtime
  if ('assistant_id' in task) {
    await updateNextWakeAt(supabase, (task as { assistant_id: string }).assistant_id)
  }

  if (isDead) {
    incSchedulerDeadLettered()
    console.error(`[scheduler] Task ${task.id} dead-lettered after ${nextRetry} retries: ${errorMsg}`)
  } else {
    console.warn(`[scheduler] Task ${task.id} failed (retry ${nextRetry}/${task.max_retries}): ${errorMsg}`)
  }
}

/**
 * Recompute `ai_assistants.next_wake_at` for an agent by finding the
 * earliest `next_run_at` across all pending tasks. This drives the
 * Phase 3 wake scanner optimization — the scanner can pre-filter agents
 * whose `next_wake_at` is in the future, skipping the task-level scan.
 *
 * Best-effort: failures are logged but never block task processing.
 */
async function updateNextWakeAt(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('agent_scheduled_tasks')
      .select('next_run_at')
      .eq('assistant_id', assistantId)
      .in('status', ['pending', 'failed'])
      .not('next_run_at', 'is', null)
      .order('next_run_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn(`[scheduler] updateNextWakeAt query failed for ${assistantId}:`, error.message)
      return
    }

    const nextWake = data?.next_run_at ?? null
    await supabase
      .from('ai_assistants')
      .update({ next_wake_at: nextWake })
      .eq('id', assistantId)
  } catch (err) {
    console.warn(`[scheduler] updateNextWakeAt failed for ${assistantId}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Compute next cron run time using croner.
 * Falls back to 1-hour offset if expression is invalid.
 */
export async function computeNextCronRun(cronExpression: string, timezone?: string): Promise<string> {
  try {
    const { Cron } = await import('croner')
    const job = new Cron(cronExpression, { timezone: timezone || 'UTC' })
    const next = job.nextRun()
    if (next) return next.toISOString()
    return new Date(Date.now() + 60 * 60 * 1000).toISOString()
  } catch (err) {
    console.warn(`[scheduler] Invalid cron expression "${cronExpression}":`, err instanceof Error ? err.message : err)
    return new Date(Date.now() + 60 * 60 * 1000).toISOString()
  }
}
