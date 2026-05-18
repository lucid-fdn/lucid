/**
 * Auth Provider Adapter — abstracts auth backend (local GoTrue vs Privy).
 *
 * AUTH_PROVIDER env var controls which provider is active:
 *   - "local"  → GoTrue (default for self-hosted)
 *   - "privy"  → Privy (default for cloud)
 */

import 'server-only'

export interface AuthSession {
  /** Internal user UUID (not provider ID) */
  userId: string
  /** Provider-specific external ID */
  externalId: string
  /** Whether this is a newly created user */
  isNewUser?: boolean
}

export interface AuthProvider {
  /** Verify token from request cookies, return session or null */
  verifyToken(token: string): Promise<AuthSession | null>

  /** Get the external ID from a token (for services like Nango that need the provider ID) */
  getExternalId(token: string): Promise<string | null>

  /** Cookie name(s) to read the auth token from */
  readonly tokenCookieNames: string[]
}

let _provider: AuthProvider | null = null
let _providerInflight: Promise<AuthProvider> | null = null

export function getAuthProviderType(): 'local' | 'privy' {
  const explicit = process.env.AUTH_PROVIDER?.trim().toLowerCase()
  if (explicit) {
    if (explicit !== 'local' && explicit !== 'privy') {
      console.warn(`[auth] Unknown AUTH_PROVIDER "${explicit}", falling back to auto-detect`)
    } else {
      return explicit
    }
  }

  // Auto-detect: if Privy credentials exist, use Privy (backwards-compatible with
  // existing deployments that don't set AUTH_PROVIDER). Otherwise default to local.
  if (process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET) {
    return 'privy'
  }

  return 'local'
}

export async function getAuthProvider(): Promise<AuthProvider> {
  if (_provider) return _provider
  if (_providerInflight) return _providerInflight

  const type = getAuthProviderType()

  _providerInflight = (async () => {
    if (type === 'privy') {
      const { PrivyAuthProvider } = await import('./providers/privy')
      return new PrivyAuthProvider()
    }

    const { LocalAuthProvider } = await import('./providers/local')
    return new LocalAuthProvider()
  })()

  try {
    _provider = await _providerInflight
    return _provider
  } finally {
    _providerInflight = null
  }
}

export function getAuthTokenCookieNames(type = getAuthProviderType()): string[] {
  return type === 'privy'
    ? ['lucid-auth-token', 'privy-token', 'privy-id-token', 'privy-refresh-token']
    : ['lucid-auth-token', 'sb-access-token', 'sb-auth-token']
}

/** Reset provider (for testing) */
export function resetAuthProvider(): void {
  _provider = null
  _providerInflight = null
}
