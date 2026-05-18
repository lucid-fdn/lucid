/**
 * Wallet Eligibility for Autonomous Trading
 *
 * Determines whether a wallet can be used for autonomous (server-signed) trading.
 * Only Privy-managed wallets with a server-controlled owner (authorization key
 * or key quorum) are eligible. External wallets (MetaMask, Phantom, Ledger)
 * require manual confirmation for each trade.
 */

import 'server-only'

// ============================================================================
// Types
// ============================================================================

export type WalletOwnerKind = 'auth_key' | 'key_quorum' | 'user' | 'unknown'

export interface WalletEligibility {
  allowed: boolean
  walletType: 'embedded' | 'external'
  ownerKind: WalletOwnerKind
  ownerId: string | null
  reason: string
}

export interface PrivyWalletInfo {
  id: string // privy wallet ID
  address: string
  chain_type: string
  owner_id?: string | null
  owner_kind?: string | null // 'auth_key' | 'key_quorum' | 'user'
  delegated?: boolean // hint only, not authoritative
}

// ============================================================================
// Server-controlled owner kinds that allow autonomous trading
// ============================================================================

const SERVER_CONTROLLED_OWNER_KINDS = new Set<string>(['auth_key', 'key_quorum'])

// ============================================================================
// Eligibility Check
// ============================================================================

/**
 * Check whether a wallet is eligible for autonomous trading.
 *
 * Autonomous trading requires:
 * 1. Wallet has an owner_id (Privy-managed)
 * 2. Owner is a server-controlled authorization key or key quorum
 *
 * External wallets or wallets owned by a user (not server) get
 * confirmation-only mode.
 */
export function checkWalletEligibility(wallet: PrivyWalletInfo): WalletEligibility {
  // No owner = external wallet or unmanaged
  if (!wallet.owner_id) {
    return {
      allowed: false,
      walletType: 'external',
      ownerKind: 'unknown',
      ownerId: null,
      reason:
        'Autonomous trading requires a Privy-managed wallet with a server authorization key. External wallets (MetaMask, Phantom, Ledger) require manual confirmation for each trade.',
    }
  }

  const ownerKind = (wallet.owner_kind as WalletOwnerKind) || 'unknown'
  const isServerControlled = SERVER_CONTROLLED_OWNER_KINDS.has(ownerKind)

  if (!isServerControlled) {
    return {
      allowed: false,
      walletType: 'embedded',
      ownerKind,
      ownerId: wallet.owner_id,
      reason: `Wallet owner type "${ownerKind}" is not server-controlled. Autonomous trading requires an authorization key or key quorum owner.`,
    }
  }

  return {
    allowed: true,
    walletType: 'embedded',
    ownerKind,
    ownerId: wallet.owner_id,
    reason: 'Wallet is eligible for autonomous trading (server-controlled owner).',
  }
}

/**
 * Compute the DB columns for a wallet's eligibility.
 * Call this when enabling/updating a session signer permission.
 */
export function computeEligibilityColumns(wallet: PrivyWalletInfo) {
  const eligibility = checkWalletEligibility(wallet)
  return {
    privy_wallet_id: wallet.id,
    wallet_owner_id: wallet.owner_id || null,
    wallet_owner_kind: eligibility.ownerKind,
    can_autotrade_computed: eligibility.allowed,
    eligibility_reason: eligibility.reason,
    wallet_type: eligibility.walletType,
  }
}