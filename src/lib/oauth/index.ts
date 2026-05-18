/**
 * OAuth Service - Main Entry Point
 * 
 * This is the ONLY file that the rest of the codebase should import from.
 * It provides a provider-agnostic interface using the factory pattern.
 * 
 * Usage:
 *   import { getOAuthService } from '@/lib/oauth'
 *   const oauth = getOAuthService()
 *   const providers = await oauth.getProviders()
 * 
 * To swap OAuth providers: Change the implementation in createOAuthProvider()
 */

import { IOAuthProvider, OAuthProviderConfig } from './types'
import { createNangoAdapter } from './providers/nango-adapter'

// Re-export types for convenience
export * from './types'

/**
 * OAuth Provider Factory
 * 
 * This is where you change the OAuth provider implementation.
 * Currently uses Nango, but can be swapped to Supabase Auth, custom, etc.
 */
function createOAuthProvider(config?: Partial<OAuthProviderConfig>): IOAuthProvider {
  const providerType = config?.type || (process.env.NEXT_PUBLIC_OAUTH_PROVIDER as OAuthProviderConfig['type']) || 'nango'

  switch (providerType) {
    case 'nango':
      return createNangoAdapter({
        apiUrl: config?.apiUrl,
        redirectUri: config?.redirectUri,
      })

    case 'supabase':
      // TODO: Implement Supabase adapter when needed
      // return createSupabaseAdapter(config)
      throw new Error('Supabase OAuth adapter not yet implemented')

    case 'custom':
      // TODO: Implement custom adapter when needed
      // return createCustomAdapter(config)
      throw new Error('Custom OAuth adapter not yet implemented')

    default:
      throw new Error(`Unknown OAuth provider type: ${providerType}`)
  }
}

/**
 * Singleton instance of OAuth provider
 * This ensures we reuse the same instance across the app
 */
let oauthProviderInstance: IOAuthProvider | null = null

/**
 * Get OAuth Service Instance
 * 
 * This is the main function to use throughout the codebase.
 * Returns a provider-agnostic OAuth service.
 * 
 * @param config Optional configuration (rarely needed)
 * @returns IOAuthProvider instance
 */
export function getOAuthService(config?: Partial<OAuthProviderConfig>): IOAuthProvider {
  if (!oauthProviderInstance) {
    oauthProviderInstance = createOAuthProvider(config)
  }

  return oauthProviderInstance
}

/**
 * Reset OAuth Provider Instance
 * Useful for testing or when switching providers dynamically
 */
export function resetOAuthService(): void {
  oauthProviderInstance = null
}

/**
 * Check if OAuth is properly configured
 */
export function isOAuthConfigured(): boolean {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_OAUTH_API_URL
    const callbackUrl = process.env.NEXT_PUBLIC_OAUTH_CALLBACK_URL

    return !!(apiUrl && callbackUrl)
  } catch {
    return false
  }
}

/**
 * Get OAuth configuration status
 * Useful for debugging
 */
export function getOAuthConfig(): {
  configured: boolean
  provider: string
  apiUrl?: string
  callbackUrl?: string
} {
  const apiUrl = process.env.NEXT_PUBLIC_OAUTH_API_URL
  const callbackUrl = process.env.NEXT_PUBLIC_OAUTH_CALLBACK_URL
  const provider = process.env.NEXT_PUBLIC_OAUTH_PROVIDER || 'nango'

  return {
    configured: isOAuthConfigured(),
    provider,
    apiUrl,
    callbackUrl,
  }
}
