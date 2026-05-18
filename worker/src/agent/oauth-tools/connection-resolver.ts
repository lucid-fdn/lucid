/**
 * OAuth Connection Resolver
 *
 * Resolves the Nango connectionId for a given assistant + provider.
 * v1: Explicit binding required — no implicit fallback to org-owner.
 */

import type { OAuthBinding } from './types.js'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NoOAuthConnectionError extends Error {
  constructor(
    public readonly assistantId: string,
    public readonly provider: string,
  ) {
    super(`No OAuth binding found for assistant ${assistantId} and provider "${provider}". Bind a ${provider} connection to this assistant first.`)
    this.name = 'NoOAuthConnectionError'
  }
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the connectionId for a given provider from the assistant's OAuth bindings.
 *
 * v1: Explicit binding only — no fallback.
 * Future: Optional org-owner fallback behind feature flag.
 */
export function resolveConnection(
  bindings: OAuthBinding[],
  provider: string,
): OAuthBinding {
  const binding = bindings.find(b => b.provider === provider)
  if (!binding) {
    throw new NoOAuthConnectionError(
      bindings[0]?.assistantId || 'unknown',
      provider,
    )
  }
  return binding
}
