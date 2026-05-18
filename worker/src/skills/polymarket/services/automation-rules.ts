/**
 * Automation Rules CRUD — Supabase queries for rule management.
 *
 * All writes use service-role client (RLS is SELECT-only for org members).
 * Validates rule_config shape per rule_type before insert/update.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AutomationRule,
  AutomationRuleType,
  AutomationRuleScope,
  AutomationRuleConfig,
  AutomationExitAction,
  AutomationExecution,
  AutomationExecutionMode,
} from './types.js'

// ── Validation ──────────────────────────────────────────────────────

export function validateRuleConfig(
  ruleType: AutomationRuleType,
  config: Record<string, unknown>,
): string | null {
  switch (ruleType) {
    case 'stop_loss':
    case 'take_profit': {
      const threshold = config.threshold_price
      if (typeof threshold !== 'number' || threshold <= 0 || threshold >= 1) {
        return 'threshold_price must be a number between 0 and 1 (exclusive)'
      }
      return null
    }
    case 'trailing_stop': {
      const trail = config.trail_percent
      if (typeof trail !== 'number' || trail <= 0 || trail >= 100) {
        return 'trail_percent must be a number between 0 and 100 (exclusive)'
      }
      return null
    }
    case 'time_exit': {
      const hours = config.exit_hours_before_close
      if (typeof hours !== 'number' || hours <= 0) {
        return 'exit_hours_before_close must be a positive number'
      }
      return null
    }
    case 'portfolio_stop_loss': {
      const threshold = config.threshold_pnl_percent
      if (typeof threshold !== 'number' || threshold >= 0) {
        return 'threshold_pnl_percent must be a negative number for portfolio_stop_loss'
      }
      return null
    }
    case 'portfolio_take_profit': {
      const threshold = config.threshold_pnl_percent
      if (typeof threshold !== 'number' || threshold <= 0) {
        return 'threshold_pnl_percent must be a positive number for portfolio_take_profit'
      }
      return null
    }
    case 'concentration_guard': {
      const max = config.max_concentration_pct
      if (typeof max !== 'number' || max < 1 || max > 99) {
        return 'max_concentration_pct must be between 1 and 99'
      }
      const target = config.target_concentration_pct
      if (target !== undefined) {
        if (typeof target !== 'number' || target < 1 || target > 99) {
          return 'target_concentration_pct must be between 1 and 99'
        }
        if (target >= max) {
          return 'target_concentration_pct must be less than max_concentration_pct'
        }
      }
      return null
    }
    case 'exposure_cap': {
      const max = config.max_exposure_usd
      if (typeof max !== 'number' || max <= 0) {
        return 'max_exposure_usd must be a positive number'
      }
      const target = config.target_exposure_usd
      if (target !== undefined) {
        if (typeof target !== 'number' || target <= 0) {
          return 'target_exposure_usd must be a positive number'
        }
        if (target >= max) {
          return 'target_exposure_usd must be less than max_exposure_usd'
        }
      }
      return null
    }
    default:
      return `Unknown rule_type: ${ruleType}`
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────

export interface CreateRuleParams {
  agentId: string
  orgId: string
  conditionId: string
  tokenId: string
  outcome: string
  ruleType: AutomationRuleType
  ruleConfig: AutomationRuleConfig
  exitAction: AutomationExitAction
  exitAmountPct?: number
  cooldownSeconds?: number
  maxTriggers?: number | null
  initialHighWaterMark?: number
  executionMode?: AutomationExecutionMode
}

export const AUTOMATION_RULE_COLUMNS = [
  'id',
  'agent_id',
  'org_id',
  'scope',
  'condition_id',
  'token_id',
  'outcome',
  'rule_type',
  'rule_config',
  'rule_state',
  'exit_action',
  'exit_amount_pct',
  'enabled',
  'disabled_reason',
  'cooldown_seconds',
  'max_triggers',
  'trigger_count',
  'last_triggered_at',
  'execution_mode',
  'consecutive_failures',
  'last_failed_at',
  'created_at',
  'updated_at',
].join(', ')

export const AUTOMATION_EXECUTION_COLUMNS = [
  'id',
  'rule_id',
  'agent_id',
  'org_id',
  'condition_id',
  'rule_type',
  'trigger_price',
  'threshold_value',
  'position_size',
  'status',
  'trade_result',
  'approval_id',
  'error_message',
  'execution_key',
  'trigger_batch_id',
  'trigger_snapshot',
  'created_at',
].join(', ')

export async function createRule(
  supabase: SupabaseClient,
  params: CreateRuleParams,
): Promise<{ data: AutomationRule | null; error: string | null }> {
  const validationError = validateRuleConfig(params.ruleType, params.ruleConfig as unknown as Record<string, unknown>)
  if (validationError) return { data: null, error: validationError }

  const ruleState: Record<string, unknown> = {}
  if (params.ruleType === 'trailing_stop' && params.initialHighWaterMark !== undefined) {
    ruleState.high_water_mark = params.initialHighWaterMark
  }

  const { data, error } = await supabase
    .from('polymarket_automation_rules')
    .insert({
      agent_id: params.agentId,
      org_id: params.orgId,
      condition_id: params.conditionId,
      token_id: params.tokenId,
      outcome: params.outcome,
      rule_type: params.ruleType,
      rule_config: params.ruleConfig,
      rule_state: ruleState,
      exit_action: params.exitAction,
      exit_amount_pct: params.exitAmountPct ?? 100.0,
      cooldown_seconds: params.cooldownSeconds ?? 300,
      max_triggers: params.maxTriggers ?? null,
      execution_mode: params.executionMode ?? 'approval',
    })
    .select(AUTOMATION_RULE_COLUMNS)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as unknown as AutomationRule, error: null }
}

export interface CreatePortfolioRuleParams {
  agentId: string
  orgId: string
  ruleType: AutomationRuleType
  ruleConfig: AutomationRuleConfig
  cooldownSeconds?: number
  maxTriggers?: number | null
  executionMode?: AutomationExecutionMode
}

export async function createPortfolioRule(
  supabase: SupabaseClient,
  params: CreatePortfolioRuleParams,
): Promise<{ data: AutomationRule | null; error: string | null }> {
  const validationError = validateRuleConfig(params.ruleType, params.ruleConfig as unknown as Record<string, unknown>)
  if (validationError) return { data: null, error: validationError }

  const { data, error } = await supabase
    .from('polymarket_automation_rules')
    .insert({
      agent_id: params.agentId,
      org_id: params.orgId,
      scope: 'portfolio' as AutomationRuleScope,
      condition_id: null,
      token_id: null,
      outcome: null,
      rule_type: params.ruleType,
      rule_config: params.ruleConfig,
      rule_state: {},
      exit_action: null,
      exit_amount_pct: 100.0,
      cooldown_seconds: params.cooldownSeconds ?? 300,
      max_triggers: params.maxTriggers ?? null,
      execution_mode: params.executionMode ?? 'approval',
    })
    .select(AUTOMATION_RULE_COLUMNS)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as unknown as AutomationRule, error: null }
}

export async function listRules(
  supabase: SupabaseClient,
  agentId: string,
  enabledOnly = false,
): Promise<AutomationRule[]> {
  let query = supabase
    .from('polymarket_automation_rules')
    .select(AUTOMATION_RULE_COLUMNS)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  if (enabledOnly) {
    query = query.eq('enabled', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('[automation-rules] listRules error:', error.message)
    return []
  }
  return (data ?? []) as unknown as AutomationRule[]
}

export async function updateRule(
  supabase: SupabaseClient,
  ruleId: string,
  agentId: string,
  updates: {
    enabled?: boolean
    disabled_reason?: string | null
    rule_config?: AutomationRuleConfig
    exit_amount_pct?: number
    cooldown_seconds?: number
    max_triggers?: number | null
    execution_mode?: AutomationExecutionMode
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('polymarket_automation_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', ruleId)
    .eq('agent_id', agentId)

  return { error: error?.message ?? null }
}

export async function deleteRule(
  supabase: SupabaseClient,
  ruleId: string,
  agentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('polymarket_automation_rules')
    .delete()
    .eq('id', ruleId)
    .eq('agent_id', agentId)

  return { error: error?.message ?? null }
}

export async function listExecutions(
  supabase: SupabaseClient,
  agentId: string,
  limit = 20,
): Promise<AutomationExecution[]> {
  const { data, error } = await supabase
    .from('polymarket_automation_executions')
    .select(AUTOMATION_EXECUTION_COLUMNS)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[automation-rules] listExecutions error:', error.message)
    return []
  }
  return (data ?? []) as unknown as AutomationExecution[]
}

/**
 * Update rule_state (e.g., trailing_stop HWM).
 * Uses service-role Supabase — no RLS restrictions.
 */
export async function updateRuleState(
  supabase: SupabaseClient,
  ruleId: string,
  ruleState: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('polymarket_automation_rules')
    .update({ rule_state: ruleState, updated_at: new Date().toISOString() })
    .eq('id', ruleId)

  if (error) {
    console.error('[automation-rules] updateRuleState error:', error.message)
  }
}
