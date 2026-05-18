/**
 * Mission Control — Cost Tracker
 *
 * Tracks token usage per run and enforces cost limits.
 * - Per-run limit: abort run if exceeded
 * - Daily/monthly limit: auto-pause agent + notification
 *
 * Cost estimation uses a simple model-based rate card.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConfig } from './types.js'
import { emitNotification, ALERTS } from '../notifications/emitter.js'

// Rough cost rates per 1M tokens (USD) — conservative estimates
const COST_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'default': { input: 1.0, output: 3.0 },
}

function getRate(model: string): { input: number; output: number } {
  const lower = model.toLowerCase()
  for (const [key, rate] of Object.entries(COST_RATES)) {
    if (lower.includes(key)) return rate
  }
  return COST_RATES['default']
}

export class CostTracker {
  private runInputTokens = 0
  private runOutputTokens = 0
  private model: string
  private assistant: AssistantConfig
  private supabase: SupabaseClient

  constructor(params: {
    assistant: AssistantConfig
    supabase: SupabaseClient
  }) {
    this.assistant = params.assistant
    this.model = params.assistant.lucid_model
    this.supabase = params.supabase
  }

  /**
   * Record token usage from an LLM call within the current run.
   */
  addUsage(inputTokens: number, outputTokens: number): void {
    this.runInputTokens += inputTokens
    this.runOutputTokens += outputTokens
  }

  /**
   * Get estimated cost for the current run so far (USD).
   */
  getRunCostUsd(): number {
    const rate = getRate(this.model)
    return (
      (this.runInputTokens / 1_000_000) * rate.input +
      (this.runOutputTokens / 1_000_000) * rate.output
    )
  }

  /**
   * Check if per-run cost limit is exceeded.
   */
  isRunLimitExceeded(): boolean {
    const limit = this.assistant.cost_limit_per_run_usd
    if (!limit) return false
    return this.getRunCostUsd() > limit
  }

  /**
   * After run completes: persist to daily tracking table and check daily/monthly limits.
   * Returns { exceeded: true, type: 'daily'|'monthly' } if a limit is hit.
   */
  async persistAndCheckLimits(): Promise<{ exceeded: boolean; type?: 'daily' | 'monthly' }> {
    const orgId = this.assistant.org_id
    if (!orgId) return { exceeded: false }

    const costUsd = this.getRunCostUsd()
    if (costUsd <= 0) return { exceeded: false }

    // Upsert today's row
    const { error } = await this.supabase.rpc('mc_upsert_cost_tracking', {
      p_agent_id: this.assistant.id,
      p_org_id: orgId,
      p_tokens_input: this.runInputTokens,
      p_tokens_output: this.runOutputTokens,
      p_cost_usd: costUsd,
    })

    if (error) {
      console.error('[cost-tracker] Failed to persist cost:', error.message)
      // Fall through — don't block on persistence errors
    }

    // Check daily limit
    if (this.assistant.cost_limit_daily_usd) {
      const { data: todayRow } = await this.supabase
        .from('mc_agent_cost_tracking')
        .select('estimated_cost_usd')
        .eq('agent_id', this.assistant.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .single()

      if (todayRow && todayRow.estimated_cost_usd > this.assistant.cost_limit_daily_usd) {
        await this.pauseAgent('Daily cost limit exceeded')
        if (this.assistant.org_id) {
          void emitNotification(this.supabase, {
            orgId: this.assistant.org_id,
            ...ALERTS.costLimitExceeded(this.assistant.name ?? 'Agent', 'daily', this.assistant.cost_limit_daily_usd),
          })
        }
        return { exceeded: true, type: 'daily' }
      }
    }

    // Check monthly limit
    if (this.assistant.cost_limit_monthly_usd) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data: monthRows } = await this.supabase
        .from('mc_agent_cost_tracking')
        .select('estimated_cost_usd')
        .eq('agent_id', this.assistant.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])

      const monthTotal = (monthRows ?? []).reduce(
        (sum: number, r: { estimated_cost_usd: number }) => sum + Number(r.estimated_cost_usd),
        0
      )

      if (monthTotal > this.assistant.cost_limit_monthly_usd) {
        await this.pauseAgent('Monthly cost limit exceeded')
        if (this.assistant.org_id) {
          void emitNotification(this.supabase, {
            orgId: this.assistant.org_id,
            ...ALERTS.costLimitExceeded(this.assistant.name ?? 'Agent', 'monthly', this.assistant.cost_limit_monthly_usd),
          })
        }
        return { exceeded: true, type: 'monthly' }
      }
    }

    return { exceeded: false }
  }

  private async pauseAgent(reason: string): Promise<void> {
    console.warn(`[cost-tracker] Auto-pausing agent ${this.assistant.id}: ${reason}`)

    await this.supabase
      .from('ai_assistants')
      .update({ mc_status: 'paused' })
      .eq('id', this.assistant.id)
  }

  /**
   * Get summary for logging/metrics.
   */
  getSummary() {
    return {
      inputTokens: this.runInputTokens,
      outputTokens: this.runOutputTokens,
      estimatedCostUsd: this.getRunCostUsd(),
      model: this.model,
    }
  }
}
