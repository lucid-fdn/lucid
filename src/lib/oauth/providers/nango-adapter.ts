/**
 * Nango OAuth Provider Adapter
 * 
 * This is the ONLY file that knows about Nango.
 * All Nango-specific code is isolated here.
 * 
 * To swap providers: Create a new adapter (e.g., supabase-adapter.ts)
 * that implements IOAuthProvider, then change the factory to return it.
 */

import {
  IOAuthProvider,
  OAuthProviderInfo,
  OAuthConnection,
  OAuthConnectionStats,
  OAuthInitResult,
  OAuthCallbackResult,
  OAuthError,
  OAuthErrorCode,
} from '../types'

/**
 * Configuration for Nango adapter
 */
interface NangoAdapterConfig {
  apiUrl: string
  redirectUri: string
  expressApiUrl: string // Express backend URL
}

/**
 * Nango OAuth Provider Implementation
 * 
 * Implements the IOAuthProvider interface using Nango as the backend.
 * All API calls to Nango are made through this adapter.
 */
export class NangoOAuthAdapter implements IOAuthProvider {
  private config: NangoAdapterConfig

  constructor(config: NangoAdapterConfig) {
    this.config = config
  }

  getProviderName(): string {
    return 'Nango'
  }

  /**
   * Get available OAuth providers from Nango backend
   * Now proxied through Next.js API routes
   */
  async getProviders(): Promise<OAuthProviderInfo[]> {
    try {
      // Use Next.js API route which proxies to Nango
      const response = await fetch(`/api/oauth/providers`)

      if (!response.ok) {
        throw new OAuthError(
          'Failed to fetch providers',
          OAuthErrorCode.NETWORK_ERROR
        )
      }

      const data = await response.json()

      // Map Nango response to our standard format
      const providers = (data.providers || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        description: p.description as string | undefined,
        icon: p.icon as string | undefined,
        category: this.categorizeProvider(p.id as string),
        requiredScopes: (p.requiredScopes as string[]) || [],
        documentationUrl: p.documentationUrl as string | undefined,
      }))
      
      return providers
    } catch (_error: unknown) {
      throw new OAuthError(
        'Failed to fetch OAuth providers',
        OAuthErrorCode.NETWORK_ERROR
      )
    }
  }

  /**
   * Initiate OAuth flow
   * Now proxied through Next.js API route with authentication
   */
  async initiateAuth(
    provider: string,
    userId: string,
    options?: {
      scopes?: string[]
      redirectUri?: string
      state?: string
    }
  ): Promise<OAuthInitResult> {
    try {
      // Use Next.js API route which handles authentication
      const response = await fetch(
        `/api/oauth/${provider}/initiate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            userId,
            redirectUri: options?.redirectUri || this.config.redirectUri,
            scopes: options?.scopes,
            state: options?.state,
          }),
        }
      )

      if (!response.ok) {
        throw new OAuthError(
          'Failed to initiate OAuth flow',
          OAuthErrorCode.AUTHENTICATION_FAILED,
          provider
        )
      }

      const data = await response.json()

      return {
        authUrl: data.authUrl,
        connectionId: data.connectionId, // CRITICAL: Must be stored and passed to /sync
        state: data.state,
        provider: data.provider || provider,
        scopes: data.scopes || [],
        expiresIn: data.expiresIn,
      }
    } catch (error: unknown) {
      throw error instanceof OAuthError
        ? error
        : new OAuthError(
            'Failed to initiate OAuth',
            OAuthErrorCode.AUTHENTICATION_FAILED,
            provider
          )
    }
  }

  /**
   * Get all user connections
   * Now proxied through Next.js API routes
   */
  async getConnections(userId: string): Promise<OAuthConnection[]> {
    try {
      // Use Next.js API route which proxies to Nango
      const response = await fetch(`/api/oauth/connections`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new OAuthError(
          'Failed to fetch connections',
          OAuthErrorCode.NETWORK_ERROR
        )
      }

      const data = await response.json()

      // Map Nango response to our standard format
      // Backend returns: provider, providerUsername, providerDisplayName, providerAvatarUrl, nango_connection_id
      const connections = (data.connections || []).map((conn: Record<string, unknown>) => ({
        id: conn.id || conn.provider, // DB row ID
        connectionId: conn.connectionId || conn.nango_connection_id || conn.id, // CRITICAL: Nango connection ID for API calls
        provider: conn.provider,
        providerName: conn.providerName || conn.provider,
        userId,
        connectedAt: conn.connectedAt || conn.connected_at,
        isActive: conn.isActive !== false,
        username: conn.username || conn.providerUsername || conn.provider_account_name,
        email: conn.email || conn.providerEmail || conn.provider_account_email,
        displayName: conn.displayName || conn.providerDisplayName || conn.name, // Profile name
        avatarUrl: conn.avatarUrl || conn.providerAvatarUrl || conn.avatar || conn.profilePicture, // Profile picture
        expiresAt: conn.expiresAt,
        metadata: conn.metadata,
      }))
      
      return connections
    } catch (error: unknown) {
      throw error instanceof OAuthError
        ? error
        : new OAuthError(
            'Failed to fetch connections',
            OAuthErrorCode.NETWORK_ERROR
          )
    }
  }

  /**
   * Get a specific connection
   */
  async getConnection(
    provider: string,
    userId: string
  ): Promise<OAuthConnection | null> {
    try {
      const connections = await this.getConnections(userId)
      return connections.find((c) => c.provider === provider) || null
    } catch (_error) {
      return null
    }
  }

  /**
   * Get connection statistics
   * Now proxied through Next.js API route with authentication
   */
  async getConnectionStats(
    provider: string,
    _userId: string
  ): Promise<OAuthConnectionStats> {
    try {
      // Use Next.js API route which handles authentication
      const response = await fetch(
        `/api/oauth/connections/${provider}/stats`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      )

      if (!response.ok) {
        // Return empty stats if not found
        return {
          totalCalls: 0,
          last24Hours: 0,
          lastUsed: null,
          successRate: 0,
        }
      }

      const data = await response.json()

      return {
        totalCalls: data.stats?.totalCalls || 0,
        last24Hours: data.stats?.last24Hours || 0,
        lastUsed: data.stats?.lastUsed || null,
        successRate: data.stats?.successRate || 0,
      }
    } catch (_error) {
      // Return empty stats on error
      return {
        totalCalls: 0,
        last24Hours: 0,
        lastUsed: null,
        successRate: 0,
      }
    }
  }

  /**
   * Disconnect a provider
   * Now proxied through Next.js API route with authentication
   * @param provider Provider ID
   * @param userId User ID
   * @param connectionId Optional: Specific connection ID to disconnect (for multi-account support)
   */
  async disconnect(provider: string, userId: string, connectionId?: string): Promise<void> {
    try {
      // Use Next.js API route which handles authentication
      // Per API doc: DELETE /:provider with body { connectionId: "<connectionId>" }
      const response = await fetch(
        `/api/oauth/${provider}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ connectionId }), // Pass connectionId to backend
        }
      )

      if (!response.ok) {
        throw new OAuthError(
          'Failed to disconnect provider',
          OAuthErrorCode.UNKNOWN_ERROR,
          provider
        )
      }
      
    } catch (error: unknown) {
      throw error instanceof OAuthError
        ? error
        : new OAuthError(
            'Failed to disconnect provider',
            OAuthErrorCode.UNKNOWN_ERROR,
            provider
          )
    }
  }

  /**
   * Handle OAuth callback
   * Note: This is typically handled by the backend, but we include it for completeness
   */
  async handleCallback(
    _code: string,
    _state: string
  ): Promise<OAuthCallbackResult> {
    // This is typically handled server-side by Nango
    // The frontend just receives the redirect with success/error params
    throw new Error('Callback handling is done server-side by Nango')
  }

  /**
   * Check if a provider is supported
   */
  async isSupported(provider: string): Promise<boolean> {
    try {
      const providers = await this.getProviders()
      return providers.some((p) => p.id === provider)
    } catch (_error) {
      return false
    }
  }

  /**
   * Helper: Categorize provider based on ID
   * This is a simple heuristic - could be made more sophisticated
   */
  private categorizeProvider(
    providerId: string
  ): OAuthProviderInfo['category'] {
    const lowerProvider = providerId.toLowerCase()

    if (
      lowerProvider.includes('slack') ||
      lowerProvider.includes('discord') ||
      lowerProvider.includes('telegram') ||
      lowerProvider.includes('gmail')
    ) {
      return 'communication'
    }

    if (
      lowerProvider.includes('notion') ||
      lowerProvider.includes('airtable') ||
      lowerProvider.includes('sheets') ||
      lowerProvider.includes('docs')
    ) {
      return 'productivity'
    }

    if (
      lowerProvider.includes('drive') ||
      lowerProvider.includes('dropbox') ||
      lowerProvider.includes('box')
    ) {
      return 'storage'
    }

    if (
      lowerProvider.includes('binance') ||
      lowerProvider.includes('coinbase') ||
      lowerProvider.includes('stripe')
    ) {
      return 'finance'
    }

    if (
      lowerProvider.includes('twitter') ||
      lowerProvider.includes('facebook') ||
      lowerProvider.includes('instagram')
    ) {
      return 'social'
    }

    return 'other'
  }
}

/**
 * Factory function to create Nango adapter
 */
export function createNangoAdapter(config?: Partial<NangoAdapterConfig>): NangoOAuthAdapter {
  const defaultConfig: NangoAdapterConfig = {
    apiUrl: process.env.NEXT_PUBLIC_OAUTH_API_URL || 'http://localhost:3001',
    redirectUri:
      process.env.NEXT_PUBLIC_OAUTH_CALLBACK_URL ||
      'http://localhost:3000/oauth/callback',
    expressApiUrl:
      process.env.NEXT_PUBLIC_EXPRESS_OAUTH_API_URL ||
      'https://api.lucid.foundation/api/oauth',
  }

  return new NangoOAuthAdapter({
    ...defaultConfig,
    ...config,
  })
}
