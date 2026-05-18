/**
 * OAuth Abstraction Layer - Provider-Agnostic Types
 * 
 * This abstraction ensures we can swap OAuth providers (Nango, Supabase Auth, Custom)
 * without changing any consuming code. All provider-specific implementations must
 * conform to these interfaces.
 */

/**
 * OAuth Provider Information
 */
export interface OAuthProviderInfo {
  id: string
  name: string
  description: string
  icon: string
  category: 'communication' | 'productivity' | 'storage' | 'finance' | 'social' | 'other'
  requiredScopes: string[]
  documentationUrl?: string
}

/**
 * OAuth Connection (Active credential)
 * 
 * IMPORTANT: `connectionId` is the Nango connection ID that must be used
 * for all API calls (sync, disconnect, resources, proxy).
 * Format: `${privyUserId}-${provider}-${uuid}`
 */
export interface OAuthConnection {
  id: string
  connectionId: string          // Nango connection ID - MUST be stored and used for API calls
  provider: string
  providerName: string
  userId: string
  connectedAt: string
  isActive: boolean
  username?: string
  email?: string
  displayName?: string          // Full name (e.g., "John Doe")
  avatarUrl?: string            // Profile picture URL
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

/**
 * OAuth Connection Statistics
 */
export interface OAuthConnectionStats {
  totalCalls: number
  last24Hours: number
  lastUsed: string | null
  successRate: number
}

/**
 * OAuth Initialization Result
 * 
 * IMPORTANT: `connectionId` is returned by the backend during initiation.
 * This MUST be stored and passed to `/sync` after OAuth completes.
 */
export interface OAuthInitResult {
  authUrl: string
  connectionId: string          // Nango connection ID - MUST be stored for sync
  state?: string
  provider: string
  scopes: string[]
  expiresIn?: number
}

/**
 * OAuth Callback Result
 */
export interface OAuthCallbackResult {
  success: boolean
  provider: string
  connectionId: string
  error?: string
}

/**
 * Abstract OAuth Provider Interface
 * 
 * All OAuth implementations (Nango, Supabase Auth, Custom) must implement this interface.
 * This ensures vendor independence and easy swapping of providers.
 */
export interface IOAuthProvider {
  /**
   * Get list of available OAuth providers
   */
  getProviders(): Promise<OAuthProviderInfo[]>

  /**
   * Initiate OAuth flow for a provider
   * @param provider Provider ID (e.g., 'google', 'slack')
   * @param userId Internal user ID
   * @param options Additional options (scopes, redirect URI, etc.)
   * @returns Authorization URL to redirect user to
   */
  initiateAuth(
    provider: string,
    userId: string,
    options?: {
      scopes?: string[]
      redirectUri?: string
      state?: string
    }
  ): Promise<OAuthInitResult>

  /**
   * Get all OAuth connections for a user
   * @param userId Internal user ID
   */
  getConnections(userId: string): Promise<OAuthConnection[]>

  /**
   * Get a specific OAuth connection
   * @param provider Provider ID
   * @param userId Internal user ID
   */
  getConnection(provider: string, userId: string): Promise<OAuthConnection | null>

  /**
   * Get usage statistics for a connection
   * @param provider Provider ID
   * @param userId Internal user ID
   */
  getConnectionStats(provider: string, userId: string): Promise<OAuthConnectionStats>

  /**
   * Disconnect/revoke an OAuth connection
   * @param provider Provider ID
   * @param userId Internal user ID
   * @param connectionId Optional: Specific connection ID to disconnect (for multi-account support)
   */
  disconnect(provider: string, userId: string, connectionId?: string): Promise<void>

  /**
   * Handle OAuth callback (exchange code for token)
   * This is typically called by the callback endpoint
   */
  handleCallback(code: string, state: string): Promise<OAuthCallbackResult>

  /**
   * Check if a provider is supported
   * @param provider Provider ID
   */
  isSupported(provider: string): Promise<boolean>

  /**
   * Get the provider name (for debugging/logging)
   */
  getProviderName(): string
}

/**
 * OAuth Provider Configuration
 * Used to configure which OAuth provider implementation to use
 */
export interface OAuthProviderConfig {
  type: 'nango' | 'supabase' | 'custom'
  apiUrl?: string
  apiKey?: string
  secretKey?: string
  redirectUri?: string
}

/**
 * OAuth Error Types
 */
export class OAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/**
 * OAuth Error Codes
 */
export enum OAuthErrorCode {
  PROVIDER_NOT_SUPPORTED = 'PROVIDER_NOT_SUPPORTED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  CONNECTION_NOT_FOUND = 'CONNECTION_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
