/**
 * Agent turn metrics — structured logging for agent performance observability.
 *
 * Logs key metrics after each agent turn to enable:
 *   - Latency analysis (prep vs agent runtime)
 *   - Token usage tracking (input/output, prompt size)
 *   - Tool cache effectiveness (hits by tool name)
 *   - Routing decisions (fast vs strong lane, Phase 5)
 *   - Prompt composition analysis (summary presence, recent turn count)
 *
 * Uses structured console.log for now. Can be wired to OTel histograms later.
 */

export interface AgentTurnMetrics {
  /** Length of the user's message in characters */
  userMessageLength: number
  /** Number of tool calls made during this turn */
  toolCallCount: number
  /** Total runtime latency in milliseconds */
  runtimeLatencyMs: number
  /** Token usage from the LLM */
  tokenUsage: { input: number; output: number }
  /** Model used for this turn */
  modelUsed: string
  /** Whether a conversation summary was present in the prompt */
  summaryPresent: boolean
  /** Number of recent turns included in the prompt */
  recentTurnCount: number
  /** Estimated total prompt size in characters */
  promptCharCount: number
  /** Tool cache hits by tool name */
  toolCacheHits: Record<string, number>
  /** Routing lane (Phase 5) */
  routingLane?: 'fast' | 'strong'
  /** Whether the request was escalated from fast to strong (Phase 5) */
  escalated?: boolean
  /** Web3 skill slug (e.g. 'lucid-web3-tools') */
  skillSlug?: string
  /** Web3 skill version */
  skillVersion?: string
}

export function logAgentTurnMetrics(params: AgentTurnMetrics): void {
  const {
    userMessageLength,
    toolCallCount,
    runtimeLatencyMs,
    tokenUsage,
    modelUsed,
    summaryPresent,
    recentTurnCount,
    promptCharCount,
    toolCacheHits,
    routingLane,
    escalated,
    skillSlug,
    skillVersion,
  } = params

  const totalCacheHits = Object.values(toolCacheHits).reduce((a, b) => a + b, 0)

  console.log(
    `[agent-metrics] turn completed`,
    JSON.stringify({
      latencyMs: runtimeLatencyMs,
      tokens: { in: tokenUsage.input, out: tokenUsage.output },
      model: modelUsed,
      msgLen: userMessageLength,
      tools: toolCallCount,
      prompt: { chars: promptCharCount, summary: summaryPresent, recentTurns: recentTurnCount },
      cache: { totalHits: totalCacheHits, ...(totalCacheHits > 0 ? { byTool: toolCacheHits } : {}) },
      ...(routingLane ? { routing: { lane: routingLane, escalated } } : {}),
      ...(skillSlug ? { skill: { slug: skillSlug, version: skillVersion } } : {}),
    }),
  )
}
