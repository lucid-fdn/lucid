/**
 * spawn_subagent — Runs a focused sub-task via recursive runEmbeddedPiAgent.
 *
 * Aligned with OpenClaw's subagent semantics (spawnSubagentDirect):
 * - maxSpawnDepth = 2 (matches OpenClaw DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH)
 * - maxChildrenPerAgent = 5 (matches OpenClaw default)
 * - parent_run_id linking for receipt/proof trees
 * - Budget slicing: child gets capped tool calls + wall time
 * - Cancellation propagation via AbortSignal
 *
 * When/if the gateway spike passes, this tool's executor can be swapped
 * to call the gateway's sessions_spawn method instead.
 */

import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { runEmbeddedPiAgent } from '@lucid/openclaw-runtime'
import type { EmbeddedPiRunResult } from '@lucid/openclaw-runtime'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withSpan } from '../../observability/tracing.js'
import { incSubagentSpawned, incSubagentFailed } from '../../observability/metrics.js'
import { emitAgentFeedEvent } from './feed-events.js'
import type { RunTurnInput, RunTurnOutput } from '../runtime/types.js'
import type { AssistantConfig } from '../types.js'

/** Aligned with OpenClaw config/agent-limits.ts */
export const SUBAGENT_MAX_DEPTH = 2
export const SUBAGENT_MAX_CHILDREN = 5
export const SUBAGENT_DEFAULT_MAX_TOOL_CALLS = 10
export const SUBAGENT_DEFAULT_MAX_WALL_TIME_MS = 60_000
/** Aggregate cap: total tool calls across ALL children spawned by one parent */
export const SUBAGENT_MAX_TOTAL_TOOL_CALLS = 30

export interface SubagentParams {
  task: string
  maxToolCalls?: number
  maxWallTimeMs?: number
  /** Override LLM model for this subagent (e.g., 'gpt-4o-mini' for fast tasks) */
  model?: string
}

export interface SubagentContext {
  parentRunId: string
  depth: number
  childrenSpawned: number
  /** Aggregate tool calls consumed across all children (mutated by spawn) */
  totalChildToolCalls: number
  sessionFile: string
  workspaceDir: string
  provider: string
  model: string
  config: Record<string, unknown>
  temperature: number
  maxOutputTokens: number
  extraSystemPrompt?: string
  abortSignal?: AbortSignal
  agentDir?: string
  clientTools?: Array<{ type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } }>
  clientToolExecutor?: (toolName: string, params: Record<string, unknown>) => Promise<string>
  /** Injected runtime — replaces direct runEmbeddedPiAgent import (v2 path) */
  runTurn?: (input: RunTurnInput) => Promise<RunTurnOutput>
  /** Supabase client for feed event emission */
  supabase?: SupabaseClient
  /** Org ID for feed event emission */
  orgId?: string
  /** Agent ID (source) for feed event emission */
  agentId?: string
}

export interface SubagentResult {
  text: string
  toolCallsUsed: number
  usage: { input: number; output: number }
  parentRunId: string
  childRunId: string
  durationMs: number
}

export async function toolSpawnSubagent(
  params: SubagentParams,
  ctx: SubagentContext,
): Promise<string> {
  if (!params.task?.trim()) {
    return JSON.stringify({ error: 'task is required and must not be empty' })
  }

  if (ctx.depth >= SUBAGENT_MAX_DEPTH) {
    incSubagentFailed('depth_limit')
    return JSON.stringify({
      error: `Maximum subagent depth (${SUBAGENT_MAX_DEPTH}) reached. Cannot spawn another subagent.`,
    })
  }

  if (ctx.childrenSpawned >= SUBAGENT_MAX_CHILDREN) {
    incSubagentFailed('children_limit')
    return JSON.stringify({
      error: `Maximum children per agent (${SUBAGENT_MAX_CHILDREN}) reached. Cannot spawn another subagent.`,
    })
  }

  if (ctx.totalChildToolCalls >= SUBAGENT_MAX_TOTAL_TOOL_CALLS) {
    incSubagentFailed('aggregate_tool_limit')
    return JSON.stringify({
      error: `Aggregate tool call budget (${SUBAGENT_MAX_TOTAL_TOOL_CALLS}) exhausted across children. Cannot spawn another subagent.`,
    })
  }

  ctx.childrenSpawned++
  incSubagentSpawned()

  const childRunId = crypto.randomUUID()

  // Emit spawn event to live feed
  if (ctx.supabase && ctx.orgId && ctx.agentId) {
    emitAgentFeedEvent(ctx.supabase, {
      agentId: ctx.agentId,
      orgId: ctx.orgId,
      eventType: 'subagent_spawned',
      runId: ctx.parentRunId,
      payload: {
        child_run_id: childRunId,
        depth: ctx.depth + 1,
        task_preview: params.task.slice(0, 200),
        model: params.model || ctx.model,
      },
    })
  }
  const effectiveModel = params.model || ctx.model
  const aggregateRemaining = SUBAGENT_MAX_TOTAL_TOOL_CALLS - ctx.totalChildToolCalls
  const maxToolCalls = Math.min(
    params.maxToolCalls ?? SUBAGENT_DEFAULT_MAX_TOOL_CALLS,
    SUBAGENT_DEFAULT_MAX_TOOL_CALLS,
    aggregateRemaining,
  )
  const maxWallTimeMs = Math.min(
    params.maxWallTimeMs ?? SUBAGENT_DEFAULT_MAX_WALL_TIME_MS,
    SUBAGENT_DEFAULT_MAX_WALL_TIME_MS,
  )

  return withSpan('subagent.spawn', {
    'lucid.subagent.parent_run_id': ctx.parentRunId,
    'lucid.subagent.child_run_id': childRunId,
    'lucid.subagent.depth': ctx.depth + 1,
  }, async (span) => {
  console.log(
    `[subagent] Spawning child ${childRunId} (parent: ${ctx.parentRunId}, depth: ${ctx.depth + 1}/${SUBAGENT_MAX_DEPTH})`,
  )

  let childToolCalls = 0
  const wrappedExecutor = ctx.clientToolExecutor
    ? async (toolName: string, toolParams: Record<string, unknown>): Promise<string> => {
        childToolCalls++
        if (childToolCalls > maxToolCalls) {
          return JSON.stringify({ error: `Subagent tool call limit (${maxToolCalls}) reached.` })
        }
        return ctx.clientToolExecutor!(toolName, toolParams)
      }
    : undefined

  // Isolate child workspace to prevent cache collisions and temp file conflicts
  const childWorkspaceDir = path.join(ctx.workspaceDir, `subagent-${childRunId}`)
  await fs.mkdir(childWorkspaceDir, { recursive: true })
  const childSessionFile = path.join(childWorkspaceDir, 'session.json')

  const startMs = Date.now()

  try {
    if (ctx.runTurn) {
      // V2 path — use injected runtime (goes through AgentRuntime seam)
      const turnOutput = await ctx.runTurn({
        orgId: '',
        assistantId: `subagent-${childRunId}`,
        conversationId: `subagent-${childRunId}`,
        runId: childRunId,
        assistant: {
          id: `subagent-${childRunId}`,
          name: 'subagent',
          org_id: '',
          system_prompt: [
            ctx.extraSystemPrompt || '',
            `\n\n[Subagent Context] You are a focused subagent (depth ${ctx.depth + 1}/${SUBAGENT_MAX_DEPTH}). Complete the given task concisely. Do not spawn further subagents unless absolutely necessary.`,
          ].join(''),
          lucid_model: effectiveModel,
          temperature: ctx.temperature,
          max_tokens: ctx.maxOutputTokens,
          memory_enabled: false,
          memory_window_size: 0,
          policy_config: {},
          wallet_enabled: false,
        } as AssistantConfig,
        plugins: [],
        budget: { maxLlmCalls: 15, maxToolCalls: maxToolCalls, maxWallTimeMs: maxWallTimeMs },
        userMessage: params.task,
        messages: [],
        memories: [],
        output: undefined,
        subagentDepth: ctx.depth + 1,
        embeddedConfig: undefined,
        abortSignal: ctx.abortSignal,
      })

      const durationMs = Date.now() - startMs
      const subagentResult: SubagentResult = {
        text: turnOutput.text,
        toolCallsUsed: turnOutput.toolCallsUsed,
        usage: {
          input: turnOutput.meta.usage?.input ?? 0,
          output: turnOutput.meta.usage?.output ?? 0,
        },
        parentRunId: ctx.parentRunId,
        childRunId,
        durationMs,
      }

      ctx.totalChildToolCalls += turnOutput.toolCallsUsed
      span.setAttribute('lucid.subagent.duration_ms', durationMs)
      span.setAttribute('lucid.subagent.tool_calls', turnOutput.toolCallsUsed)
      span.setAttribute('lucid.subagent.total_child_tool_calls', ctx.totalChildToolCalls)
      console.log(`[subagent] Child ${childRunId} completed in ${durationMs}ms (${turnOutput.toolCallsUsed} tool calls, aggregate=${ctx.totalChildToolCalls}/${SUBAGENT_MAX_TOTAL_TOOL_CALLS})`)

      if (ctx.supabase && ctx.orgId && ctx.agentId) {
        emitAgentFeedEvent(ctx.supabase, {
          agentId: ctx.agentId,
          orgId: ctx.orgId,
          eventType: 'subagent_completed',
          runId: ctx.parentRunId,
          payload: { child_run_id: childRunId, depth: ctx.depth + 1, duration_ms: durationMs, tool_calls_used: turnOutput.toolCallsUsed },
        })
      }

      return JSON.stringify(subagentResult)

    } else {
      // Legacy path — direct runEmbeddedPiAgent call
      const result: EmbeddedPiRunResult = await runEmbeddedPiAgent({
        sessionId: `subagent-${childRunId}`,
        sessionFile: childSessionFile,
        workspaceDir: childWorkspaceDir,
        agentDir: childWorkspaceDir,
        prompt: params.task,
        provider: ctx.provider,
        model: effectiveModel,
        config: ctx.config,
        temperature: ctx.temperature,
        maxOutputTokens: ctx.maxOutputTokens,
        streamParams: {
          temperature: ctx.temperature,
          maxTokens: ctx.maxOutputTokens,
        },
        timeoutMs: maxWallTimeMs,
        runId: childRunId,
        abortSignal: ctx.abortSignal,
        spawnedBy: ctx.parentRunId,
        extraSystemPrompt: [
          ctx.extraSystemPrompt || '',
          `\n\n[Subagent Context] You are a focused subagent (depth ${ctx.depth + 1}/${SUBAGENT_MAX_DEPTH}). Complete the given task concisely. Do not spawn further subagents unless absolutely necessary.`,
        ].join(''),
        clientTools: ctx.clientTools,
        clientToolExecutor: wrappedExecutor,
      })

      const durationMs = Date.now() - startMs
      const responseText = result.payloads?.map(p => p.text).filter(Boolean).join('\n') || ''
      const usage = result.meta?.agentMeta?.usage

      const subagentResult: SubagentResult = {
        text: responseText,
        toolCallsUsed: childToolCalls,
        usage: { input: usage?.input ?? 0, output: usage?.output ?? 0 },
        parentRunId: ctx.parentRunId,
        childRunId,
        durationMs,
      }

      ctx.totalChildToolCalls += childToolCalls
      span.setAttribute('lucid.subagent.duration_ms', durationMs)
      span.setAttribute('lucid.subagent.tool_calls', childToolCalls)
      span.setAttribute('lucid.subagent.total_child_tool_calls', ctx.totalChildToolCalls)
      console.log(`[subagent] Child ${childRunId} completed in ${durationMs}ms (${childToolCalls} tool calls, aggregate=${ctx.totalChildToolCalls}/${SUBAGENT_MAX_TOTAL_TOOL_CALLS})`)

      if (ctx.supabase && ctx.orgId && ctx.agentId) {
        emitAgentFeedEvent(ctx.supabase, {
          agentId: ctx.agentId,
          orgId: ctx.orgId,
          eventType: 'subagent_completed',
          runId: ctx.parentRunId,
          payload: { child_run_id: childRunId, depth: ctx.depth + 1, duration_ms: durationMs, tool_calls_used: childToolCalls },
        })
      }

      return JSON.stringify(subagentResult)
    }
  } catch (err) {
    const durationMs = Date.now() - startMs
    const errorMsg = err instanceof Error ? err.message : 'Subagent execution failed'
    span.setAttribute('lucid.subagent.duration_ms', durationMs)
    incSubagentFailed('error')
    console.error(`[subagent] Child ${childRunId} failed after ${durationMs}ms:`, errorMsg)

    if (ctx.supabase && ctx.orgId && ctx.agentId) {
      emitAgentFeedEvent(ctx.supabase, {
        agentId: ctx.agentId,
        orgId: ctx.orgId,
        eventType: 'subagent_failed',
        runId: ctx.parentRunId,
        payload: { child_run_id: childRunId, depth: ctx.depth + 1, duration_ms: durationMs, error: errorMsg.slice(0, 500) },
      })
    }

    return JSON.stringify({ error: errorMsg, parentRunId: ctx.parentRunId, childRunId, durationMs })
  } finally {
    // Clean up child workspace (non-fatal — log and continue)
    fs.rm(childWorkspaceDir, { recursive: true, force: true }).catch((cleanupErr) => {
      console.warn(`[subagent] Failed to clean up workspace ${childWorkspaceDir}:`, cleanupErr)
    })
  }
  })
}
