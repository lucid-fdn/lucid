/**
 * ToolExecutionGuard — Mid-run policy enforcement wrapper.
 *
 * Wraps tool registry + provider client to enforce budgets and allowlists
 * DURING agent execution (not just pre-run).
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §4
 */

import type { RunBudget } from './PolicyEngine.js'
import { CommandsAllowlist } from '../agent/CommandsAllowlist.js'

export interface ExecutionMetrics {
  llmCallsUsed: number
  toolCallsUsed: number
  startTimeMs: number
  totalOutputTokens: number
}

export interface GuardResult {
  allowed: boolean
  reason?: string
  metricsSnapshot: ExecutionMetrics
}

export class ToolExecutionGuard {
  private metrics: ExecutionMetrics

  constructor(
    private budget: RunBudget,
    private allowlist: CommandsAllowlist
  ) {
    this.metrics = {
      llmCallsUsed: 0,
      toolCallsUsed: 0,
      startTimeMs: Date.now(),
      totalOutputTokens: 0,
    }
  }

  /** Check if an LLM call is within budget. Call BEFORE each LLM invocation. */
  beforeLlmCall(): GuardResult {
    const elapsed = Date.now() - this.metrics.startTimeMs
    if (elapsed >= this.budget.maxWallTimeMs) {
      return this.deny(`Wall time budget exhausted (${elapsed}ms >= ${this.budget.maxWallTimeMs}ms)`)
    }
    if (this.metrics.llmCallsUsed >= this.budget.maxLlmCalls) {
      return this.deny(`LLM call budget exhausted (${this.metrics.llmCallsUsed} >= ${this.budget.maxLlmCalls})`)
    }
    this.metrics.llmCallsUsed++
    return this.allow()
  }

  /** Track output tokens after an LLM call. */
  afterLlmCall(outputTokens: number): GuardResult {
    this.metrics.totalOutputTokens += outputTokens
    const maxOutput = this.budget.maxOutputTokens ?? Infinity
    if (this.metrics.totalOutputTokens > maxOutput) {
      return this.deny(
        `Output token budget exceeded (${this.metrics.totalOutputTokens} > ${maxOutput})`
      )
    }
    return this.allow()
  }

  /** Check if a tool call is allowed AND within budget. */
  beforeToolCall(toolName: string): GuardResult {
    const elapsed = Date.now() - this.metrics.startTimeMs
    if (elapsed >= this.budget.maxWallTimeMs) {
      return this.deny(`Wall time budget exhausted before tool call (${elapsed}ms)`)
    }
    const validationError = this.allowlist.validate(toolName)
    if (validationError) {
      return this.deny(validationError)
    }
    if (this.metrics.toolCallsUsed >= this.budget.maxToolCalls) {
      return this.deny(`Tool call budget exhausted (${this.metrics.toolCallsUsed} >= ${this.budget.maxToolCalls})`)
    }
    this.metrics.toolCallsUsed++
    return this.allow()
  }

  /** Get current execution metrics snapshot */
  getMetrics(): ExecutionMetrics {
    return { ...this.metrics }
  }

  /** Check if any budget is exhausted */
  isBudgetExhausted(): boolean {
    const elapsed = Date.now() - this.metrics.startTimeMs
    return (
      this.metrics.llmCallsUsed >= this.budget.maxLlmCalls ||
      this.metrics.toolCallsUsed >= this.budget.maxToolCalls ||
      elapsed >= this.budget.maxWallTimeMs ||
      this.metrics.totalOutputTokens >= (this.budget.maxOutputTokens ?? Infinity)
    )
  }

  private allow(): GuardResult {
    return { allowed: true, metricsSnapshot: { ...this.metrics } }
  }

  private deny(reason: string): GuardResult {
    return { allowed: false, reason, metricsSnapshot: { ...this.metrics } }
  }
}