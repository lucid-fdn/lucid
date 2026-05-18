/**
 * User-related types for authentication and linked accounts
 */

// Privy user linked account types
export type LinkedAccountType = 
  | 'wallet'
  | 'email' 
  | 'phone'
  | 'google'
  | 'apple'
  | 'twitter'
  | 'discord'
  | 'github'
  | 'linkedin'
  | 'spotify'
  | 'instagram'
  | 'tiktok'

export interface LinkedWallet {
  address: string
  chainType?: 'ethereum' | 'solana' | 'bitcoin'
  chainId?: string
  walletClient?: string
  walletClientType?: string
  connectorType?: 'embedded' | 'injected' | 'wallet_connect'
  imported?: boolean
  delegated?: boolean
  recoveryMethod?: string
}

export interface LinkedEmail {
  address: string
  verified: boolean
}

export interface LinkedSocial {
  type: LinkedAccountType
  username?: string
  email?: string
  subject?: string
}

export interface LinkedAccount {
  type: LinkedAccountType
  wallet?: LinkedWallet
  email?: string
  address?: string
  verified?: boolean
  [key: string]: unknown
}

export interface PrivyUser {
  id: string
  createdAt: number
  linkedAccounts?: LinkedAccount[]
  wallet?: LinkedWallet
  email?: LinkedEmail
  google?: LinkedSocial
  apple?: LinkedSocial
  twitter?: LinkedSocial
  discord?: LinkedSocial
  github?: LinkedSocial
  [key: string]: unknown
}
