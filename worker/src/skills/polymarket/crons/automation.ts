/**
 * Polymarket Automation Cron — 60s rule evaluation + approval resolution.
 *
 * Three-phase cycle:
 *   PHASE A:  Resolve pending approvals (execute approved trades)
 *   PHASE A2: Recover stale 'processing' executions (>5 min)
 *   PHASE B:  Evaluate enabled rules against current prices
 *
 * Follows polymarket-balance-sync.ts cron pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import pLimit from 'p-limit'
import { getConfig } from '../../../config.js'
import crypto from 'node:crypto'
import {
  evaluateRule,
  isInCooldown,
  isMaxTriggersReached,
  isInBackoff,
  isPortfolioRuleType,
  computePortfolioMetrics,
  evaluatePortfolioRule,
} from '../services/automation-evaluator.js'
import {
  AUTOMATION_EXECUTION_COLUMNS,
  AUTOMATION_RULE_COLUMNS,
  updateRuleState,
} from '../services/automation-rules.js'
import { getPositions } from '../services/position-aggregator.js'
import { getMarket } from '../services/clob-client.js'
import { executePolymarketTrade } from '../services/trade-executor.js'
import { logPolymarketTrade } from '../services/trade-logger.js'
import type {
  AutomationRule,
  AutomationExecution,
  AutomationRuleType,
  AutomationRuleConfig,
  AutomationExitAction,
  AutomationExecutionStatus,
  PolymarketPosition,
  PortfolioAffectedPosition,
  PortfolioEvaluationResult,
  BatchOutcome,
} from '../services/types.js'

const tradeLimit = pLimit(3)

/** Max consecutive failures before auto-disable */
const MAX_CONSECUTIVE_FAILURES = 5

/** Stale processing threshold: 5 minutes */
const STALE_PROCESSING_MS = 5 * 60 * 1000

/** Safely check feature flag */
function isAutomationEnabled(): boolean {
  try {
    return getConfig().FEATURE_POLYMARKET_AUTOMATION
  } catch {
    return false
  }
}

/**
 * Compute an idempotency key for a rule trigger.
 * Groups triggers into cooldown-sized time windows to prevent duplicate trades.
 */
export function computeExecutionKey(rule: AutomationRule, triggerPrice: number): string {
  const cycleWindow = Math.floor(Date.now() / (rule.cooldown_seconds * 1000))
  return `${rule.id}:${rule.rule_type}:${triggerPrice.toFixed(6)}:${cycleWindow}`
}

export async function evaluateAutomationRules(supabase: SupabaseClient): Promise<void> {
  if (!isAutomationEnabled()) return

  try {
    // ── PHASE A: Resolve pending approvals ──
    await resolveApprovals(supabase)

    // ── PHASE A2: Recover stale 'processing' executions ──
    await recoverStaleProcessing(supabase)

    // ── PHASE B: Evaluate enabled rules ──
    await evaluateRules(supabase)
  } catch (err) {
    console.error('[polymarket-automation] Error:', err)
  }
}

// ── Phase A: Approval Resolution ─────────────────────────────────────

async function resolveApprovals(supabase: SupabaseClient): Promise<void> {
  const { data: pending, error } = await supabase
    .from('polymarket_automation_executions')
    .select(AUTOMATION_EXECUTION_COLUMNS)
    .eq('status', 'pending_approval')

  if (error || !pending?.length) return
  const pendingExecutions = pending as unknown as AutomationExecution[]

  // Group by approval_id to handle portfolio batches
  const byApproval = new Map<string, AutomationExecution[]>()
  for (const execution of pendingExecutions) {
    if (!execution.approval_id) continue
    const key = execution.approval_id
    if (!byApproval.has(key)) byApproval.set(key, [])
    byApproval.get(key)!.push(execution)
  }

  for (const [approvalId, executions] of byApproval) {
    // Check approval status
    const { data: approval } = await supabase
      .from('mc_pending_approvals')
      .select('status')
      .eq('id', approvalId)
      .single()

    if (!approval) continue

    if (approval.status === 'approved') {
      const isPortfolioBatch = executions.some(e => e.trigger_batch_id != null)

      if (isPortfolioBatch) {
        await resolveApprovedPortfolioBatch(supabase, executions)
      } else {
        // Position rules — execute each individually (typically just 1)
        for (const execution of executions) {
          await tradeLimit(() => executeApprovedTrade(supabase, execution))
        }
      }
    } else if (approval.status === 'denied') {
      for (const execution of executions) {
        await supabase
          .from('polymarket_automation_executions')
          .update({ status: 'denied' })
          .eq('id', execution.id)
      }
      console.log(`[polymarket-automation] Batch ${approvalId}: ${executions.length} executions denied`)
    } else if (approval.status === 'expired') {
      for (const execution of executions) {
        await supabase
          .from('polymarket_automation_executions')
          .update({ status: 'expired' })
          .eq('id', execution.id)
      }
      console.log(`[polymarket-automation] Batch ${approvalId}: ${executions.length} executions expired`)
    }
    // else still pending — skip
  }
}

/** Revalidate and execute an approved portfolio batch */
async function resolveApprovedPortfolioBatch(
  supabase: SupabaseClient,
  executions: Record<string, any>[],
): Promise<void> {
  const firstExec = executions[0]

  // Load the rule
  const { data: ruleData } = await supabase
    .from('polymarket_automation_rules')
    .select(AUTOMATION_RULE_COLUMNS)
    .eq('id', firstExec.rule_id)
    .single()

  if (!ruleData) {
    for (const exec of executions) {
      await updateExecutionStatus(supabase, exec.id, 'failed', 'Rule not found during revalidation')
    }
    return
  }
  const rule = ruleData as unknown as AutomationRule

  // Fetch fresh positions for revalidation
  let positions: PolymarketPosition[]
  try {
    positions = await getPositions(supabase, firstExec.agent_id)
  } catch {
    for (const exec of executions) {
      await updateExecutionStatus(supabase, exec.id, 'failed', 'Failed to fetch positions for revalidation')
    }
    return
  }

  // Re-evaluate the portfolio rule against current state
  const metrics = computePortfolioMetrics(positions)
  const freshResult = evaluatePortfolioRule(
    rule.rule_type as AutomationRuleType,
    rule.rule_config as AutomationRuleConfig,
    metrics,
  )

  if (!freshResult.triggered || freshResult.affectedPositions.length === 0) {
    // Rule no longer triggers — mark all as expired
    for (const exec of executions) {
      await updateExecutionStatus(supabase, exec.id, 'expired', 'Revalidation: rule no longer triggers')
    }

    // Update batch snapshot
    const batchId = firstExec.trigger_batch_id
    if (batchId) {
      await supabase
        .from('polymarket_automation_executions')
        .update({ trigger_snapshot: { ...firstExec.trigger_snapshot, batch_outcome: 'revalidation_passed' } })
        .eq('trigger_batch_id', batchId)
    }

    console.log(`[polymarket-automation] Portfolio batch revalidation passed — rule ${rule.id} no longer triggers`)
    return
  }

  // Still triggered — execute with fresh affected positions
  const statuses: AutomationExecutionStatus[] = []

  for (const pos of freshResult.affectedPositions) {
    // Find matching execution row or use any available
    const matchExec = executions.find(e => e.condition_id === pos.conditionId) ?? executions[0]

    try {
      // Update execution to processing
      await supabase
        .from('polymarket_automation_executions')
        .update({ status: 'processing' })
        .eq('id', matchExec.id)

      await tradeLimit(async () => {
        await executeTradeForRule(supabase, matchExec.id, rule, {
          agent_id: rule.agent_id,
          org_id: rule.org_id,
          condition_id: pos.conditionId,
        }, {
          exitAction: pos.exitAction,
          tokenId: pos.tokenId,
          outcome: pos.outcome,
          exitAmount: pos.exitAmount,
        })
      })

      const { data: updated } = await supabase
        .from('polymarket_automation_executions')
        .select('status')
        .eq('id', matchExec.id)
        .single()

      statuses.push((updated?.status ?? 'failed') as AutomationExecutionStatus)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await updateExecutionStatus(supabase, matchExec.id, 'failed', msg)
      statuses.push('failed')
    }
  }

  // Mark any executions for positions no longer affected as expired
  const freshConditionIds = new Set(freshResult.affectedPositions.map(p => p.conditionId))
  for (const exec of executions) {
    if (!freshConditionIds.has(exec.condition_id)) {
      await updateExecutionStatus(supabase, exec.id, 'expired', 'Revalidation: position no longer affected')
    }
  }

  // Compute batch outcome
  const batchOutcome = computeBatchOutcome(statuses)
  const batchId = firstExec.trigger_batch_id
  if (batchId) {
    await supabase
      .from('polymarket_automation_executions')
      .update({ trigger_snapshot: { ...firstExec.trigger_snapshot, batch_outcome: batchOutcome } })
      .eq('trigger_batch_id', batchId)
  }

  if (batchOutcome === 'full_success' || batchOutcome === 'partial_success') {
    await supabase
      .from('polymarket_automation_rules')
      .update({
        trigger_count: rule.trigger_count + 1,
        last_triggered_at: new Date().toISOString(),
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)
  } else if (batchOutcome === 'full_failure') {
    await incrementRuleFailure(supabase, rule.id)
  }

  console.log(`[polymarket-automation] Portfolio batch revalidation for rule ${rule.id}: ${batchOutcome}`)
}

// ── Phase A2: Stale Processing Recovery ──────────────────────────────

async function recoverStaleProcessing(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()

  const { data: stale, error } = await supabase
    .from('polymarket_automation_executions')
    .select('id, rule_id')
    .eq('status', 'processing')
    .lt('created_at', cutoff)

  if (error || !stale?.length) return

  for (const execution of stale) {
    await supabase
      .from('polymarket_automation_executions')
      .update({ status: 'failed', error_message: 'Stale processing recovery — exceeded 5 min' })
      .eq('id', execution.id)

    // Increment failure count on the rule
    await incrementRuleFailure(supabase, execution.rule_id)

    console.warn(`[polymarket-automation] Recovered stale processing execution ${execution.id}`)
  }
}

// ── Shared Trade Execution Helper ────────────────────────────────────

/** Portfolio rules pass overrides (exit action, token, amount resolved per-position) */
interface TradeOverrides {
  exitAction: AutomationExitAction
  tokenId: string
  outcome: string
  exitAmount: number
}

async function executeTradeForRule(
  supabase: SupabaseClient,
  executionId: string,
  rule: Record<string, any>,
  execution: Record<string, any>,
  overrides?: TradeOverrides,
): Promise<void> {
  // Determine exit params — from overrides (portfolio) or rule (position)
  const exitAction = overrides?.exitAction ?? rule.exit_action
  const tokenId = overrides?.tokenId ?? rule.token_id
  let exitAmount: number

  if (overrides) {
    // Portfolio rule: amount already computed
    exitAmount = overrides.exitAmount
  } else {
    // Position rule: compute from position
    const positions = await getPositions(supabase, execution.agent_id)
    const position = positions.find(
      (p: PolymarketPosition) => p.conditionId === execution.condition_id && p.tokenId === tokenId,
    )

    if (!position || parseFloat(position.size) <= 0) {
      await updateExecutionStatus(supabase, executionId, 'no_position', 'No position found')
      return
    }

    const positionSize = parseFloat(position.size)
    const exitPct = rule.exit_amount_pct / 100
    exitAmount = positionSize * exitPct
  }

  // Check minimum order size
  try {
    const market = await getMarket(execution.condition_id)
    if (market) {
      const minSize = parseFloat(market.minimum_order_size)
      if (exitAmount < minSize) {
        await updateExecutionStatus(supabase, executionId, 'below_minimum', `Exit amount ${exitAmount} below minimum ${minSize}`)
        console.log(`[polymarket-automation] Execution ${executionId}: below minimum order size`)
        return
      }
    }
  } catch {
    await updateExecutionStatus(supabase, executionId, 'market_unavailable', 'Market data unavailable')
    return
  }

  // Execute the trade
  const tradeResult = await executePolymarketTrade(execution.agent_id, {
    conditionId: execution.condition_id,
    action: exitAction,
    amount: exitAmount.toString(),
  })

  if (tradeResult.success) {
    // Log the trade
    const outcome = overrides?.outcome ?? rule.outcome
    await logPolymarketTrade(supabase, {
      agentId: execution.agent_id,
      orgId: execution.org_id,
      conditionId: execution.condition_id,
      tokenId,
      outcome,
      action: exitAction,
      side: 'SELL',
      amount: exitAmount.toString(),
      price: tradeResult.effectivePrice,
      orderId: tradeResult.orderId,
      txHash: tradeResult.txHash,
    })

    await supabase
      .from('polymarket_automation_executions')
      .update({
        status: 'executed',
        trade_result: tradeResult as any,
        position_size: exitAmount.toString(),
      })
      .eq('id', executionId)

    // Portfolio rules manage rule state at the batch level — skip per-execution updates
    if (!overrides) {
      // Position rule: update rule state per-execution
      await supabase
        .from('polymarket_automation_rules')
        .update({
          trigger_count: rule.trigger_count + 1,
          last_triggered_at: new Date().toISOString(),
          consecutive_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id)

      // Check if max_triggers reached → auto-disable
      if (rule.max_triggers && rule.trigger_count + 1 >= rule.max_triggers) {
        await supabase
          .from('polymarket_automation_rules')
          .update({ enabled: false, disabled_reason: 'max_triggers' })
          .eq('id', rule.id)
        console.log(`[polymarket-automation] Rule ${rule.id} auto-disabled: max_triggers reached`)
      }
    }

    console.log(`[polymarket-automation] Executed trade for rule ${rule.id}: ${exitAction} ${exitAmount}`)
  } else {
    await supabase
      .from('polymarket_automation_executions')
      .update({
        status: 'failed',
        error_message: tradeResult.error ?? 'Trade execution failed',
        trade_result: tradeResult as any,
      })
      .eq('id', executionId)

    // Portfolio rules manage rule state at the batch level — skip per-execution updates
    if (!overrides) {
      await incrementRuleFailure(supabase, rule.id)
    }

    console.error(`[polymarket-automation] Trade failed for rule ${rule.id}:`, tradeResult.error)
  }
}

/** Update execution status helper */
async function updateExecutionStatus(
  supabase: SupabaseClient,
  executionId: string,
  status: AutomationExecutionStatus,
  errorMessage?: string,
): Promise<void> {
  await supabase
    .from('polymarket_automation_executions')
    .update({ status, error_message: errorMessage ?? null })
    .eq('id', executionId)
}

/** Increment consecutive_failures on a rule atomically; auto-disable at threshold */
async function incrementRuleFailure(supabase: SupabaseClient, ruleId: string): Promise<void> {
  const { data, error } = await supabase.rpc('increment_automation_rule_failure', {
    p_rule_id: ruleId,
    p_max_failures: MAX_CONSECUTIVE_FAILURES,
  })

  if (error) {
    console.error(`[polymarket-automation] Failed to increment failures for rule ${ruleId}:`, error.message)
    return
  }

  if (data?.[0]?.auto_disabled) {
    console.log(`[polymarket-automation] Rule ${ruleId} auto-disabled: ${data[0].new_count} consecutive failures`)
  }
}

async function executeApprovedTrade(
  supabase: SupabaseClient,
  execution: Record<string, any>,
): Promise<void> {
  try {
    // Load the rule to get exit params
    const { data: ruleData } = await supabase
      .from('polymarket_automation_rules')
      .select(AUTOMATION_RULE_COLUMNS)
      .eq('id', execution.rule_id)
      .single()

    if (!ruleData) {
      await updateExecutionStatus(supabase, execution.id, 'failed', 'Rule not found')
      return
    }
    const rule = ruleData as unknown as AutomationRule

    await executeTradeForRule(supabase, execution.id, rule, execution)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateExecutionStatus(supabase, execution.id, 'failed', msg)
    await incrementRuleFailure(supabase, execution.rule_id)
    console.error(`[polymarket-automation] Error executing trade for execution ${execution.id}:`, msg)
  }
}

// ── Phase B: Rule Evaluation ─────────────────────────────────────────

async function evaluateRules(supabase: SupabaseClient): Promise<void> {
  // Fetch enabled rules
  const { data: rules, error } = await supabase
    .from('polymarket_automation_rules')
    .select(AUTOMATION_RULE_COLUMNS)
    .eq('enabled', true)

  if (error || !rules?.length) return

  // Group rules by agent_id
  const rulesByAgent = new Map<string, AutomationRule[]>()
  for (const rule of rules as unknown as AutomationRule[]) {
    if (!rulesByAgent.has(rule.agent_id)) {
      rulesByAgent.set(rule.agent_id, [])
    }
    rulesByAgent.get(rule.agent_id)!.push(rule)
  }

  // Process each agent's rules
  for (const [agentId, agentRules] of rulesByAgent) {
    try {
      await evaluateAgentRules(supabase, agentId, agentRules)
    } catch (err) {
      console.error(`[polymarket-automation] Error evaluating rules for agent ${agentId}:`, err)
    }
  }
}

async function evaluateAgentRules(
  supabase: SupabaseClient,
  agentId: string,
  rules: AutomationRule[],
): Promise<void> {
  // Get positions for this agent
  let positions: PolymarketPosition[]
  try {
    positions = await getPositions(supabase, agentId)
  } catch {
    return // Can't evaluate without positions
  }

  // Split into position vs portfolio rules
  const positionRules = rules.filter(r => !isPortfolioRuleType(r.rule_type))
  const portfolioRules = rules.filter(r => isPortfolioRuleType(r.rule_type))

  // Batch-fetch market data for position rules (portfolio rules don't need it)
  const conditionIds = [...new Set(positionRules.map(r => r.condition_id).filter((id): id is string => id !== null))]
  const marketData = new Map<string, { endDate?: string }>()

  const marketResults = await Promise.allSettled(
    conditionIds.map(async id => {
      const market = await getMarket(id)
      return { id, endDate: market?.end_date_iso }
    }),
  )

  for (const result of marketResults) {
    if (result.status === 'fulfilled') {
      marketData.set(result.value.id, { endDate: result.value.endDate })
    }
  }

  // Evaluate position rules (existing, unchanged)
  for (const rule of positionRules) {
    try {
      await evaluateSingleRule(supabase, rule, positions, marketData)
    } catch (err) {
      console.error(`[polymarket-automation] Error evaluating rule ${rule.id}:`, err)
    }
  }

  // Evaluate portfolio rules (Phase 5C)
  for (const rule of portfolioRules) {
    try {
      await evaluateAgentPortfolioRule(supabase, rule, positions)
    } catch (err) {
      console.error(`[polymarket-automation] Error evaluating portfolio rule ${rule.id}:`, err)
    }
  }
}

async function evaluateSingleRule(
  supabase: SupabaseClient,
  rule: AutomationRule,
  positions: PolymarketPosition[],
  marketData: Map<string, { endDate?: string }>,
): Promise<void> {
  // Check cooldown
  if (isInCooldown(rule.last_triggered_at, rule.cooldown_seconds)) return

  // Check max triggers
  if (isMaxTriggersReached(rule.trigger_count, rule.max_triggers)) return

  // Check backoff (uses last_failed_at, not last_triggered_at)
  if (isInBackoff(rule.consecutive_failures, rule.last_failed_at, rule.cooldown_seconds)) return

  // Check no pending approval exists for this rule
  const { data: pendingExec } = await supabase
    .from('polymarket_automation_executions')
    .select('id')
    .eq('rule_id', rule.id)
    .eq('status', 'pending_approval')
    .limit(1)

  if (pendingExec && pendingExec.length > 0) return

  // For auto_execute rules, also check no 'processing' row exists
  if (rule.execution_mode === 'auto_execute') {
    const { data: processingExec } = await supabase
      .from('polymarket_automation_executions')
      .select('id')
      .eq('rule_id', rule.id)
      .eq('status', 'processing')
      .limit(1)

    if (processingExec && processingExec.length > 0) return
  }

  // Position rules require condition_id and token_id
  if (!rule.condition_id || !rule.token_id) return

  // Find matching position
  const position = positions.find(
    p => p.conditionId === rule.condition_id && p.tokenId === rule.token_id,
  )
  if (!position) return // No matching position

  const currentPrice = position.currentPrice
  const market = marketData.get(rule.condition_id)
  const hwm = (rule.rule_state as any)?.high_water_mark as number | undefined

  // Evaluate the rule
  const result = evaluateRule(
    rule.rule_type as AutomationRuleType,
    rule.rule_config as AutomationRuleConfig,
    {
      currentPrice,
      marketEndDate: market?.endDate,
      highWaterMark: hwm,
    },
  )

  // Update trailing_stop HWM if new high observed (regardless of trigger)
  if (result.newHighWaterMark !== undefined) {
    await updateRuleState(supabase, rule.id, {
      ...rule.rule_state,
      high_water_mark: result.newHighWaterMark,
    })
  }

  if (!result.triggered) return

  // Rule triggered — branch on execution mode
  console.log(`[polymarket-automation] Rule ${rule.id} (${rule.rule_type}) triggered: price=${currentPrice}, threshold=${result.thresholdValue}`)

  if (rule.execution_mode === 'auto_execute') {
    await handleAutoExecute(supabase, rule, position, currentPrice, result.thresholdValue)
  } else {
    await handleApprovalPath(supabase, rule, position, currentPrice, result.thresholdValue)
  }
}

// ── Auto-Execute Path ────────────────────────────────────────────────

async function handleAutoExecute(
  supabase: SupabaseClient,
  rule: AutomationRule,
  position: PolymarketPosition,
  triggerPrice: number,
  thresholdValue: number | null,
): Promise<void> {
  // Compute idempotency key
  const executionKey = computeExecutionKey(rule, triggerPrice)

  // Check if an execution with this key already exists (executed or processing)
  const { data: existingExec } = await supabase
    .from('polymarket_automation_executions')
    .select('id, status')
    .eq('execution_key', executionKey)
    .limit(1)

  if (existingExec && existingExec.length > 0) {
    const existing = existingExec[0]
    if (existing.status === 'executed' || existing.status === 'processing') {
      console.log(`[polymarket-automation] Skipping duplicate execution for rule ${rule.id}: key=${executionKey}, status=${existing.status}`)
      return
    }
  }

  // Insert execution with 'processing' status + execution_key
  const { data: execRow, error: execError } = await supabase
    .from('polymarket_automation_executions')
    .insert({
      rule_id: rule.id,
      agent_id: rule.agent_id,
      org_id: rule.org_id,
      condition_id: rule.condition_id,
      rule_type: rule.rule_type,
      trigger_price: triggerPrice,
      threshold_value: thresholdValue,
      position_size: position.size,
      status: 'processing',
      execution_key: executionKey,
    })
    .select('id')
    .single()

  if (execError || !execRow) {
    // Likely dedup constraint violation (processing dedup or execution_key dedup)
    console.warn(`[polymarket-automation] Auto-execute insert failed for rule ${rule.id}:`, execError?.message)
    return
  }

  // Execute the trade (rate-limited to match approval path)
  try {
    await tradeLimit(() => executeTradeForRule(supabase, execRow.id, rule, {
      agent_id: rule.agent_id,
      org_id: rule.org_id,
      condition_id: rule.condition_id,
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateExecutionStatus(supabase, execRow.id, 'failed', msg)
    await incrementRuleFailure(supabase, rule.id)
    console.error(`[polymarket-automation] Auto-execute error for rule ${rule.id}:`, msg)
  }
}

// ── Approval Path (unchanged from 5A) ───────────────────────────────

async function handleApprovalPath(
  supabase: SupabaseClient,
  rule: AutomationRule,
  position: PolymarketPosition,
  triggerPrice: number,
  thresholdValue: number | null,
): Promise<void> {
  // Insert approval request
  const { data: approval, error: approvalError } = await supabase
    .from('mc_pending_approvals')
    .insert({
      org_id: rule.org_id,
      agent_id: rule.agent_id,
      run_id: `automation-${rule.id}`,
      tool_name: 'polymarket_automation',
      tool_args: {
        rule_id: rule.id,
        rule_type: rule.rule_type,
        condition_id: rule.condition_id,
        exit_action: rule.exit_action,
        exit_amount_pct: rule.exit_amount_pct,
        trigger_price: triggerPrice,
        threshold_value: thresholdValue,
      },
      risk_level: 'high',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (approvalError || !approval) {
    console.error(`[polymarket-automation] Failed to create approval for rule ${rule.id}:`, approvalError?.message)
    return
  }

  // Insert execution row (with pending-dedup partial unique index)
  const { error: execError } = await supabase
    .from('polymarket_automation_executions')
    .insert({
      rule_id: rule.id,
      agent_id: rule.agent_id,
      org_id: rule.org_id,
      condition_id: rule.condition_id,
      rule_type: rule.rule_type,
      trigger_price: triggerPrice,
      threshold_value: thresholdValue,
      position_size: position.size,
      status: 'pending_approval',
      approval_id: approval.id,
    })

  if (execError) {
    // Likely dedup constraint violation — another pending approval exists
    console.warn(`[polymarket-automation] Execution insert failed for rule ${rule.id}:`, execError.message)
  }
}

// ============================================================================
// Phase 5C: Portfolio Rule Evaluation + Batch Semantics
// ============================================================================

async function evaluateAgentPortfolioRule(
  supabase: SupabaseClient,
  rule: AutomationRule,
  positions: PolymarketPosition[],
): Promise<void> {
  // Guard checks
  if (isInCooldown(rule.last_triggered_at, rule.cooldown_seconds)) return
  if (isMaxTriggersReached(rule.trigger_count, rule.max_triggers)) return
  if (isInBackoff(rule.consecutive_failures, rule.last_failed_at, rule.cooldown_seconds)) return

  // Check no live batch exists (processing or pending_approval)
  const { data: liveBatch } = await supabase
    .from('polymarket_automation_executions')
    .select('id')
    .eq('rule_id', rule.id)
    .in('status', ['processing', 'pending_approval'])
    .limit(1)

  if (liveBatch && liveBatch.length > 0) return

  // Compute portfolio metrics and evaluate
  if (positions.length === 0) return

  const metrics = computePortfolioMetrics(positions)
  const result = evaluatePortfolioRule(
    rule.rule_type as AutomationRuleType,
    rule.rule_config as AutomationRuleConfig,
    metrics,
  )

  if (!result.triggered || result.affectedPositions.length === 0) return

  console.log(`[polymarket-automation] Portfolio rule ${rule.id} (${rule.rule_type}) triggered: ${result.affectedPositions.length} positions affected`)

  await handlePortfolioTrigger(supabase, rule, result)
}

async function handlePortfolioTrigger(
  supabase: SupabaseClient,
  rule: AutomationRule,
  result: PortfolioEvaluationResult,
): Promise<void> {
  const triggerBatchId = crypto.randomUUID()
  const triggerSnapshot = { ...result.triggerSnapshot, batch_outcome: 'pending' as BatchOutcome }

  if (rule.execution_mode === 'auto_execute') {
    await handlePortfolioAutoExecute(supabase, rule, result.affectedPositions, triggerBatchId, triggerSnapshot)
  } else {
    await handlePortfolioApproval(supabase, rule, result.affectedPositions, triggerBatchId, triggerSnapshot)
  }
}

async function handlePortfolioAutoExecute(
  supabase: SupabaseClient,
  rule: AutomationRule,
  affectedPositions: PortfolioAffectedPosition[],
  triggerBatchId: string,
  triggerSnapshot: Record<string, unknown>,
): Promise<void> {
  const statuses: AutomationExecutionStatus[] = []

  for (const pos of affectedPositions) {
    const executionKey = `${rule.id}:portfolio:${triggerBatchId}:${pos.conditionId}:${pos.tokenId}`

    // Insert execution row
    const { data: execRow, error: execError } = await supabase
      .from('polymarket_automation_executions')
      .insert({
        rule_id: rule.id,
        agent_id: rule.agent_id,
        org_id: rule.org_id,
        condition_id: pos.conditionId,
        rule_type: rule.rule_type,
        trigger_price: null,
        threshold_value: null,
        position_size: pos.exitAmount.toString(),
        status: 'processing',
        execution_key: executionKey,
        trigger_batch_id: triggerBatchId,
        trigger_snapshot: triggerSnapshot,
      })
      .select('id')
      .single()

    if (execError || !execRow) {
      console.warn(`[polymarket-automation] Portfolio batch insert failed for rule ${rule.id}:`, execError?.message)
      statuses.push('failed')
      continue
    }

    // Execute the trade with overrides
    try {
      await tradeLimit(async () => {
        await executeTradeForRule(supabase, execRow.id, rule, {
          agent_id: rule.agent_id,
          org_id: rule.org_id,
          condition_id: pos.conditionId,
        }, {
          exitAction: pos.exitAction,
          tokenId: pos.tokenId,
          outcome: pos.outcome,
          exitAmount: pos.exitAmount,
        })
      })

      // Re-read status after execution
      const { data: updated } = await supabase
        .from('polymarket_automation_executions')
        .select('status')
        .eq('id', execRow.id)
        .single()

      statuses.push((updated?.status ?? 'failed') as AutomationExecutionStatus)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await updateExecutionStatus(supabase, execRow.id, 'failed', msg)
      statuses.push('failed')
    }
  }

  // Compute batch outcome and update rule
  const batchOutcome = computeBatchOutcome(statuses)

  // Update trigger_snapshot with final outcome on all batch rows
  await supabase
    .from('polymarket_automation_executions')
    .update({ trigger_snapshot: { ...triggerSnapshot, batch_outcome: batchOutcome } })
    .eq('trigger_batch_id', triggerBatchId)

  if (batchOutcome === 'full_success' || batchOutcome === 'partial_success') {
    await supabase
      .from('polymarket_automation_rules')
      .update({
        trigger_count: rule.trigger_count + 1,
        last_triggered_at: new Date().toISOString(),
        consecutive_failures: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id)

    if (rule.max_triggers && rule.trigger_count + 1 >= rule.max_triggers) {
      await supabase
        .from('polymarket_automation_rules')
        .update({ enabled: false, disabled_reason: 'max_triggers' })
        .eq('id', rule.id)
    }
  } else if (batchOutcome === 'full_failure') {
    await incrementRuleFailure(supabase, rule.id)
  }

  console.log(`[polymarket-automation] Portfolio batch ${triggerBatchId} for rule ${rule.id}: ${batchOutcome} (${statuses.length} executions)`)
}

async function handlePortfolioApproval(
  supabase: SupabaseClient,
  rule: AutomationRule,
  affectedPositions: PortfolioAffectedPosition[],
  triggerBatchId: string,
  triggerSnapshot: Record<string, unknown>,
): Promise<void> {
  // Create ONE approval request for the batch
  const { data: approval, error: approvalError } = await supabase
    .from('mc_pending_approvals')
    .insert({
      org_id: rule.org_id,
      agent_id: rule.agent_id,
      run_id: `automation-portfolio-${rule.id}`,
      tool_name: 'polymarket_automation',
      tool_args: {
        rule_id: rule.id,
        rule_type: rule.rule_type,
        scope: 'portfolio',
        trigger_batch_id: triggerBatchId,
        affected_positions: affectedPositions.map(p => ({
          conditionId: p.conditionId,
          tokenId: p.tokenId,
          outcome: p.outcome,
          exitAction: p.exitAction,
          exitAmount: p.exitAmount,
          reason: p.reason,
        })),
        trigger_snapshot: triggerSnapshot,
      },
      risk_level: 'critical',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (approvalError || !approval) {
    console.error(`[polymarket-automation] Failed to create portfolio approval for rule ${rule.id}:`, approvalError?.message)
    return
  }

  // Insert one execution row per affected position
  for (const pos of affectedPositions) {
    const { error: execError } = await supabase
      .from('polymarket_automation_executions')
      .insert({
        rule_id: rule.id,
        agent_id: rule.agent_id,
        org_id: rule.org_id,
        condition_id: pos.conditionId,
        rule_type: rule.rule_type,
        trigger_price: null,
        threshold_value: null,
        position_size: pos.exitAmount.toString(),
        status: 'pending_approval',
        approval_id: approval.id,
        trigger_batch_id: triggerBatchId,
        trigger_snapshot: triggerSnapshot,
      })

    if (execError) {
      console.warn(`[polymarket-automation] Portfolio execution insert failed for rule ${rule.id}:`, execError.message)
    }
  }

  console.log(`[polymarket-automation] Portfolio approval created for rule ${rule.id}: batch ${triggerBatchId}, ${affectedPositions.length} positions`)
}

// ── Batch Outcome Computation ─────────────────────────────────────────

export function computeBatchOutcome(statuses: AutomationExecutionStatus[]): BatchOutcome {
  const executed = statuses.filter(s => s === 'executed').length
  const failed = statuses.filter(s => s === 'failed').length

  if (failed === 0 && executed > 0) return 'full_success'
  if (executed > 0 && failed > 0) return 'partial_success'
  return 'full_failure'
}
