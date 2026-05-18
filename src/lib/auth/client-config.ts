'use client'

/**
 * Client-side auth & feature configuration.
 *
 * Three independent concerns:
 * 1. Auth provider  — HOW users log in (local, privy, future auth0/clerk)
 * 2. Web3 enabled   — WHETHER wallet/web3 UI is shown (independent toggle)
 * 3. Privy in tree  — WHETHER PrivyProvider is rendered (derived: auth=privy OR web3=true)
 *
 * This runs in the browser — only NEXT_PUBLIC_* vars are available.
 */

// ============================================================================
// Auth Provider
// ============================================================================

/** Returns the active auth provider name. */
export function getAuthProvider(): string {
  const explicit = process.env.NEXT_PUBLIC_AUTH_PROVIDER?.trim().toLowerCase()
  if (explicit) return explicit
  // Auto-detect: Privy app ID present → privy, otherwise local
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? 'privy' : 'local'
}

/** Whether the client is missing Privy config for a non-local deployment. */
export function isAuthMisconfigured(): boolean {
  const explicit = process.env.NEXT_PUBLIC_AUTH_PROVIDER?.trim()
  const deploymentMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE?.trim() || 'saas'
  const hasPrivyAppId = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim()

  if (explicit === 'local') return false
  if (explicit === 'privy') return !hasPrivyAppId

  // In self-hosted mode, local auth is the default and not a misconfiguration.
  if (deploymentMode === 'self-hosted') return false

  // In SaaS/hybrid mode, silently falling back to local auth is misleading.
  return !hasPrivyAppId
}

/** Whether auth is handled by Privy (cloud default). */
export function isPrivyAuth(): boolean {
  return getAuthProvider() === 'privy'
}

/** Whether auth is handled by local GoTrue (self-hosted default). */
export function isLocalAuth(): boolean {
  return getAuthProvider() === 'local'
}

// ============================================================================
// Web3 / Wallet Features
// ============================================================================

/**
 * Whether web3/wallet features are enabled.
 * Independent of auth provider — you can use Privy for auth without web3,
 * or enable web3 which today requires Privy under the hood.
 *
 * Default: true when Privy auth is active (backwards compat), false otherwise.
 */
export function isWeb3Enabled(): boolean {
  const explicit = process.env.NEXT_PUBLIC_WEB3_ENABLED
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  // Default: web3 on when Privy auth is active (backwards compat)
  return isPrivyAuth()
}

// ============================================================================
// Privy Provider (derived — do NOT use for feature gating)
// ============================================================================

/**
 * Whether PrivyProvider must be in the React tree.
 * True when EITHER auth=privy OR web3=true (web3 requires Privy SDK today).
 *
 * Use isPrivyAuth() for auth decisions.
 * Use isWeb3Enabled() for wallet/web3 UI decisions.
 * Use isPrivyEnabled() ONLY for "should PrivyProvider render?"
 */
export function isPrivyEnabled(): boolean {
  return isPrivyAuth() || isWeb3Enabled()
}
