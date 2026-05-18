/**
 * polymarket_automation — Rule-based protective alerts for Polymarket positions.
 *
 * 5 actions:
 *   - list_rules: List automation rules for this agent
 *   - list_executions: List recent execution history
 *   - create_rule: Create a new automation rule
 *   - update_rule: Update an existing rule (enable/disable, config)
 *   - delete_rule: Delete a rule
 *
 * Capability check:
 *   - list_rules, list_executions → read:predictions_automation
 *   - create_rule, update_rule, delete_rule → manage:predictions_automation
 *
 * Registered as 'read' lane (no wallet signing needed).
 * Action-level capability check within the handler.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createRule,
  createPortfolioRule,
  listRules,
  updateRule,
  deleteRule,
  listExecutions,
} from '../services/automation-rules.js'
import { getPositions } from '../services/position-aggregator.js'
import { getMarket } from '../services/clob-client.js'
import { isPortfolioRuleType } from '../services/automation-evaluator.js'
import type { AutomationRuleType, AutomationExitAction, AutomationExecutionMode } from '../services/types.js'

interface AutomationArgs {
  action: string
  rule_id?: string
  condition_id?: string
  rule_type?: string
  threshold_price?: number
  trail_percent?: number
  exit_hours_before_close?: number
  exit_action?: string
  exit_amount_pct?: number
  cooldown_seconds?: number
  max_triggers?: number
  enabled?: boolean
  execution_mode?: string
  // Portfolio rule params (Phase 5C)
  threshold_pnl_percent?: number
  max_concentration_pct?: number
  target_concentration_pct?: number
  max_exposure_usd?: number
  target_exposure_usd?: number
}

/**
 * Check if the agent has a specific capability.
 * Returns true if no policy config (backwards compat) or capability is granted.
 */
function hasCapability(
  policyConfig: Record<string, unknown> | null,
  capability: string,
): boolean {
  if (!policyConfig) return true // No policy = all allowed (backwards compat)
  const capabilities = policyConfig.capabilities as string[] | undefined
  if (!capabilities) return true // No capabilities array = all allowed
  return capabilities.includes(capability)
}

export async function toolPolymarketAutomation(
  args: unknown,
  assistantId: string,
  orgId: string,
  supabase: SupabaseClient,
  policyConfig: Record<string, unknown> | null,
): Promise<string> {
  try {
    const { action, ...rest } = (args ?? {}) as AutomationArgs

    if (!action) {
      return JSON.stringify({ error: 'action is required' })
    }

    // Action-level capability checks
    const readActions = ['list_rules', 'list_executions']
    const writeActions = ['create_rule', 'update_rule', 'delete_rule']

    if (readActions.includes(action)) {
      if (!hasCapability(policyConfig, 'read:predictions_automation')) {
        return JSON.stringify({ error: 'Missing capability: read:predictions_automation' })
      }
    } else if (writeActions.includes(action)) {
      if (!hasCapability(policyConfig, 'manage:predictions_automation')) {
        return JSON.stringify({ error: 'Missing capability: manage:predictions_automation' })
      }
    } else {
      return JSON.stringify({ error: `Unknown action: ${action}` })
    }

    switch (action) {
      case 'list_rules':
        return handleListRules(supabase, assistantId)
      case 'list_executions':
        return handleListExecutions(supabase, assistantId)
      case 'create_rule':
        return handleCreateRule(supabase, assistantId, orgId, rest, policyConfig)
      case 'update_rule':
        return handleUpdateRule(supabase, assistantId, rest, policyConfig)
      case 'delete_rule':
        return handleDeleteRule(supabase, assistantId, rest)
      default:
        return JSON.stringify({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: `Unexpected error: ${message}` })
  }
}

async function handleListRules(
  supabase: SupabaseClient,
  agentId: string,
): Promise<string> {
  const rules = await listRules(supabase, agentId)
  return JSON.stringify({
    ok: true,
    rules: rules.map(r => ({
      id: r.id,
      scope: r.scope,
      condition_id: r.condition_id,
      token_id: r.token_id,
      outcome: r.outcome,
      rule_type: r.rule_type,
      rule_config: r.rule_config,
      exit_action: r.exit_action,
      exit_amount_pct: r.exit_amount_pct,
      enabled: r.enabled,
      disabled_reason: r.disabled_reason,
      trigger_count: r.trigger_count,
      max_triggers: r.max_triggers,
      cooldown_seconds: r.cooldown_seconds,
      execution_mode: r.execution_mode,
      consecutive_failures: r.consecutive_failures,
      last_failed_at: r.last_failed_at,
      created_at: r.created_at,
    })),
    count: rules.length,
  })
}

async function handleListExecutions(
  supabase: SupabaseClient,
  agentId: string,
): Promise<string> {
  const executions = await listExecutions(supabase, agentId)
  return JSON.stringify({
    ok: true,
    executions: executions.map(e => ({
      id: e.id,
      rule_id: e.rule_id,
      rule_type: e.rule_type,
      condition_id: e.condition_id,
      status: e.status,
      trigger_price: e.trigger_price,
      threshold_value: e.threshold_value,
      position_size: e.position_size,
      trade_result: e.trade_result,
      error_message: e.error_message,
      execution_key: e.execution_key,
      trigger_batch_id: e.trigger_batch_id,
      trigger_snapshot: e.trigger_snapshot,
      created_at: e.created_at,
    })),
    count: executions.length,
  })
}

async function handleCreateRule(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  args: Omit<AutomationArgs, 'action'>,
  policyConfig: Record<string, unknown> | null,
): Promise<string> {
  const { rule_type } = args

  if (!rule_type) {
    return JSON.stringify({ error: 'rule_type is required (stop_loss, take_profit, trailing_stop, time_exit, portfolio_stop_loss, portfolio_take_profit, concentration_guard, exposure_cap)' })
  }

  // Validate execution_mode
  const executionMode = (args.execution_mode ?? 'approval') as AutomationExecutionMode
  if (executionMode !== 'approval' && executionMode !== 'auto_execute') {
    return JSON.stringify({ error: 'execution_mode must be "approval" or "auto_execute"' })
  }

  // Branch: portfolio vs position rules
  if (isPortfolioRuleType(rule_type)) {
    return handleCreatePortfolioRule(supabase, agentId, orgId, args, policyConfig, executionMode)
  }

  return handleCreatePositionRule(supabase, agentId, orgId, args, policyConfig, executionMode)
}

async function handleCreatePortfolioRule(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  args: Omit<AutomationArgs, 'action'>,
  policyConfig: Record<string, unknown> | null,
  executionMode: AutomationExecutionMode,
): Promise<string> {
  const { rule_type } = args

  // Build portfolio rule config
  const ruleConfig = buildRuleConfig(rule_type! as AutomationRuleType, args)
  if ('error' in ruleConfig) {
    return JSON.stringify({ error: ruleConfig.error })
  }

  // Capability gate: auto_execute on portfolio requires execute:predictions_portfolio
  if (executionMode === 'auto_execute') {
    if (!hasCapability(policyConfig, 'execute:predictions_portfolio')) {
      return JSON.stringify({ error: 'Missing capability: execute:predictions_portfolio (required for auto_execute on portfolio rules)' })
    }
  }

  const result = await createPortfolioRule(supabase, {
    agentId,
    orgId,
    ruleType: rule_type! as AutomationRuleType,
    ruleConfig: ruleConfig as any,
    cooldownSeconds: args.cooldown_seconds,
    maxTriggers: args.max_triggers ?? null,
    executionMode,
  })

  if (result.error) {
    return JSON.stringify({ error: result.error })
  }

  const modeMessage = executionMode === 'auto_execute'
    ? 'Portfolio rule created with auto-execution. Trades execute immediately on trigger — no approval needed.'
    : 'Portfolio rule created. The cron will evaluate this rule every 60s and request approval before executing.'

  return JSON.stringify({
    ok: true,
    rule: {
      id: result.data!.id,
      scope: result.data!.scope,
      rule_type: result.data!.rule_type,
      rule_config: result.data!.rule_config,
      enabled: result.data!.enabled,
      execution_mode: result.data!.execution_mode,
    },
    message: modeMessage,
  })
}

async function handleCreatePositionRule(
  supabase: SupabaseClient,
  agentId: string,
  orgId: string,
  args: Omit<AutomationArgs, 'action'>,
  policyConfig: Record<string, unknown> | null,
  executionMode: AutomationExecutionMode,
): Promise<string> {
  const { condition_id, rule_type, exit_action } = args

  if (!condition_id) {
    return JSON.stringify({ error: 'condition_id is required' })
  }
  if (!exit_action) {
    return JSON.stringify({ error: 'exit_action is required (sell_yes, sell_no)' })
  }

  // Build rule_config from args
  const ruleConfig = buildRuleConfig(rule_type! as AutomationRuleType, args)
  if ('error' in ruleConfig) {
    return JSON.stringify({ error: ruleConfig.error })
  }

  // Resolve token_id and outcome from position data
  let tokenId: string | undefined
  let outcome: string | undefined

  try {
    const positions = await getPositions(supabase, agentId)
    const matchingPos = positions.find(p => p.conditionId === condition_id)
    if (matchingPos) {
      tokenId = matchingPos.tokenId
      outcome = matchingPos.outcome
    }
  } catch {
    // Position lookup failed — require explicit token_id below
  }

  if (!tokenId || !outcome) {
    // Try to resolve from market data
    try {
      const market = await getMarket(condition_id)
      if (market) {
        // Default to Yes outcome if exit_action is sell_yes, else No
        const targetOutcome = exit_action === 'sell_yes' ? 'Yes' : 'No'
        const token = market.tokens.find(t => t.outcome === targetOutcome)
        if (token) {
          tokenId = token.token_id
          outcome = token.outcome
        }
      }
    } catch {
      // Market lookup failed
    }
  }

  if (!tokenId || !outcome) {
    return JSON.stringify({ error: 'Could not resolve token_id/outcome. Ensure you have a position on this market or the market exists.' })
  }

  // For trailing_stop, initialize HWM from current price
  let initialHighWaterMark: number | undefined
  if (rule_type === 'trailing_stop') {
    try {
      const positions = await getPositions(supabase, agentId)
      const pos = positions.find(p => p.conditionId === condition_id && p.tokenId === tokenId)
      if (pos) {
        initialHighWaterMark = pos.currentPrice
      }
    } catch {
      // Will use current price at first evaluation
    }
  }

  // Capability gate: auto_execute requires execute:predictions_automation
  if (executionMode === 'auto_execute') {
    if (!hasCapability(policyConfig, 'execute:predictions_automation')) {
      return JSON.stringify({ error: 'Missing capability: execute:predictions_automation (required for auto_execute mode)' })
    }
  }

  const result = await createRule(supabase, {
    agentId,
    orgId,
    conditionId: condition_id!,
    tokenId,
    outcome,
    ruleType: rule_type! as AutomationRuleType,
    ruleConfig: ruleConfig as any,
    exitAction: exit_action as AutomationExitAction,
    exitAmountPct: args.exit_amount_pct,
    cooldownSeconds: args.cooldown_seconds,
    maxTriggers: args.max_triggers ?? null,
    initialHighWaterMark,
    executionMode,
  })

  if (result.error) {
    return JSON.stringify({ error: result.error })
  }

  const modeMessage = executionMode === 'auto_execute'
    ? 'Rule created with auto-execution. Trades execute immediately on trigger — no approval needed.'
    : 'Rule created. The cron will evaluate this rule every 60s and request approval before executing any exit.'

  return JSON.stringify({
    ok: true,
    rule: {
      id: result.data!.id,
      rule_type: result.data!.rule_type,
      rule_config: result.data!.rule_config,
      exit_action: result.data!.exit_action,
      exit_amount_pct: result.data!.exit_amount_pct,
      enabled: result.data!.enabled,
      execution_mode: result.data!.execution_mode,
    },
    message: modeMessage,
  })
}

async function handleUpdateRule(
  supabase: SupabaseClient,
  agentId: string,
  args: Omit<AutomationArgs, 'action'>,
  policyConfig: Record<string, unknown> | null,
): Promise<string> {
  if (!args.rule_id) {
    return JSON.stringify({ error: 'rule_id is required' })
  }

  const updates: Record<string, unknown> = {}
  if (args.enabled !== undefined) {
    updates.enabled = args.enabled
    updates.disabled_reason = args.enabled ? null : 'user'
  }
  if (args.exit_amount_pct !== undefined) updates.exit_amount_pct = args.exit_amount_pct
  if (args.cooldown_seconds !== undefined) updates.cooldown_seconds = args.cooldown_seconds
  if (args.max_triggers !== undefined) updates.max_triggers = args.max_triggers

  if (args.execution_mode !== undefined) {
    if (args.execution_mode !== 'approval' && args.execution_mode !== 'auto_execute') {
      return JSON.stringify({ error: 'execution_mode must be "approval" or "auto_execute"' })
    }
    if (args.execution_mode === 'auto_execute') {
      // Load rule to determine scope-specific capability
      const { data: existingRule } = await supabase
        .from('polymarket_automation_rules')
        .select('scope')
        .eq('id', args.rule_id)
        .eq('agent_id', agentId)
        .single()

      const requiredCap = existingRule?.scope === 'portfolio'
        ? 'execute:predictions_portfolio'
        : 'execute:predictions_automation'

      if (!hasCapability(policyConfig, requiredCap)) {
        return JSON.stringify({ error: `Missing capability: ${requiredCap} (required for auto_execute mode)` })
      }
    }
    updates.execution_mode = args.execution_mode
  }

  const result = await updateRule(supabase, args.rule_id, agentId, updates)
  if (result.error) {
    return JSON.stringify({ error: result.error })
  }

  return JSON.stringify({ ok: true, message: 'Rule updated' })
}

async function handleDeleteRule(
  supabase: SupabaseClient,
  agentId: string,
  args: Omit<AutomationArgs, 'action'>,
): Promise<string> {
  if (!args.rule_id) {
    return JSON.stringify({ error: 'rule_id is required' })
  }

  const result = await deleteRule(supabase, args.rule_id, agentId)
  if (result.error) {
    return JSON.stringify({ error: result.error })
  }

  return JSON.stringify({ ok: true, message: 'Rule deleted' })
}

function buildRuleConfig(
  ruleType: AutomationRuleType,
  args: Omit<AutomationArgs, 'action'>,
): Record<string, unknown> | { error: string } {
  switch (ruleType) {
    case 'stop_loss':
      if (args.threshold_price === undefined) return { error: 'threshold_price is required for stop_loss' }
      return { threshold_price: args.threshold_price }
    case 'take_profit':
      if (args.threshold_price === undefined) return { error: 'threshold_price is required for take_profit' }
      return { threshold_price: args.threshold_price }
    case 'trailing_stop':
      if (args.trail_percent === undefined) return { error: 'trail_percent is required for trailing_stop' }
      return { trail_percent: args.trail_percent }
    case 'time_exit':
      if (args.exit_hours_before_close === undefined) return { error: 'exit_hours_before_close is required for time_exit' }
      return { exit_hours_before_close: args.exit_hours_before_close }
    case 'portfolio_stop_loss':
      if (args.threshold_pnl_percent === undefined) return { error: 'threshold_pnl_percent is required for portfolio_stop_loss' }
      return { threshold_pnl_percent: args.threshold_pnl_percent }
    case 'portfolio_take_profit':
      if (args.threshold_pnl_percent === undefined) return { error: 'threshold_pnl_percent is required for portfolio_take_profit' }
      return { threshold_pnl_percent: args.threshold_pnl_percent }
    case 'concentration_guard': {
      if (args.max_concentration_pct === undefined) return { error: 'max_concentration_pct is required for concentration_guard' }
      const config: Record<string, unknown> = { max_concentration_pct: args.max_concentration_pct }
      if (args.target_concentration_pct !== undefined) config.target_concentration_pct = args.target_concentration_pct
      return config
    }
    case 'exposure_cap': {
      if (args.max_exposure_usd === undefined) return { error: 'max_exposure_usd is required for exposure_cap' }
      const config: Record<string, unknown> = { max_exposure_usd: args.max_exposure_usd }
      if (args.target_exposure_usd !== undefined) config.target_exposure_usd = args.target_exposure_usd
      return config
    }
    default:
      return { error: `Unknown rule_type: ${ruleType}` }
  }
}
