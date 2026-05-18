/**
 * User authentication helpers
 * Processes ALL linked accounts from Privy (Web2 + Web3)
 * 
 * Industry standard pattern: Centralized data processing
 * Used by: Coinbase, OpenSea, Uniswap, Netflix, Airbnb
 */

import type { PrivyUser, LinkedWallet, LinkedAccount, LinkedAccountType } from './user-types'

/**
 * Get all linked wallets (Ethereum + Solana + others)
 */
export function getLinkedWallets(user: PrivyUser | null | undefined): LinkedWallet[] {
  if (!user?.linkedAccounts) return []
  
  return user.linkedAccounts
    .filter(account => account.type === 'wallet')
    .map(account => {
      // Wallet data can be in account.wallet OR directly on account
      if (account.wallet) {
        return account.wallet
      }
      // If no nested wallet, the account IS the wallet
      return account as unknown as LinkedWallet
    })
    .filter((wallet): wallet is LinkedWallet => !!wallet && !!wallet.address)
}

/**
 * Get EVM (Ethereum) wallets only
 */
export function getEVMWallets(user: PrivyUser | null | undefined): LinkedWallet[] {
  return getLinkedWallets(user).filter(wallet => {
    const isEthereumChain = wallet.chainType === 'ethereum' || 
                           wallet.chainId?.toString().startsWith('eip155:')
    const hasEthAddress = wallet.address?.startsWith('0x') && 
                         wallet.address?.length === 42
    return isEthereumChain && hasEthAddress
  })
}

/**
 * Get first EVM wallet (for primary wallet use)
 */
export function getPrimaryEVMWallet(user: PrivyUser | null | undefined): LinkedWallet | null {
  // Prefer embedded wallet first (most secure)
  const embedded = getEVMWallets(user).find(w => w.connectorType === 'embedded')
  if (embedded) return embedded
  
  // Otherwise return first EVM wallet
  return getEVMWallets(user)[0] || null
}

/**
 * Get Solana wallets only
 */
export function getSolanaWallets(user: PrivyUser | null | undefined): LinkedWallet[] {
  return getLinkedWallets(user).filter(wallet => {
    const isSolanaChain = wallet.chainType === 'solana' || 
                         wallet.chainId?.toString().includes('solana')
    const hasSolanaAddress = wallet.address && 
                            !wallet.address.startsWith('0x') && 
                            wallet.address.length >= 32 && 
                            wallet.address.length <= 44
    return isSolanaChain && hasSolanaAddress
  })
}

/**
 * Get first Solana wallet (for primary wallet use)
 */
export function getPrimarySolanaWallet(user: PrivyUser | null | undefined): LinkedWallet | null {
  return getSolanaWallets(user)[0] || null
}

/**
 * Get embedded wallets only (created by Privy)
 */
export function getEmbeddedWallets(user: PrivyUser | null | undefined): LinkedWallet[] {
  return getLinkedWallets(user).filter(w => w.connectorType === 'embedded')
}

/**
 * Get external wallets only (MetaMask, Phantom, etc.)
 */
export function getExternalWallets(user: PrivyUser | null | undefined): LinkedWallet[] {
  return getLinkedWallets(user).filter(w => w.connectorType !== 'embedded')
}

/**
 * Get all linked email addresses
 */
export function getLinkedEmails(user: PrivyUser | null | undefined): string[] {
  if (!user?.linkedAccounts) return []
  
  return user.linkedAccounts
    .filter(account => account.type === 'email')
    .map(account => account.address || account.email)
    .filter((email): email is string => !!email)
}

/**
 * Get primary email (first one)
 */
export function getPrimaryEmail(user: PrivyUser | null | undefined): string | null {
  return getLinkedEmails(user)[0] || null
}

/**
 * Get all linked social accounts
 */
export function getLinkedSocials(user: PrivyUser | null | undefined): LinkedAccount[] {
  if (!user?.linkedAccounts) return []
  
  const socialTypes: LinkedAccountType[] = [
    'google', 'apple', 'twitter', 'discord', 
    'github', 'linkedin', 'spotify', 'instagram', 'tiktok'
  ]
  
  return user.linkedAccounts.filter(account => 
    socialTypes.includes(account.type as LinkedAccountType)
  )
}

/**
 * Get linked social accounts by type
 */
export function getSocialByType(
  user: PrivyUser | null | undefined, 
  type: LinkedAccountType
): LinkedAccount | null {
  return getLinkedSocials(user).find(account => account.type === type) || null
}

/**
 * Check if user has any wallets linked
 */
export function hasLinkedWallet(user: PrivyUser | null | undefined): boolean {
  return getLinkedWallets(user).length > 0
}

/**
 * Check if user has EVM wallet linked
 */
export function hasEVMWallet(user: PrivyUser | null | undefined): boolean {
  return getEVMWallets(user).length > 0
}

/**
 * Check if user has Solana wallet linked
 */
export function hasSolanaWallet(user: PrivyUser | null | undefined): boolean {
  return getSolanaWallets(user).length > 0
}

/**
 * Check if user has email linked
 */
export function hasLinkedEmail(user: PrivyUser | null | undefined): boolean {
  return getLinkedEmails(user).length > 0
}

/**
 * Check if user has any social account linked
 */
export function hasLinkedSocial(user: PrivyUser | null | undefined): boolean {
  return getLinkedSocials(user).length > 0
}

/**
 * Check if user has specific social account type linked
 */
export function hasSocialType(
  user: PrivyUser | null | undefined, 
  type: LinkedAccountType
): boolean {
  return !!getSocialByType(user, type)
}

/**
 * Count total authentication methods
 */
export function getAuthMethodCount(user: PrivyUser | null | undefined): number {
  return (
    getLinkedWallets(user).length + 
    getLinkedEmails(user).length + 
    getLinkedSocials(user).length
  )
}

/**
 * Check if user can remove an authentication method
 * Must have at least one auth method remaining
 */
export function canRemoveAuthMethod(user: PrivyUser | null | undefined): boolean {
  return getAuthMethodCount(user) > 1
}

/**
 * Check if specific wallet can be removed
 */
export function canRemoveWallet(
  user: PrivyUser | null | undefined,
  walletAddress: string
): boolean {
  // Can't remove if it's the only wallet
  const wallets = getLinkedWallets(user)
  if (wallets.length === 1 && wallets[0].address === walletAddress) {
    // Check if user has other auth methods
    return hasLinkedEmail(user) || hasLinkedSocial(user)
  }
  
  return true
}

/**
 * Check if wallet is embedded (created by Privy)
 */
export function isEmbeddedWallet(wallet: LinkedWallet): boolean {
  return wallet.connectorType === 'embedded' || wallet.walletClientType === 'privy'
}

/**
 * Check if wallet is external (MetaMask, Phantom, etc.)
 */
export function isExternalWallet(wallet: LinkedWallet): boolean {
  return !isEmbeddedWallet(wallet)
}

/**
 * Get user's authentication summary
 */
export function getAuthSummary(user: PrivyUser | null | undefined) {
  return {
    wallets: {
      total: getLinkedWallets(user).length,
      ethereum: getEVMWallets(user).length,
      solana: getSolanaWallets(user).length,
      embedded: getEmbeddedWallets(user).length,
      external: getExternalWallets(user).length,
    },
    emails: getLinkedEmails(user).length,
    socials: {
      total: getLinkedSocials(user).length,
      google: hasSocialType(user, 'google'),
      apple: hasSocialType(user, 'apple'),
      twitter: hasSocialType(user, 'twitter'),
      discord: hasSocialType(user, 'discord'),
      github: hasSocialType(user, 'github'),
    },
    totalAuthMethods: getAuthMethodCount(user),
    canRemoveAuth: canRemoveAuthMethod(user),
  }
}
