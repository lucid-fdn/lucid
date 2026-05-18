/**
 * PolicyEngine — Evaluates per-assistant run budgets and policy constraints.
 *
 * Loads policy from `ai_assistants.policy_config` JSONB column.
 * Returns a PolicyDecision with budget limits for the current run.
 *
 * Phase 1A: Single LLM call, no tools.
 * Phase 2: Expands to multi-call agent loop with tool budgets.
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §2.3
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunBudget } from '../agent/types.js'

export type { RunBudget }

export interface PolicyDecision {
  allowed: boolean
  reason?: string
  budget: RunBudget
}

const DEFAULT_BUDGET: RunBudget = {
  maxLlmCalls: 15,
  maxToolCalls: 10,
  maxWallTimeMs: 60_000,
  maxOutputTokens: 4096,
}

export class PolicyEngine {
  constructor(private defaults: Partial<RunBudget> = {}) {}

  /**
   * Evaluate policy for an assistant run.
   * Merges assistant-level policy_config with system defaults.
   */
  evaluate(policyConfig: Record<string, unknown> | null): PolicyDecision {
    const merged: RunBudget = {
      maxLlmCalls: asNumber(policyConfig?.maxLlmCalls) ?? this.defaults.maxLlmCalls ?? DEFAULT_BUDGET.maxLlmCalls,
      maxToolCalls: asNumber(policyConfig?.maxToolCalls) ?? this.defaults.maxToolCalls ?? DEFAULT_BUDGET.maxToolCalls,
      maxWallTimeMs: asNumber(policyConfig?.maxWallTimeMs) ?? this.defaults.maxWallTimeMs ?? DEFAULT_BUDGET.maxWallTimeMs,
      maxOutputTokens: asNumber(policyConfig?.maxOutputTokens) ?? this.defaults.maxOutputTokens ?? DEFAULT_BUDGET.maxOutputTokens,
    }

    // Check for explicit disabled flag
    if (policyConfig?.disabled === true) {
      return {
        allowed: false,
        reason: 'Assistant is disabled via policy_config.disabled',
        budget: merged,
      }
    }

    return { allowed: true, budget: merged }
  }
}

/** Safe number coercion — returns undefined for non-numbers */
function asNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && !isNaN(val)) return val
  return undefined
}