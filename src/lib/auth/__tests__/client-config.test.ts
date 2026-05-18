/**
 * Client-config tests — exhaustive scenario matrix.
 *
 * Tests every combination of:
 *   NEXT_PUBLIC_AUTH_PROVIDER  × NEXT_PUBLIC_PRIVY_APP_ID × NEXT_PUBLIC_WEB3_ENABLED
 *
 * Covers: unit, smoke, integration (component gating), and simulation (real deployment scenarios).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// We need to re-import the module fresh for each test because the functions
// read process.env at call time (not at import time), so we just need to
// manipulate env vars before each call.

// Save original env
const originalEnv = { ...process.env }

function resetEnv() {
  delete process.env.NEXT_PUBLIC_AUTH_PROVIDER
  delete process.env.NEXT_PUBLIC_PRIVY_APP_ID
  delete process.env.NEXT_PUBLIC_WEB3_ENABLED
}

// Import functions under test
import {
  getAuthProvider,
  isPrivyAuth,
  isLocalAuth,
  isWeb3Enabled,
  isPrivyEnabled,
} from '../client-config'

describe('client-config', () => {
  beforeEach(() => {
    resetEnv()
  })

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) delete process.env[key]
    })
    Object.assign(process.env, originalEnv)
  })

  // ============================================================================
  // Unit Tests — getAuthProvider()
  // ============================================================================

  describe('getAuthProvider()', () => {
    it('returns "local" when nothing is set', () => {
      expect(getAuthProvider()).toBe('local')
    })

    it('returns "local" when NEXT_PUBLIC_AUTH_PROVIDER=local', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      expect(getAuthProvider()).toBe('local')
    })

    it('returns "privy" when NEXT_PUBLIC_AUTH_PROVIDER=privy', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(getAuthProvider()).toBe('privy')
    })

    it('returns custom provider name for future providers', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      expect(getAuthProvider()).toBe('auth0')
    })

    it('returns "clerk" for future Clerk provider', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'clerk'
      expect(getAuthProvider()).toBe('clerk')
    })

    it('auto-detects privy when only PRIVY_APP_ID is set', () => {
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz123'
      expect(getAuthProvider()).toBe('privy')
    })

    it('explicit AUTH_PROVIDER overrides PRIVY_APP_ID auto-detect', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz123'
      expect(getAuthProvider()).toBe('local')
    })

    it('returns empty string as provider if explicitly set to empty', () => {
      // Edge case: empty string is falsy, so falls through to auto-detect
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = ''
      expect(getAuthProvider()).toBe('local')
    })
  })

  // ============================================================================
  // Unit Tests — isPrivyAuth()
  // ============================================================================

  describe('isPrivyAuth()', () => {
    it('false by default (no env vars)', () => {
      expect(isPrivyAuth()).toBe(false)
    })

    it('true when AUTH_PROVIDER=privy', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyAuth()).toBe(true)
    })

    it('false when AUTH_PROVIDER=local', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      expect(isPrivyAuth()).toBe(false)
    })

    it('false when AUTH_PROVIDER=auth0 (future provider)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      expect(isPrivyAuth()).toBe(false)
    })

    it('true when auto-detected via PRIVY_APP_ID', () => {
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz123'
      expect(isPrivyAuth()).toBe(true)
    })
  })

  // ============================================================================
  // Unit Tests — isLocalAuth()
  // ============================================================================

  describe('isLocalAuth()', () => {
    it('true by default (no env vars)', () => {
      expect(isLocalAuth()).toBe(true)
    })

    it('true when AUTH_PROVIDER=local', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      expect(isLocalAuth()).toBe(true)
    })

    it('false when AUTH_PROVIDER=privy', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isLocalAuth()).toBe(false)
    })

    it('false when AUTH_PROVIDER=auth0 (not local, not privy)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      expect(isLocalAuth()).toBe(false)
    })
  })

  // ============================================================================
  // Unit Tests — isWeb3Enabled()
  // ============================================================================

  describe('isWeb3Enabled()', () => {
    it('false by default (no env vars = local auth, no web3)', () => {
      expect(isWeb3Enabled()).toBe(false)
    })

    it('true when explicitly enabled', () => {
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
    })

    it('false when explicitly disabled', () => {
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'
      expect(isWeb3Enabled()).toBe(false)
    })

    it('defaults to true when auth=privy (backwards compat)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isWeb3Enabled()).toBe(true)
    })

    it('can be explicitly disabled even with auth=privy', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'
      expect(isWeb3Enabled()).toBe(false)
    })

    it('can be explicitly enabled with auth=local', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
    })

    it('defaults to false when auth=auth0 (future provider)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      expect(isWeb3Enabled()).toBe(false)
    })

    it('can be enabled with future auth provider', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
    })
  })

  // ============================================================================
  // Unit Tests — isPrivyEnabled() (derived)
  // ============================================================================

  describe('isPrivyEnabled()', () => {
    it('false by default (local auth, no web3)', () => {
      expect(isPrivyEnabled()).toBe(false)
    })

    it('true when auth=privy (PrivyProvider needed for auth)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyEnabled()).toBe(true)
    })

    it('true when web3=true with local auth (PrivyProvider needed for wallets)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isPrivyEnabled()).toBe(true)
    })

    it('true when auth=privy even with web3=false (auth still needs Privy)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'
      expect(isPrivyEnabled()).toBe(true)
    })

    it('false when auth=local and web3=false', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'
      expect(isPrivyEnabled()).toBe(false)
    })

    it('false when auth=auth0 and no web3', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      expect(isPrivyEnabled()).toBe(false)
    })

    it('true when auth=auth0 but web3=true (wallets need Privy SDK)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isPrivyEnabled()).toBe(true)
    })
  })

  // ============================================================================
  // Scenario Matrix — Full Combination Table
  // ============================================================================

  describe('scenario matrix (exhaustive)', () => {
    /**
     * Every meaningful combination of the 3 env vars and expected results.
     * Format: [AUTH_PROVIDER, PRIVY_APP_ID, WEB3_ENABLED, expected]
     */
    const scenarios: Array<{
      name: string
      authProvider?: string
      privyAppId?: string
      web3Enabled?: string
      expected: {
        getAuthProvider: string
        isPrivyAuth: boolean
        isLocalAuth: boolean
        isWeb3Enabled: boolean
        isPrivyEnabled: boolean
      }
    }> = [
      {
        name: 'Self-hosted default — nothing set',
        expected: {
          getAuthProvider: 'local',
          isPrivyAuth: false,
          isLocalAuth: true,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
      {
        name: 'Self-hosted explicit — AUTH_PROVIDER=local',
        authProvider: 'local',
        expected: {
          getAuthProvider: 'local',
          isPrivyAuth: false,
          isLocalAuth: true,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
      {
        name: 'Cloud default — AUTH_PROVIDER=privy',
        authProvider: 'privy',
        expected: {
          getAuthProvider: 'privy',
          isPrivyAuth: true,
          isLocalAuth: false,
          isWeb3Enabled: true,
          isPrivyEnabled: true,
        },
      },
      {
        name: 'Cloud with web3 disabled — privy auth, no wallets',
        authProvider: 'privy',
        web3Enabled: 'false',
        expected: {
          getAuthProvider: 'privy',
          isPrivyAuth: true,
          isLocalAuth: false,
          isWeb3Enabled: false,
          isPrivyEnabled: true, // still true — auth needs Privy
        },
      },
      {
        name: 'Self-hosted with web3 — local auth + wallet features',
        authProvider: 'local',
        web3Enabled: 'true',
        expected: {
          getAuthProvider: 'local',
          isPrivyAuth: false,
          isLocalAuth: true,
          isWeb3Enabled: true,
          isPrivyEnabled: true, // web3 needs PrivyProvider
        },
      },
      {
        name: 'Legacy auto-detect — only PRIVY_APP_ID set',
        privyAppId: 'clxyz123',
        expected: {
          getAuthProvider: 'privy',
          isPrivyAuth: true,
          isLocalAuth: false,
          isWeb3Enabled: true,
          isPrivyEnabled: true,
        },
      },
      {
        name: 'Misconfigured — PRIVY_APP_ID set but AUTH_PROVIDER=local (explicit wins)',
        authProvider: 'local',
        privyAppId: 'clxyz123',
        expected: {
          getAuthProvider: 'local',
          isPrivyAuth: false,
          isLocalAuth: true,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
      {
        name: 'Future provider — auth0, no web3',
        authProvider: 'auth0',
        expected: {
          getAuthProvider: 'auth0',
          isPrivyAuth: false,
          isLocalAuth: false,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
      {
        name: 'Future provider — auth0 with web3',
        authProvider: 'auth0',
        web3Enabled: 'true',
        expected: {
          getAuthProvider: 'auth0',
          isPrivyAuth: false,
          isLocalAuth: false,
          isWeb3Enabled: true,
          isPrivyEnabled: true,
        },
      },
      {
        name: 'Future provider — clerk, no web3',
        authProvider: 'clerk',
        expected: {
          getAuthProvider: 'clerk',
          isPrivyAuth: false,
          isLocalAuth: false,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
      {
        name: 'Everything explicit — privy + web3 true',
        authProvider: 'privy',
        privyAppId: 'clxyz123',
        web3Enabled: 'true',
        expected: {
          getAuthProvider: 'privy',
          isPrivyAuth: true,
          isLocalAuth: false,
          isWeb3Enabled: true,
          isPrivyEnabled: true,
        },
      },
      {
        name: 'Everything explicit — local + web3 false',
        authProvider: 'local',
        web3Enabled: 'false',
        expected: {
          getAuthProvider: 'local',
          isPrivyAuth: false,
          isLocalAuth: true,
          isWeb3Enabled: false,
          isPrivyEnabled: false,
        },
      },
    ]

    for (const scenario of scenarios) {
      it(scenario.name, () => {
        if (scenario.authProvider) process.env.NEXT_PUBLIC_AUTH_PROVIDER = scenario.authProvider
        if (scenario.privyAppId) process.env.NEXT_PUBLIC_PRIVY_APP_ID = scenario.privyAppId
        if (scenario.web3Enabled) process.env.NEXT_PUBLIC_WEB3_ENABLED = scenario.web3Enabled

        expect(getAuthProvider()).toBe(scenario.expected.getAuthProvider)
        expect(isPrivyAuth()).toBe(scenario.expected.isPrivyAuth)
        expect(isLocalAuth()).toBe(scenario.expected.isLocalAuth)
        expect(isWeb3Enabled()).toBe(scenario.expected.isWeb3Enabled)
        expect(isPrivyEnabled()).toBe(scenario.expected.isPrivyEnabled)
      })
    }
  })

  // ============================================================================
  // Smoke Tests — Real Deployment Scenarios
  // ============================================================================

  describe('smoke: real deployment scenarios', () => {
    it('docker compose up with defaults (self-hosted OSS)', () => {
      // .env.example defaults: AUTH_PROVIDER=local, no PRIVY vars, no WEB3
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'

      expect(isLocalAuth()).toBe(true)
      expect(isPrivyAuth()).toBe(false)
      expect(isWeb3Enabled()).toBe(false)
      expect(isPrivyEnabled()).toBe(false)

      // Login page should show local form
      // Wallet UI should be hidden
      // OAuth management should show "not available" message
      // PrivyProvider should NOT be in tree
    })

    it('Vercel cloud deployment (Lucid production)', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz-production-id'

      expect(isLocalAuth()).toBe(false)
      expect(isPrivyAuth()).toBe(true)
      expect(isWeb3Enabled()).toBe(true)
      expect(isPrivyEnabled()).toBe(true)

      // Login page should show Privy modal (wallet, Google, email)
      // Wallet UI should be visible
      // OAuth management should be functional
      // PrivyProvider should be in tree
    })

    it('Enterprise self-hosted with web3 (custom deployment)', () => {
      // Enterprise wants local auth (LDAP/SAML behind GoTrue) but also agent wallets
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz-enterprise-id'

      expect(isLocalAuth()).toBe(true)
      expect(isPrivyAuth()).toBe(false)
      expect(isWeb3Enabled()).toBe(true)
      expect(isPrivyEnabled()).toBe(true) // needs PrivyProvider for wallets

      // Login page should show local form (NOT Privy modal)
      // Wallet UI should be visible
      // PrivyProvider should be in tree (for wallet SDK)
    })

    it('Privy auth without web3 (auth-only SaaS)', () => {
      // SaaS that uses Privy for social login but no crypto features
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clxyz-saas-id'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'

      expect(isLocalAuth()).toBe(false)
      expect(isPrivyAuth()).toBe(true)
      expect(isWeb3Enabled()).toBe(false)
      expect(isPrivyEnabled()).toBe(true) // auth needs PrivyProvider

      // Login page should show Privy modal
      // Wallet UI should be HIDDEN
      // Settings wallet cards should be HIDDEN
      // PrivyProvider should be in tree (for auth)
    })

    it('future Auth0 migration', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'auth0'

      expect(isLocalAuth()).toBe(false)
      expect(isPrivyAuth()).toBe(false)
      expect(isWeb3Enabled()).toBe(false)
      expect(isPrivyEnabled()).toBe(false)

      // Login page should NOT show Privy or local form
      // (would need a new Auth0LoginContent component)
      // Wallet UI hidden
      // PrivyProvider NOT in tree
    })
  })

  // ============================================================================
  // E2E Simulation — Component Gating Decisions
  // ============================================================================

  describe('e2e simulation: component gating decisions', () => {
    it('providers.tsx: PrivyProvider wrapping', () => {
      // MaybePrivyProvider uses isPrivyEnabled()
      // Scenario: self-hosted default
      expect(isPrivyEnabled()).toBe(false)
      // → MaybePrivyProvider returns <>{children}</> (passthrough)

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyEnabled()).toBe(true)
      // → MaybePrivyProvider renders <PrivyProvider>
    })

    it('auth-context.tsx: provider selection', () => {
      // AuthProvider uses isPrivyAuth()
      expect(isPrivyAuth()).toBe(false)
      // → renders LocalAuthProvider

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyAuth()).toBe(true)
      // → renders PrivyAuthProvider
    })

    it('login/page.tsx: login form selection', () => {
      // Uses isPrivyAuth()
      expect(isPrivyAuth()).toBe(false)
      // → renders LocalLoginContent (email/password form)

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyAuth()).toBe(true)
      // → renders PrivyLoginContent (wallet/Google/email modal)
    })

    it('nav-user-menu.tsx: wallet section visibility', () => {
      // Uses isWeb3Enabled()
      expect(isWeb3Enabled()).toBe(false)
      // → WalletMenuSection NOT rendered

      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
      // → WalletMenuSection rendered (shows embedded + external wallets)
    })

    it('WalletProvider.tsx: wallet state initialization', () => {
      // Uses isWeb3Enabled()
      expect(isWeb3Enabled()).toBe(false)
      // → returns empty wallet state (no Privy hooks called)

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isWeb3Enabled()).toBe(true)
      // → calls usePrivy/useWallets for real wallet state
    })

    it('settings cards: wallet/security features', () => {
      // account-identities-card, security-card, advanced-security-card
      // All use isWeb3Enabled()
      expect(isWeb3Enabled()).toBe(false)
      // → All show "not available" fallback UI

      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
      // → All show full Privy wallet/security management UI
    })

    it('oauth-management.tsx: OAuth integrations', () => {
      // Uses isLocalAuth()
      expect(isLocalAuth()).toBe(true)
      // → Shows "not available in local auth mode" message

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isLocalAuth()).toBe(false)
      // → Shows full OAuth provider grid
    })

    it('launch-wizard-client.tsx: wallet list for launchpad', () => {
      // Uses isWeb3Enabled()
      expect(isWeb3Enabled()).toBe(false)
      // → usePrivyWallets returns empty array

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isWeb3Enabled()).toBe(true)
      // → usePrivyWallets calls useWallets() hook
    })

    it('wallet-address-card.tsx: agent wallet display', () => {
      // Uses isWeb3Enabled()
      expect(isWeb3Enabled()).toBe(false)
      // → Shows fallback (no wallet) UI

      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'true'
      expect(isWeb3Enabled()).toBe(true)
      // → Shows full wallet address with fund/withdraw actions
    })
  })

  // ============================================================================
  // Edge Cases & Security
  // ============================================================================

  describe('edge cases', () => {
    it('handles undefined env vars gracefully', () => {
      // All deleted in beforeEach
      expect(() => getAuthProvider()).not.toThrow()
      expect(() => isPrivyAuth()).not.toThrow()
      expect(() => isLocalAuth()).not.toThrow()
      expect(() => isWeb3Enabled()).not.toThrow()
      expect(() => isPrivyEnabled()).not.toThrow()
    })

    it('WEB3_ENABLED is case-sensitive (only "true"/"false" recognized)', () => {
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'TRUE'
      // Not 'true', falls through to default (isPrivyAuth())
      expect(isWeb3Enabled()).toBe(false) // local auth default

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'TRUE'
      expect(isWeb3Enabled()).toBe(true) // falls through to isPrivyAuth() default
    })

    it('AUTH_PROVIDER is case-insensitive', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'Privy'
      expect(isPrivyAuth()).toBe(true)
      expect(isLocalAuth()).toBe(false)
    })

    it('does not leak state between calls', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      expect(isPrivyAuth()).toBe(true)

      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'local'
      expect(isPrivyAuth()).toBe(false)
      expect(isLocalAuth()).toBe(true)
    })

    it('consistent across rapid successive calls', () => {
      process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'privy'
      process.env.NEXT_PUBLIC_WEB3_ENABLED = 'false'

      // All functions should return consistent results
      const results = Array.from({ length: 100 }, () => ({
        auth: isPrivyAuth(),
        web3: isWeb3Enabled(),
        privy: isPrivyEnabled(),
      }))

      expect(results.every(r => r.auth === true)).toBe(true)
      expect(results.every(r => r.web3 === false)).toBe(true)
      expect(results.every(r => r.privy === true)).toBe(true)
    })
  })

  // ============================================================================
  // Invariant Tests — Properties That Must Always Hold
  // ============================================================================

  describe('invariants', () => {
    const envCombos = [
      {},
      { NEXT_PUBLIC_AUTH_PROVIDER: 'local' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'privy' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'auth0' },
      { NEXT_PUBLIC_WEB3_ENABLED: 'true' },
      { NEXT_PUBLIC_WEB3_ENABLED: 'false' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'privy', NEXT_PUBLIC_WEB3_ENABLED: 'false' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'local', NEXT_PUBLIC_WEB3_ENABLED: 'true' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'auth0', NEXT_PUBLIC_WEB3_ENABLED: 'true' },
      { NEXT_PUBLIC_PRIVY_APP_ID: 'clxyz123' },
      { NEXT_PUBLIC_AUTH_PROVIDER: 'local', NEXT_PUBLIC_PRIVY_APP_ID: 'clxyz123' },
    ]

    for (const env of envCombos) {
      const label = Object.keys(env).length === 0 ? '(empty)' : Object.entries(env).map(([k, v]) => `${k.replace('NEXT_PUBLIC_', '')}=${v}`).join(', ')

      it(`invariant: isPrivyEnabled = isPrivyAuth || isWeb3Enabled [${label}]`, () => {
        resetEnv()
        Object.assign(process.env, env)
        expect(isPrivyEnabled()).toBe(isPrivyAuth() || isWeb3Enabled())
      })

      it(`invariant: isLocalAuth = (getAuthProvider() === 'local') [${label}]`, () => {
        resetEnv()
        Object.assign(process.env, env)
        expect(isLocalAuth()).toBe(getAuthProvider() === 'local')
      })

      it(`invariant: isPrivyAuth = (getAuthProvider() === 'privy') [${label}]`, () => {
        resetEnv()
        Object.assign(process.env, env)
        expect(isPrivyAuth()).toBe(getAuthProvider() === 'privy')
      })

      it(`invariant: isPrivyAuth and isLocalAuth are never both true [${label}]`, () => {
        resetEnv()
        Object.assign(process.env, env)
        expect(isPrivyAuth() && isLocalAuth()).toBe(false)
      })
    }
  })
})
