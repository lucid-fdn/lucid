import type { DedicatedRuntime } from '@/lib/mission-control/types'

export type L2WalletRequiredFeature =
  | 'passport_claim'
  | 'on_chain_ownership_transfer'
  | 'staking'
  | 'payouts'
  | 'token_gated_access'
  | 'on_chain_reputation_write'

export function runtimeHasUserWalletOwnership(runtime: Pick<DedicatedRuntime, 'l2OwnerMode' | 'l2ClaimStatus'>): boolean {
  return runtime.l2OwnerMode === 'user_wallet' && runtime.l2ClaimStatus === 'claimed'
}

export function canUseL2WalletFeature(
  runtime: Pick<DedicatedRuntime, 'l2OwnerMode' | 'l2ClaimStatus'>,
  feature: L2WalletRequiredFeature,
): { allowed: true } | { allowed: false; reason: string; action: 'claim_passport' } {
  if (runtimeHasUserWalletOwnership(runtime)) return { allowed: true }

  return {
    allowed: false,
    reason: `${feature} requires the passport to be claimed by a user wallet.`,
    action: 'claim_passport',
  }
}
