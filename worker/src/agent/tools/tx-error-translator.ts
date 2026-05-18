/**
 * Transaction Error Translator
 *
 * Converts raw blockchain errors (Solana program logs, EVM reverts)
 * into human-readable messages for the agent to relay to users.
 */

/** Known error patterns → [regex, short summary, actionable suggestion] */
const TX_ERROR_PATTERNS: [RegExp, string, string][] = [
  [/custom program error: 0x1771|custom error: 6001|SlippageToleranceExceeded/i,
    'Price moved too much during the swap (slippage exceeded)',
    'The market price changed between getting the quote and executing. Try again — the swap will use a fresh quote. For volatile tokens, the agent can request higher slippage.'],
  [/custom program error: 0x1|insufficient funds|InsufficientFund/i,
    'Insufficient balance to complete the transaction',
    'The wallet doesn\'t have enough tokens to cover the amount plus network fees. Check your balance and try a smaller amount.'],
  [/custom program error: 0x0|already in use|AccountInUse/i,
    'A token account is still being set up',
    'The wallet\'s token account is being initialized. Wait a few seconds and try again.'],
  [/blockhash not found|BlockhashNotFound/i,
    'Transaction expired before it could be confirmed',
    'The network was too slow to process the transaction in time. Try again — this is usually temporary.'],
  [/Transaction too large|oversized/i,
    'Transaction is too complex for a single submission',
    'The swap route is too complex. Try a more liquid token pair or smaller amount.'],
  [/rate limit|429|Too Many Requests/i,
    'Network rate limit reached',
    'Too many requests in a short time. Wait a moment and try again.'],
  [/timeout|ETIMEDOUT|ECONNRESET/i,
    'Network connection timed out',
    'The blockchain network didn\'t respond in time. This is usually temporary — try again.'],
  [/insufficient lamports|not enough SOL/i,
    'Not enough SOL for transaction fees',
    'The wallet needs a small amount of SOL (~0.01) to pay for network fees, even when swapping other tokens.'],
  [/authorization.*expired|session.*expired|Unauthorized/i,
    'Wallet authorization has expired',
    'The trading session has expired. The wallet owner needs to re-authorize trading.'],
  [/transfer amount exceeds balance/i,
    'Transfer amount exceeds wallet balance',
    'The wallet doesn\'t have enough of this token. Check the balance and try a smaller amount.'],
  [/execution reverted|CALL_EXCEPTION|revert/i,
    'Smart contract rejected the transaction',
    'The on-chain contract reverted the transaction. This can happen with low liquidity or stale quotes. Try again.'],
]

export interface TranslatedTxError {
  /** Human-readable one-line summary */
  summary: string
  /** Actionable suggestion for the user */
  suggestion: string
  /** Truncated raw error for debugging (not shown to end users) */
  raw: string
}

/**
 * Translate raw blockchain errors into human-readable messages.
 * Returns a clean explanation + actionable suggestion instead of raw program logs.
 */
export function translateTxError(rawError: string): TranslatedTxError {
  for (const [pattern, summary, suggestion] of TX_ERROR_PATTERNS) {
    if (pattern.test(rawError)) {
      return { summary, suggestion, raw: rawError.substring(0, 200) }
    }
  }
  // Unknown error — still clean up
  const truncated = rawError.length > 300 ? rawError.substring(0, 300) + '...' : rawError
  return {
    summary: 'Transaction failed due to an unexpected error',
    suggestion: 'This may be a temporary network issue. Try again in a few seconds. If the problem persists, try a different token or smaller amount.',
    raw: truncated,
  }
}

/**
 * Sanitize any error for tool return strings.
 *
 * Use this as a drop-in replacement for `error instanceof Error ? error.message : 'Unknown error'`
 * in any tool that returns a string to the agent LLM. It:
 *   1. Runs through known blockchain error patterns (fast path)
 *   2. Strips raw hex, base64, and program log noise
 *   3. Truncates to a reasonable length
 *
 * The agent LLM already has context about what it was doing — it just needs
 * a clean signal, not 800 chars of Solana program logs.
 */
export function sanitizeToolError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  // Try known patterns first
  for (const [pattern, summary] of TX_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return summary
    }
  }

  // Strip noisy blockchain artifacts
  let cleaned = raw
    // Remove hex dumps (0x followed by 20+ hex chars)
    .replace(/0x[a-fA-F0-9]{20,}/g, '[hex]')
    // Remove base64 blobs (40+ chars of base64)
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[data]')
    // Remove Solana program log lines
    .replace(/Program log: .+/g, '')
    // Remove "Program .{44} invoke" lines
    .replace(/Program [A-Za-z0-9]{32,44} (invoke|consumed|success|failed).*/g, '')
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim()

  // Truncate to 200 chars
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200) + '...'
  }

  return cleaned || 'Unknown error'
}
