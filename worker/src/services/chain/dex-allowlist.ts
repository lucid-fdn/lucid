/**
 * DEX Router Contract Allowlist — P1-26
 *
 * Validates that swap transactions only interact with known DEX router contracts.
 * Prevents agent from being tricked into calling arbitrary contracts.
 */

// ============================================================================
// Known DEX Router Addresses per Chain
// ============================================================================

const ALLOWED_DEX_ROUTERS: Record<string, Set<string>> = {
  // Ethereum Mainnet
  '1': new Set([
    '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch v5
    '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch v6
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap Universal Router
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router v2
    '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b', // Uniswap Universal Router (old)
    '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // SushiSwap
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Exchange Proxy
  ].map(a => a.toLowerCase())),

  // Base
  '8453': new Set([
    '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch v6
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router
    '0x2626664c2603336e57b271c5c0b26f421741e481', // Uniswap Universal Router v2
    '0x6131b5fae19ea4f9d964eac0408e4408b66337b5', // Kyber
  ].map(a => a.toLowerCase())),

  // Polygon
  '137': new Set([
    '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch v6
    '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch v5
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap
    '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', // SushiSwap
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x
  ].map(a => a.toLowerCase())),

  // Arbitrum
  '42161': new Set([
    '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch v6
    '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch v5
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router
    '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', // SushiSwap
  ].map(a => a.toLowerCase())),

  // Optimism
  '10': new Set([
    '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch v6
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Uniswap Universal Router
  ].map(a => a.toLowerCase())),
}

// Solana program IDs
const ALLOWED_SOLANA_PROGRAMS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',  // Jupiter v4
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca Token Swap
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',  // Serum DEX
])

// ============================================================================
// Validation
// ============================================================================

export interface AllowlistCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Validate an EVM swap transaction targets a known DEX router.
 */
export function validateEVMSwapTarget(
  chainId: string,
  toAddress: string
): AllowlistCheckResult {
  const allowed = ALLOWED_DEX_ROUTERS[chainId]
  if (!allowed) {
    return { allowed: false, reason: `No DEX allowlist for chain ${chainId}` }
  }

  const normalized = toAddress.toLowerCase()
  if (allowed.has(normalized)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Contract ${toAddress} is not in the DEX router allowlist for chain ${chainId}. ` +
      `Allowed routers: ${Array.from(allowed).map(a => a.substring(0, 10) + '...').join(', ')}`,
  }
}

/**
 * Validate a Solana swap targets a known DEX program.
 */
export function validateSolanaSwapTarget(programId: string): AllowlistCheckResult {
  if (ALLOWED_SOLANA_PROGRAMS.has(programId)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Program ${programId} is not in the Solana DEX allowlist`,
  }
}

/**
 * Add a custom router (for admin override / dynamic allowlisting).
 */
export function addCustomRouter(chainId: string, address: string): void {
  if (!ALLOWED_DEX_ROUTERS[chainId]) {
    ALLOWED_DEX_ROUTERS[chainId] = new Set()
  }
  ALLOWED_DEX_ROUTERS[chainId].add(address.toLowerCase())
}

export function addCustomSolanaProgram(programId: string): void {
  ALLOWED_SOLANA_PROGRAMS.add(programId)
}