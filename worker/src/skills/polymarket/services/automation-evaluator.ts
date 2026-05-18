/**
 * Automation Rule Evaluator — Pure functions for rule evaluation.
 *
 * No I/O, no side effects. Each function takes rule config + current state
 * and returns whether the rule should trigger.
 *
 * Rule types:
 *   - stop_loss:     currentPrice <= threshold_price
 *   - take_profit:   currentPrice >= threshold_price
 *   - trailing_stop: currentPrice <= HWM * (1 - trail_percent/100)
 *   - time_exit:     now + exit_hours_before_close >= market.end_date_iso
 */

import type {
  AutomationRuleType,
  AutomationRuleConfig,
  AutomationExitAction,
  StopLossConfig,
  TakeProfitConfig,
  TrailingStopConfig,
  TimeExitConfig,
  PortfolioStopLossConfig,
  PortfolioTakeProfitConfig,
  ConcentrationGuardConfig,
  ExposureCapConfig,
  PolymarketPosition,
  PortfolioMetrics,
  PortfolioEvaluationResult,
  PortfolioAffectedPosition,
} from './types.js'

export interface EvaluationContext {
  currentPrice: number
  marketEndDate?: string // ISO date string
  highWaterMark?: number // From rule_state for trailing_stop
  now?: Date // Injectable for testing
}

export interface EvaluationResult {
  triggered: boolean
  thresholdValue: number | null
  newHighWaterMark?: number // Only set for trailing_stop when HWM changes
}

/**
 * Evaluate a single rule against current market state.
 * Pure function — no I/O, no side effects.
 */
export function evaluateRule(
  ruleType: AutomationRuleType,
  config: AutomationRuleConfig,
  ctx: EvaluationContext,
): EvaluationResult {
  switch (ruleType) {
    case 'stop_loss':
      return evaluateStopLoss(config as StopLossConfig, ctx)
    case 'take_profit':
      return evaluateTakeProfit(config as TakeProfitConfig, ctx)
    case 'trailing_stop':
      return evaluateTrailingStop(config as TrailingStopConfig, ctx)
    case 'time_exit':
      return evaluateTimeExit(config as TimeExitConfig, ctx)
    default:
      return { triggered: false, thresholdValue: null }
  }
}

function evaluateStopLoss(
  config: StopLossConfig,
  ctx: EvaluationContext,
): EvaluationResult {
  const threshold = config.threshold_price
  return {
    triggered: ctx.currentPrice <= threshold,
    thresholdValue: threshold,
  }
}

function evaluateTakeProfit(
  config: TakeProfitConfig,
  ctx: EvaluationContext,
): EvaluationResult {
  const threshold = config.threshold_price
  return {
    triggered: ctx.currentPrice >= threshold,
    thresholdValue: threshold,
  }
}

function evaluateTrailingStop(
  config: TrailingStopConfig,
  ctx: EvaluationContext,
): EvaluationResult {
  const trailPercent = config.trail_percent
  const hwm = ctx.highWaterMark ?? ctx.currentPrice
  const newHwm = Math.max(hwm, ctx.currentPrice)
  const triggerPrice = newHwm * (1 - trailPercent / 100)

  return {
    triggered: ctx.currentPrice <= triggerPrice,
    thresholdValue: triggerPrice,
    newHighWaterMark: newHwm !== hwm ? newHwm : undefined,
  }
}

function evaluateTimeExit(
  config: TimeExitConfig,
  ctx: EvaluationContext,
): EvaluationResult {
  if (!ctx.marketEndDate) {
    return { triggered: false, thresholdValue: null }
  }

  const now = ctx.now ?? new Date()
  const endDate = new Date(ctx.marketEndDate)
  const hoursBeforeClose = config.exit_hours_before_close
  const triggerTime = new Date(endDate.getTime() - hoursBeforeClose * 3600 * 1000)

  return {
    triggered: now >= triggerTime,
    thresholdValue: hoursBeforeClose,
  }
}

/**
 * Check if a rule is within cooldown period.
 * Returns true if still cooling down (should NOT trigger).
 */
export function isInCooldown(
  lastTriggeredAt: string | null,
  cooldownSeconds: number,
  now?: Date,
): boolean {
  if (!lastTriggeredAt) return false
  const elapsed = ((now ?? new Date()).getTime() - new Date(lastTriggeredAt).getTime()) / 1000
  return elapsed < cooldownSeconds
}

/**
 * Check if a rule has exceeded its maximum trigger count.
 */
export function isMaxTriggersReached(
  triggerCount: number,
  maxTriggers: number | null,
): boolean {
  if (maxTriggers === null) return false
  return triggerCount >= maxTriggers
}

/**
 * Check if a rule is in failure backoff.
 * Uses exponential backoff based on consecutive_failures and last_failed_at.
 * Backoff multiplier = 2^min(consecutiveFailures, 5) × cooldownSeconds.
 */
export function isInBackoff(
  consecutiveFailures: number,
  lastFailedAt: string | null,
  cooldownSeconds: number,
  now?: Date,
): boolean {
  if (consecutiveFailures === 0 || !lastFailedAt) return false
  const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5))
  const backoffSeconds = cooldownSeconds * multiplier
  const elapsed = ((now ?? new Date()).getTime() - new Date(lastFailedAt).getTime()) / 1000
  return elapsed < backoffSeconds
}

// ============================================================================
// Portfolio-Level Evaluation (Phase 5C) — Pure functions, no I/O
// ============================================================================

const PORTFOLIO_RULE_TYPES: AutomationRuleType[] = [
  'portfolio_stop_loss', 'portfolio_take_profit', 'concentration_guard', 'exposure_cap',
]

/** Check if a rule type is portfolio-scoped */
export function isPortfolioRuleType(ruleType: string): boolean {
  return PORTFOLIO_RULE_TYPES.includes(ruleType as AutomationRuleType)
}

/** Compute aggregate portfolio metrics from positions */
export function computePortfolioMetrics(positions: PolymarketPosition[]): PortfolioMetrics {
  let totalExposureUsd = 0
  let totalCostBasis = 0

  for (const pos of positions) {
    const size = parseFloat(pos.size)
    totalExposureUsd += size * pos.currentPrice
    totalCostBasis += size * pos.avgPrice
  }

  const totalPnlUsd = totalExposureUsd - totalCostBasis
  const totalPnlPercent = totalCostBasis > 0 ? (totalPnlUsd / totalCostBasis) * 100 : 0

  return {
    totalPnlUsd,
    totalPnlPercent,
    totalExposureUsd,
    totalCostBasis,
    positionCount: positions.length,
    positions,
  }
}

/** Derive exit action from outcome */
function exitActionForOutcome(outcome: string): AutomationExitAction {
  return outcome === 'Yes' ? 'sell_yes' : 'sell_no'
}

/** Portfolio stop-loss: triggers when totalPnlPercent <= threshold */
export function evaluatePortfolioStopLoss(
  config: PortfolioStopLossConfig,
  metrics: PortfolioMetrics,
): PortfolioEvaluationResult {
  const triggered = metrics.totalPnlPercent <= config.threshold_pnl_percent

  const triggerSnapshot = {
    totalPnlPercent: metrics.totalPnlPercent,
    totalPnlUsd: metrics.totalPnlUsd,
    totalExposureUsd: metrics.totalExposureUsd,
    threshold: config.threshold_pnl_percent,
    rule_type: 'portfolio_stop_loss',
  }

  if (!triggered) return { triggered, triggerSnapshot, affectedPositions: [] }

  // Exit ALL positions, sorted by exposure descending (largest first)
  const sorted = [...metrics.positions].sort((a, b) => {
    const aExp = parseFloat(a.size) * a.currentPrice
    const bExp = parseFloat(b.size) * b.currentPrice
    return bExp - aExp
  })

  const affectedPositions: PortfolioAffectedPosition[] = sorted.map(pos => ({
    conditionId: pos.conditionId,
    tokenId: pos.tokenId,
    outcome: pos.outcome,
    exitAction: exitActionForOutcome(pos.outcome),
    exitAmount: parseFloat(pos.size),
    reason: `Portfolio PnL ${metrics.totalPnlPercent.toFixed(1)}% <= ${config.threshold_pnl_percent}% threshold`,
  }))

  return { triggered, triggerSnapshot, affectedPositions }
}

/** Portfolio take-profit: triggers when totalPnlPercent >= threshold */
export function evaluatePortfolioTakeProfit(
  config: PortfolioTakeProfitConfig,
  metrics: PortfolioMetrics,
): PortfolioEvaluationResult {
  const triggered = metrics.totalPnlPercent >= config.threshold_pnl_percent

  const triggerSnapshot = {
    totalPnlPercent: metrics.totalPnlPercent,
    totalPnlUsd: metrics.totalPnlUsd,
    totalExposureUsd: metrics.totalExposureUsd,
    threshold: config.threshold_pnl_percent,
    rule_type: 'portfolio_take_profit',
  }

  if (!triggered) return { triggered, triggerSnapshot, affectedPositions: [] }

  // Exit ALL positions, sorted by exposure descending
  const sorted = [...metrics.positions].sort((a, b) => {
    const aExp = parseFloat(a.size) * a.currentPrice
    const bExp = parseFloat(b.size) * b.currentPrice
    return bExp - aExp
  })

  const affectedPositions: PortfolioAffectedPosition[] = sorted.map(pos => ({
    conditionId: pos.conditionId,
    tokenId: pos.tokenId,
    outcome: pos.outcome,
    exitAction: exitActionForOutcome(pos.outcome),
    exitAmount: parseFloat(pos.size),
    reason: `Portfolio PnL ${metrics.totalPnlPercent.toFixed(1)}% >= ${config.threshold_pnl_percent}% threshold`,
  }))

  return { triggered, triggerSnapshot, affectedPositions }
}

/** Concentration guard: triggers when any position > max_concentration_pct of portfolio */
export function evaluateConcentrationGuard(
  config: ConcentrationGuardConfig,
  metrics: PortfolioMetrics,
): PortfolioEvaluationResult {
  const targetPct = config.target_concentration_pct ?? (config.max_concentration_pct - 5)

  const triggerSnapshot = {
    totalExposureUsd: metrics.totalExposureUsd,
    maxConcentrationPct: config.max_concentration_pct,
    targetConcentrationPct: targetPct,
    rule_type: 'concentration_guard',
  }

  if (metrics.totalExposureUsd <= 0) {
    return { triggered: false, triggerSnapshot, affectedPositions: [] }
  }

  const affectedPositions: PortfolioAffectedPosition[] = []

  for (const pos of metrics.positions) {
    const posExposure = parseFloat(pos.size) * pos.currentPrice
    const pct = (posExposure / metrics.totalExposureUsd) * 100

    if (pct > config.max_concentration_pct) {
      const size = parseFloat(pos.size)
      const targetSize = (targetPct / pct) * size
      const exitAmount = size - targetSize

      affectedPositions.push({
        conditionId: pos.conditionId,
        tokenId: pos.tokenId,
        outcome: pos.outcome,
        exitAction: exitActionForOutcome(pos.outcome),
        exitAmount,
        reason: `Position concentration ${pct.toFixed(1)}% > ${config.max_concentration_pct}%, trimming to ${targetPct}%`,
      })
    }
  }

  return {
    triggered: affectedPositions.length > 0,
    triggerSnapshot: { ...triggerSnapshot, affectedCount: affectedPositions.length },
    affectedPositions,
  }
}

/** Exposure cap: triggers when totalExposureUsd > max_exposure_usd */
export function evaluateExposureCap(
  config: ExposureCapConfig,
  metrics: PortfolioMetrics,
): PortfolioEvaluationResult {
  const targetExposure = config.target_exposure_usd ?? config.max_exposure_usd * 0.9
  const triggered = metrics.totalExposureUsd > config.max_exposure_usd

  const triggerSnapshot = {
    totalExposureUsd: metrics.totalExposureUsd,
    maxExposureUsd: config.max_exposure_usd,
    targetExposureUsd: targetExposure,
    rule_type: 'exposure_cap',
  }

  if (!triggered) return { triggered, triggerSnapshot, affectedPositions: [] }

  // Sort by pnlPercent ascending (worst performers first)
  const sorted = [...metrics.positions].sort((a, b) => a.pnlPercent - b.pnlPercent)

  const affectedPositions: PortfolioAffectedPosition[] = []
  let projectedExposure = metrics.totalExposureUsd

  for (const pos of sorted) {
    if (projectedExposure <= targetExposure) break

    const posExposure = parseFloat(pos.size) * pos.currentPrice
    affectedPositions.push({
      conditionId: pos.conditionId,
      tokenId: pos.tokenId,
      outcome: pos.outcome,
      exitAction: exitActionForOutcome(pos.outcome),
      exitAmount: parseFloat(pos.size),
      reason: `Exposure $${metrics.totalExposureUsd.toFixed(2)} > $${config.max_exposure_usd} cap, exiting worst PnL first`,
    })

    projectedExposure -= posExposure
  }

  return { triggered, triggerSnapshot: { ...triggerSnapshot, affectedCount: affectedPositions.length }, affectedPositions }
}

/** Dispatch to the correct portfolio evaluator */
export function evaluatePortfolioRule(
  ruleType: AutomationRuleType,
  config: AutomationRuleConfig,
  metrics: PortfolioMetrics,
): PortfolioEvaluationResult {
  switch (ruleType) {
    case 'portfolio_stop_loss':
      return evaluatePortfolioStopLoss(config as PortfolioStopLossConfig, metrics)
    case 'portfolio_take_profit':
      return evaluatePortfolioTakeProfit(config as PortfolioTakeProfitConfig, metrics)
    case 'concentration_guard':
      return evaluateConcentrationGuard(config as ConcentrationGuardConfig, metrics)
    case 'exposure_cap':
      return evaluateExposureCap(config as ExposureCapConfig, metrics)
    default:
      return { triggered: false, triggerSnapshot: {}, affectedPositions: [] }
  }
}
