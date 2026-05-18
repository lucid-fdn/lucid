import { describe, expect, it } from 'vitest'
import { canUseL2WalletFeature, runtimeHasUserWalletOwnership } from './ownership'

describe('L2 ownership gating', () => {
  it('allows wallet-native features only after user wallet claim', () => {
    expect(runtimeHasUserWalletOwnership({
      l2OwnerMode: 'user_wallet',
      l2ClaimStatus: 'claimed',
    })).toBe(true)

    expect(canUseL2WalletFeature({
      l2OwnerMode: 'user_wallet',
      l2ClaimStatus: 'claimed',
    }, 'payouts')).toEqual({ allowed: true })
  })

  it('blocks wallet-native features for custody/platform ownership', () => {
    const result = canUseL2WalletFeature({
      l2OwnerMode: 'workspace_custody',
      l2ClaimStatus: 'claimable',
    }, 'staking')

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.action).toBe('claim_passport')
    }
  })
})
