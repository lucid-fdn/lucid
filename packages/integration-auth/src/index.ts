/**
 * @lucid/integration-auth
 *
 * Credential resolution for plugins and integrations.
 * Composite adapter chain: Nango (OAuth) → Database (encrypted API keys) → EnvVar (self-hosted fallback).
 *
 * Usage:
 *   import { CompositeAdapter, CredentialCache } from '@lucid/integration-auth'
 *
 *   const adapter = new CompositeAdapter({
 *     nango: { serverUrl: 'https://lucid.foundation/Nango', secretKey: '...' },
 *     database: { encryptionKey: '...', fetchEncryptedCredential: myDbFn },
 *   })
 *   const cache = new CredentialCache()
 *
 *   const token = cache.get('slack', connId) ?? await adapter.resolve('slack', connId)
 *   if (token) cache.set('slack', connId, token)
 */

// Types
export type {
  TokenResult,
  ConnectionInfo,
  CredentialAdapter,
  NangoAdapterConfig,
  DatabaseAdapterConfig,
  EnvVarAdapterConfig,
  CompositeAdapterConfig,
  CacheConfig,
} from './types.js'

// Adapters
export { NangoAdapter } from './nango-adapter.js'
export { DatabaseAdapter } from './database-adapter.js'
export { EnvVarAdapter } from './env-var-adapter.js'
export { CompositeAdapter } from './composite-adapter.js'

// Cache
export { CredentialCache } from './cache.js'

// Retry utility (shared with gateway callers)
export { fetchWithRetry } from './retry.js'
export type { RetryFetchOptions } from './retry.js'
