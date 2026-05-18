/**
 * AI Context Management
 *
 * Utilities for managing conversation context window size.
 * Uses Vercel AI SDK v6 `pruneMessages()` to intelligently
 * trim conversation history to fit within model token limits.
 *
 * Why this matters:
 * - Models have fixed context windows (4K–128K tokens)
 * - Long conversations exceed limits → API errors
 * - Naive truncation loses important context
 * - pruneMessages() preserves system prompts and recent messages
 *
 * @example
 * ```ts
 * import { pruneForModel } from '@/lib/ai/context'
 *
 * // Automatically fit messages within model's context window
 * const prunedMessages = await pruneForModel(messages, 'gpt-4o')
 * ```
 */

import { pruneMessages, type ModelMessage } from 'ai'
import { getModel } from '@/lib/ai/models'

// ============================================================================
// TOKEN LIMITS PER MODEL FAMILY
// ============================================================================

/** Default max tokens if model not found in registry */
const DEFAULT_MAX_TOKENS = 4096

/** Reserve tokens for the response (don't fill context completely) */
const RESPONSE_RESERVE_TOKENS = 2048

/**
 * Get the effective context window for a model, minus response reserve.
 * Uses model registry data when available, falls back to defaults.
 */
async function getContextLimit(modelId: string): Promise<number> {
  const model = await getModel(modelId)
  const contextWindow = model?.contextWindow ?? DEFAULT_MAX_TOKENS
  return Math.max(contextWindow - RESPONSE_RESERVE_TOKENS, 1024)
}

// ============================================================================
// MESSAGE PRUNING
// ============================================================================

/**
 * Prune messages to fit within a model's context window.
 *
 * Uses AI SDK's `pruneMessages()` which:
 * - Always preserves the system message (if present)
 * - Always preserves the most recent user message
 * - Removes oldest messages first
 * - Respects tool call/result pairs (doesn't orphan them)
 *
 * @param messages - Full conversation history
 * @param modelId - Model ID to determine context limit
 * @returns Pruned messages that fit within context window
 */
export async function pruneForModel(
  messages: ModelMessage[],
  modelId: string
): Promise<ModelMessage[]> {
  const maxTokens = await getContextLimit(modelId)
  const estimated = estimateMessageTokens(messages)

  // If within limit, return as-is
  if (estimated <= maxTokens) {
    return messages
  }

  // Use SDK pruneMessages for strategy-based pruning (removes orphaned tool calls, empty messages)
  const cleaned = pruneMessages({
    messages,
    toolCalls: 'before-last-message', // Keep only recent tool calls
    emptyMessages: 'remove',          // Remove empty messages
  })

  // If still over limit after cleanup, manually truncate from oldest (keep system + recent)
  if (estimateMessageTokens(cleaned) > maxTokens) {
    return truncateToTokenLimit(cleaned, maxTokens)
  }

  return cleaned
}

/**
 * Prune messages using SDK strategy options.
 * Use for semantic pruning (tool calls, reasoning, empty messages).
 */
export function pruneByStrategy(
  messages: ModelMessage[],
  options?: {
    toolCalls?: 'all' | 'before-last-message' | 'none'
    emptyMessages?: 'keep' | 'remove'
    reasoning?: 'all' | 'before-last-message' | 'none'
  }
): ModelMessage[] {
  return pruneMessages({
    messages,
    toolCalls: options?.toolCalls ?? 'before-last-message',
    emptyMessages: options?.emptyMessages ?? 'remove',
    reasoning: options?.reasoning ?? 'before-last-message',
  })
}

/**
 * Truncate messages to fit within a token limit.
 * Preserves system message (first) and most recent messages.
 * Removes oldest non-system messages first.
 */
function truncateToTokenLimit(
  messages: ModelMessage[],
  maxTokens: number
): ModelMessage[] {
  // Separate system messages from the rest
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system')

  let systemTokens = estimateMessageTokens(systemMsgs)
  let remaining = maxTokens - systemTokens

  // Take messages from the end (most recent) until we hit the limit
  const kept: ModelMessage[] = []
  for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens([nonSystemMsgs[i]])
    if (remaining - msgTokens < 0) break
    remaining -= msgTokens
    kept.unshift(nonSystemMsgs[i])
  }

  return [...systemMsgs, ...kept]
}

// ============================================================================
// CONTEXT WINDOW UTILITIES
// ============================================================================

/**
 * Estimate token count for a string (rough approximation).
 * Uses ~4 chars per token heuristic (works for English text).
 * For exact counts, use the model's tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate total tokens across all messages.
 */
export function estimateMessageTokens(messages: ModelMessage[]): number {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ('text' in part && typeof part.text === 'string') {
          total += estimateTokens(part.text)
        }
      }
    }
    // Add overhead per message (role, formatting)
    total += 4
  }
  return total
}

/**
 * Check if messages are likely to exceed a model's context window.
 * Useful for showing a warning in the UI before sending.
 *
 * @returns { withinLimit: boolean, estimatedTokens: number, limit: number }
 */
export async function checkContextFit(
  messages: ModelMessage[],
  modelId: string
): Promise<{ withinLimit: boolean; estimatedTokens: number; limit: number }> {
  const limit = await getContextLimit(modelId)
  const estimatedTokens = estimateMessageTokens(messages)
  return {
    withinLimit: estimatedTokens <= limit,
    estimatedTokens,
    limit,
  }
}

// ============================================================================
// SYSTEM CONTEXT & PROMPT BUILDING
// ============================================================================

/**
 * Extract system context from a workspace object for AI prompts.
 * Returns a structured context object that can be used to build system prompts.
 */
export function getSystemContext(workspace: {
  org: { id: string; name: string; slug?: string };
  project?: { id: string; name: string };
  env?: { id: string; name: string };
  role?: string;
  subscription?: { plan_name?: string } | null;
}) {
  return {
    orgName: workspace.org.name,
    orgSlug: workspace.org.slug || '',
    projectName: workspace.project?.name || 'Default',
    envName: workspace.env?.name || 'Production',
    userRole: workspace.role || 'member',
    planName: (workspace.subscription as unknown as { plan_name?: string })?.plan_name || 'Free',
  }
}

/**
 * Build a complete system prompt from context and optional capabilities.
 * Creates a professional AI assistant prompt with workspace awareness.
 */
export function buildSystemPrompt(
  context: ReturnType<typeof getSystemContext>,
  options?: {
    capabilities?: string[];
    personality?: string;
    restrictions?: string[];
  }
): string {
  const parts: string[] = []

  // Core identity
  parts.push(
    `You are Lucid AI, an intelligent assistant for the "${context.orgName}" workspace on the Lucid platform.`
  )

  // Workspace context
  parts.push(
    `\nWorkspace: ${context.orgName} (${context.planName} plan)`,
    `Project: ${context.projectName}`,
    `Environment: ${context.envName}`,
  )

  // Capabilities
  if (options?.capabilities && options.capabilities.length > 0) {
    parts.push('\nYou can help with:')
    for (const cap of options.capabilities) {
      parts.push(`- ${cap}`)
    }
  }

  // Personality
  if (options?.personality) {
    parts.push(`\n${options.personality}`)
  } else {
    parts.push(
      '\nBe helpful, concise, and accurate. Use markdown formatting when appropriate. If you are unsure about something, say so.'
    )
  }

  // Restrictions
  if (options?.restrictions && options.restrictions.length > 0) {
    parts.push('\nRestrictions:')
    for (const r of options.restrictions) {
      parts.push(`- ${r}`)
    }
  }

  return parts.join('\n')
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DEFAULT_MAX_TOKENS,
  RESPONSE_RESERVE_TOKENS,
  getContextLimit,
}
