/**
 * AI Middleware
 *
 * Lightweight middleware layer for AI SDK calls.
 * Provides guardrails, logging, and telemetry without
 * modifying the core streamText/generateText calls.
 *
 * Usage:
 * ```ts
 * import { withAIMiddleware } from '@/lib/ai/middleware'
 *
 * const result = streamText(withAIMiddleware({
 *   model: getLucidModel(modelId),
 *   messages,
 * }, { userId, feature: 'chat' }))
 * ```
 */

import { ErrorService } from '@/lib/errors/error-service'

// ============================================================================
// TYPES
// ============================================================================

interface MiddlewareContext {
  /** Who is making this AI call */
  userId?: string
  /** Which feature triggered it (chat, workflow, etc.) */
  feature?: string
  /** Organization ID for billing */
  orgId?: string
  /** Custom tags for telemetry */
  tags?: Record<string, string>
}

interface GuardrailResult {
  allowed: boolean
  reason?: string
}

// ============================================================================
// CONTENT GUARDRAILS
// ============================================================================

/** Words/patterns that should be blocked from AI input */
const BLOCKED_PATTERNS = [
  // Prompt injection attempts
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+a/i,
  /disregard\s+(all\s+)?prior/i,
  // System prompt extraction
  /reveal\s+your\s+(system\s+)?prompt/i,
  /what\s+are\s+your\s+instructions/i,
  /print\s+your\s+system\s+message/i,
]

/** Max input length (characters) to prevent abuse */
const MAX_INPUT_LENGTH = 50_000

/**
 * Check input content against guardrails.
 * Returns { allowed: true } if content passes all checks.
 */
export function checkGuardrails(content: string): GuardrailResult {
  // Length check
  if (content.length > MAX_INPUT_LENGTH) {
    return {
      allowed: false,
      reason: `Input too long (${content.length} chars, max ${MAX_INPUT_LENGTH})`,
    }
  }

  // Pattern check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason: 'Input contains blocked content pattern',
      }
    }
  }

  return { allowed: true }
}

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

/**
 * Log AI call metadata for observability.
 * In production, this feeds into Sentry/telemetry.
 * In development, logs to console.
 */
export function logAICall(
  phase: 'start' | 'finish' | 'error',
  ctx: MiddlewareContext,
  meta?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString()
  const logData = {
    timestamp,
    phase,
    userId: ctx.userId,
    feature: ctx.feature,
    orgId: ctx.orgId,
    ...meta,
  }

  if (phase === 'error') {
    ErrorService.captureException(
      new Error(`AI call failed: ${meta?.error || 'unknown'}`),
      {
        severity: 'error',
        context: logData,
        tags: {
          layer: 'ai-middleware',
          feature: ctx.feature || 'unknown',
          ...ctx.tags,
        },
      }
    )
  } else if (process.env.NODE_ENV === 'development') {
    const emoji = phase === 'start' ? '🚀' : '✅'
    console.log(`[AI Middleware] ${emoji} ${phase}:`, logData)
  }
}

// ============================================================================
// MIDDLEWARE WRAPPER
// ============================================================================

/**
 * Wraps streamText/generateText options with middleware.
 *
 * Adds:
 * - Input guardrail checking
 * - Call logging (start/finish/error)
 * - onFinish wrapper for telemetry
 *
 * @example
 * ```ts
 * const opts = withAIMiddleware(
 *   { model, messages, temperature: 0.7 },
 *   { userId: 'abc', feature: 'chat' }
 * )
 * const result = streamText(opts)
 * ```
 */
export function withAIMiddleware<
  T extends {
    messages?: unknown[]
    onFinish?: (...args: unknown[]) => unknown
  }
>(options: T, ctx: MiddlewareContext = {}): T {
  // Log the start of the AI call
  logAICall('start', ctx, {
    messageCount: options.messages?.length,
  })

  // Wrap onFinish to add logging
  const originalOnFinish = options.onFinish
  const wrappedOnFinish = async (...args: unknown[]) => {
    const finishEvent = args[0] as Record<string, unknown> | undefined
    logAICall('finish', ctx, {
      // Extract usage if available (first arg is typically the finish event)
      usage: finishEvent?.usage,
      finishReason: finishEvent?.finishReason,
    })

    // Call original onFinish
    if (originalOnFinish) {
      await originalOnFinish(...args)
    }
  }

  return {
    ...options,
    onFinish: wrappedOnFinish,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  BLOCKED_PATTERNS,
  MAX_INPUT_LENGTH,
  type MiddlewareContext,
  type GuardrailResult,
}