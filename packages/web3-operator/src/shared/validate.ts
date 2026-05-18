/**
 * Address validation — validates wallet/token addresses at tool entry points.
 *
 * Catches malformed inputs early before they reach external APIs.
 * Industry standard: validate format at boundaries, not deep in the stack.
 */

const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/

/**
 * Validate a Solana address (base58, 32-44 chars).
 */
export function isValidSolanaAddress(address: string): boolean {
  return address.length >= 32 && address.length <= 44 && BASE58_CHARS.test(address)
}

/**
 * Validate an EVM address (0x + 40 hex chars).
 */
export function isValidEvmAddress(address: string): boolean {
  // Accept the native token sentinel address used by DEX aggregators
  if (address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') return true
  if (address === '0x0000000000000000000000000000000000000000') return true
  return EVM_ADDRESS.test(address)
}

/**
 * Validate an address for the given chain. Returns null if valid, error message if invalid.
 */
export function validateAddress(address: string, chain: string): string | null {
  if (!address || address.trim().length === 0) {
    return 'Address is required'
  }

  if (chain === 'solana') {
    if (!isValidSolanaAddress(address)) {
      return `Invalid Solana address: expected base58 string (32-44 chars), got "${address.slice(0, 20)}..."`
    }
  } else {
    if (!isValidEvmAddress(address)) {
      return `Invalid EVM address: expected 0x + 40 hex chars, got "${address.slice(0, 20)}..."`
    }
  }

  return null
}

/**
 * Validate a token identifier — can be a symbol (short string) or a full address.
 * Returns null if valid, error message if invalid.
 */
export function validateTokenInput(token: string): string | null {
  if (!token || token.trim().length === 0) {
    return 'Token is required'
  }
  // Symbols are short (1-10 chars, alphanumeric)
  if (token.length <= 10 && /^[a-zA-Z0-9]+$/.test(token)) {
    return null // valid symbol
  }
  // Otherwise treat as address — basic length/format check
  if (token.startsWith('0x')) {
    return isValidEvmAddress(token) ? null : `Invalid EVM token address: "${token.slice(0, 20)}..."`
  }
  if (token.length >= 32 && token.length <= 44) {
    return isValidSolanaAddress(token) ? null : `Invalid Solana token address: "${token.slice(0, 20)}..."`
  }
  // Could be a longer symbol or unrecognized format — let it through
  // The downstream API will reject truly invalid inputs
  return null
}

// ── Amount validation ─────────────────────────────────────────────────

/**
 * Maximum safe amount in token units before BigInt conversion.
 * Prevents overflow when multiplying by 10^decimals.
 * 10^15 with 18 decimals = 10^33 which fits in BigInt safely.
 */
const MAX_AMOUNT = 1e15 // 1 quadrillion tokens — beyond any realistic trade

/**
 * Validate and parse a numeric amount string.
 * Returns the parsed number or an error string.
 */
export function validateAmount(amount: string): number | string {
  const n = parseFloat(amount)
  if (isNaN(n) || !isFinite(n)) return 'Invalid amount: must be a number'
  if (n <= 0) return 'Invalid amount: must be positive'
  if (n > MAX_AMOUNT) return `Amount too large: max ${MAX_AMOUNT.toExponential()}`
  return n
}
