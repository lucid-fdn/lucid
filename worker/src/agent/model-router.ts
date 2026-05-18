/**
 * Deterministic model routing — fast lane for simple queries, strong lane for complex.
 *
 * Routes simple read-only queries (balance, price, search) to a cheaper/faster model
 * while keeping complex analysis, planning, and execution on the strong model.
 *
 * Activated when assistant's model is set to 'lucid-auto'.
 * Users opt in via the "Lucid Auto" option in the model selector.
 *
 * Design principles:
 *   - Default to strong lane when uncertain (conservative)
 *   - Never downgrade execution/planning/comparison requests
 *   - Hard allowlist for fast lane (only specific tool-dispatch patterns)
 *   - Pattern matching is intentionally simple — avoid false positives
 */

export interface RouteResult {
  model: string
  lane: 'fast' | 'strong'
  reason: string
}

// Tools eligible for fast lane (read-only, single-tool dispatch)
const FAST_LANE_TOOLS = new Set([
  'wallet_balance',
  'get_price',
  'search_token',
  'get_portfolio',
  'wallet_history',
])

// Patterns that suggest a fast-lane query
const FAST_LANE_PATTERNS = [
  /^(?:what(?:'s| is) (?:the )?(?:price|balance|value))/i,
  /^(?:check|show|get|look up) (?:my )?(?:balance|portfolio|wallet)/i,
  /^(?:price of|how much is) /i,
  /^(?:find|search|search for|look up) (?:token|coin) /i,
  /^(?:what is|what's) [A-Z]{2,10}\??$/i,  // "what is SOL?" / "what's ETH?"
]

// Patterns that MUST stay on strong lane (never downgrade)
const STRONG_LANE_PATTERNS = [
  /\b(?:compare|analyze|analysis|plan|strategy|rebalance|diversif)/i,
  /\b(?:explain|why|how does|what if|should i|recommend)/i,
  /\b(?:swap|transfer|send|buy|sell|trade|execute|place order)/i,
  /\b(?:risk|leverage|margin|liquidat|stop.?loss|limit.?order|dca)/i,
  /\bhedg/i,
  /\b(?:prediction\s*market|polymarket|wager|odds\s+on|outcome\s+token|resolution\s+date)/i,
  /\b(?:place|make|want)\s+(?:a\s+)?bet\b/i,
  /\b(?:portfolio.*(?:risk|allocation|optimize|rebalance))/i,
]

// Tools that must NEVER route to fast lane
export const STRONG_LANE_TOOLS = new Set([
  'risk_check',
  'limit_order',
  'dca_create',
  'stop_loss',
  'dex_swap',
  'wallet_transfer',
  'hl_place_order',
  'hl_cancel_order',
  'hl_deposit',
  'hl_withdraw',
  'bridge',
  'lucid_hedge',
  'polymarket_trade',
])

export function routeModel(
  userMessage: string,
  assistantModel: string,
  fastModel: string,
  historyLength: number,
): RouteResult {
  const msg = userMessage.trim()

  // Multi-sentence messages → strong lane (likely complex)
  const sentenceCount = msg.split(/[.!?]+/).filter(s => s.trim().length > 5).length
  if (sentenceCount > 2) {
    return { model: assistantModel, lane: 'strong', reason: 'multi-sentence' }
  }

  // Long messages → strong lane
  if (msg.length > 200) {
    return { model: assistantModel, lane: 'strong', reason: 'long-message' }
  }

  // Check for strong-lane patterns first (takes priority)
  for (const pattern of STRONG_LANE_PATTERNS) {
    if (pattern.test(msg)) {
      return { model: assistantModel, lane: 'strong', reason: `pattern:${pattern.source.slice(0, 30)}` }
    }
  }

  // Check for fast-lane patterns
  for (const pattern of FAST_LANE_PATTERNS) {
    if (pattern.test(msg)) {
      return { model: fastModel, lane: 'fast', reason: `pattern:${pattern.source.slice(0, 30)}` }
    }
  }

  // Default: strong lane (conservative)
  return { model: assistantModel, lane: 'strong', reason: 'default' }
}
