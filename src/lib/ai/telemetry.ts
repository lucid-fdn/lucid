/**
 * AI Telemetry
 *
 * OpenTelemetry-compatible telemetry configuration for AI SDK v6.
 * Tracks AI call metrics: latency, token usage, model, finish reason.
 *
 * The AI SDK v6 has built-in telemetry support via the `experimental_telemetry`
 * option on streamText/generateText/generateObject calls.
 *
 * @example
 * ```ts
 * import { getAITelemetry } from '@/lib/ai/telemetry'
 *
 * const result = streamText({
 *   model: getLucidModel(modelId),
 *   messages,
 *   experimental_telemetry: getAITelemetry({ userId, feature: 'chat' }),
 * })
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

interface TelemetryContext {
  /** User making the AI call */
  userId?: string
  /** Feature area (chat, workflow, embeddings, etc.) */
  feature?: string
  /** Organization for billing attribution */
  orgId?: string
  /** Model being used */
  modelId?: string
  /** Custom metadata */
  metadata?: Record<string, string>
}

interface TelemetryConfig {
  isEnabled: boolean
  functionId?: string
  metadata?: Record<string, string>
}

// ============================================================================
// TELEMETRY CONFIGURATION
// ============================================================================

/** Whether telemetry is enabled (can be toggled via env var) */
const TELEMETRY_ENABLED = process.env.AI_TELEMETRY_ENABLED !== 'false'

/**
 * Get telemetry configuration for AI SDK calls.
 *
 * Returns an object compatible with the `experimental_telemetry` option
 * on streamText(), generateText(), generateObject(), embed(), etc.
 *
 * @param ctx - Context for this AI call
 * @returns Telemetry config object for AI SDK
 */
export function getAITelemetry(ctx: TelemetryContext = {}): TelemetryConfig {
  return {
    isEnabled: TELEMETRY_ENABLED,
    functionId: ctx.feature ? `ai.${ctx.feature}` : 'ai.unknown',
    metadata: {
      ...(ctx.userId && { userId: ctx.userId }),
      ...(ctx.orgId && { orgId: ctx.orgId }),
      ...(ctx.modelId && { modelId: ctx.modelId }),
      ...(ctx.feature && { feature: ctx.feature }),
      ...ctx.metadata,
    },
  }
}

// ============================================================================
// PRESET TELEMETRY CONFIGS (convenience)
// ============================================================================

/** Telemetry for chat completions */
export function chatTelemetry(userId: string, orgId: string, modelId: string) {
  return getAITelemetry({ userId, orgId, modelId, feature: 'chat' })
}

/** Telemetry for workflow generation */
export function workflowTelemetry(userId: string, orgId: string, modelId: string) {
  return getAITelemetry({ userId, orgId, modelId, feature: 'workflow-generation' })
}

/** Telemetry for embedding generation */
export function embeddingTelemetry(userId?: string) {
  return getAITelemetry({ userId, feature: 'embeddings' })
}

/** Telemetry for memory extraction */
export function memoryTelemetry(userId?: string) {
  return getAITelemetry({ userId, feature: 'memory-extraction' })
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TELEMETRY_ENABLED, type TelemetryContext, type TelemetryConfig }