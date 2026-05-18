/**
 * Launchpad Fee Calculation
 *
 * Revenue split: platform fee + inference cost + staker reward
 */

export interface RevenueSplit {
  grossUsdc: number
  platformFeeUsdc: number
  inferenceCostUsdc: number
  stakerRewardUsdc: number
}

/**
 * Calculate revenue split for an epoch.
 *
 * @param grossUsdc - Total revenue in USDC
 * @param platformFeeBps - Platform fee in basis points (e.g. 1500 = 15%)
 * @param totalTokensUsed - Total inference tokens consumed
 * @param costPerToken - Estimated cost per token in USDC (default: $0.00003 — GPT-4o avg)
 */
export function calculateRevenueSplit(
  grossUsdc: number,
  platformFeeBps: number,
  totalTokensUsed: number,
  costPerToken: number = 0.00003
): RevenueSplit {
  const platformFeeUsdc = roundUsdc(grossUsdc * platformFeeBps / 10000)
  const inferenceCostUsdc = roundUsdc(totalTokensUsed * costPerToken)
  const stakerRewardUsdc = roundUsdc(
    Math.max(0, grossUsdc - platformFeeUsdc - inferenceCostUsdc)
  )

  return {
    grossUsdc: roundUsdc(grossUsdc),
    platformFeeUsdc,
    inferenceCostUsdc,
    stakerRewardUsdc,
  }
}

function roundUsdc(val: number): number {
  return Math.round(val * 1_000_000) / 1_000_000
}
