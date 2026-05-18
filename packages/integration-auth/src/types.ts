/**
 * Credential Core — Types
 *
 * Shared types for the credential resolution chain.
 * Used by Nango, Database, and EnvVar adapters.
 */

// =============================================================================
// Token / Credential Result
// =============================================================================

/** Result of resolving a credential for a plugin/integration execution. */
export interface TokenResult {
  /** The access token or API key value. */
  accessToken: string
  /** Token type (e.g., 'bearer', 'api-key'). */
  tokenType: 'bearer' | 'api-key' | 'basic' | 'custom'
  /** When the token expires (ISO 8601). Undefined if non-expiring. */
  expiresAt?: string
  /** Refresh token, if available (Nango manages refresh automatically). */
  refreshToken?: string
  /** Additional provider-specific metadata. */
  metadata?: Record<string, unknown>
}

// =============================================================================
// Connection Info (from org_integration_connections)
// =============================================================================

/** Represents a stored integration connection record. */
export interface ConnectionInfo {
  connectionId: string
  authProvider: string
  status: 'active' | 'expired' | 'revoked' | 'error'
  scopes: string[]
  accountLabel?: string | null
  accountId?: string | null
  expiresAt?: string | null
  lastUsedAt?: string | null
}

// =============================================================================
// Credential Adapter Interface
// =============================================================================

/**
 * Adapters resolve credentials from different sources.
 * The composite adapter chains them: Nango → DB → EnvVar.
 */
export interface CredentialAdapter {
  /** Human-readable name for logging. */
  readonly name: string

  /**
   * Attempt to resolve a credential for a given auth provider and connection.
   *
   * @param authProvider - The provider key (e.g., 'slack', 'hubspot', 'notion').
   * @param connectionId - The connection identifier (Nango connectionId, DB record ID, or env prefix).
   * @returns TokenResult if resolved, null if this adapter can't provide it.
   */
  resolve(authProvider: string, connectionId: string): Promise<TokenResult | null>

  /**
   * Check if this adapter is configured and available.
   * Useful for skipping unconfigured adapters in the chain.
   */
  isAvailable(): boolean
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/** Configuration for the Nango adapter. */
export interface NangoAdapterConfig {
  /** Nango server URL (e.g., 'https://lucid.foundation/Nango'). */
  serverUrl: string
  /** Nango secret key for server-side API calls. */
  secretKey: string
}

/** Configuration for the Database adapter. */
export interface DatabaseAdapterConfig {
  /** AES-256-GCM encryption key (base64 or raw, >= 32 chars). */
  encryptionKey: string
  /**
   * Function to fetch encrypted credential from DB.
   * Decoupled from specific DB client — caller provides the query.
   */
  fetchEncryptedCredential: (
    authProvider: string,
    connectionId: string,
  ) => Promise<{ encryptedData: string; tokenType: string; expiresAt?: string | null } | null>
}

/** Configuration for the EnvVar adapter. */
export interface EnvVarAdapterConfig {
  /**
   * Optional prefix override. Default: provider name uppercased.
   * e.g., 'SLACK' → checks SLACK_TOKEN, SLACK_API_KEY.
   */
  prefixOverrides?: Record<string, string>
}

/** Configuration for the composite adapter. */
export interface CompositeAdapterConfig {
  nango?: NangoAdapterConfig
  database?: DatabaseAdapterConfig
  envVar?: EnvVarAdapterConfig
}

// =============================================================================
// Cache Configuration
// =============================================================================

export interface CacheConfig {
  /** TTL in milliseconds (default: 5 minutes). */
  ttlMs?: number
  /** Maximum number of cached entries (default: 200). */
  maxEntries?: number
}
