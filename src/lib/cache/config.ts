// Cache configuration and policies
import { FEATURES } from '@/lib/features';
export const CACHE_ENABLED = FEATURES.cacheEnabled;

// LocalStorage configuration
export const LOCAL_STORAGE = {
  ENABLED: CACHE_ENABLED,
  PREFIX: 'lucid:',
  // Keys that should always be persisted regardless of cache setting
  ALWAYS_PERSIST: ['user_prefs', 'auth_token'] as const,
  // Keys that should be cleared when cache is disabled
  CLEAR_ON_DISABLE: [
    'chat_history',
    'agent_state',
    'wallet_totals',
    'workspace',
    'reactions',
    'nft_cache',
    'wallet_cache'
  ] as const,
} as const;

// Custom Hooks Cache configuration
export const HOOKS_CACHE = {
  ENABLED: CACHE_ENABLED,
  // Configuration for useQueryWithCache
  QUERY: {
    DEFAULT_STALE_TIME: CACHE_ENABLED ? 60000 : 0,
    DEFAULT_GC_TIME: CACHE_ENABLED ? 300000 : 0,
  },
  // Configuration for useLocalStorageEffect
  LOCAL_STORAGE: {
    ENABLED: CACHE_ENABLED,
    DEBOUNCE_MS: 500,
  },
  // Configuration for useAgentCreationState
  AGENT_CREATION: {
    ENABLED: CACHE_ENABLED,
    STORAGE_KEY: 'agentCreationState',
  },
} as const;

// Cache configuration and policies
export const CACHE_PREFIX = 'lucid:';

// Zustand persistence configuration
export const ZUSTAND = {
  ENABLED: CACHE_ENABLED,
  STORAGE_KEY: 'lucid:zustand',
  PERSIST_OPTIONS: {
    // Only persist specific parts of the state
    PARTIALIZE: (state: Record<string, unknown>) => ({
      config: state.config,
      userPrefs: state.userPrefs,
      // Add other state slices that should be persisted
    }),
    // Version control for persisted state
    VERSION: 1,
    // Migration function for future state structure changes
    MIGRATE: (persistedState: Record<string, unknown>, version: number) => {
      if (version === 0) {
        // Handle migration from version 0 to 1
        return {
          ...persistedState,
          // Add migration logic here
        };
      }
      return persistedState;
    },
  },
} as const;

// HTTP/Browser Cache configuration
export const HTTP_CACHE = {
  ENABLED: CACHE_ENABLED,
  DEFAULT_MAX_AGE: 3600, // 1 hour
  STATIC_ASSETS_MAX_AGE: 86400, // 24 hours
  API_RESPONSES_MAX_AGE: 300, // 5 minutes
  ETAG_ENABLED: CACHE_ENABLED,
} as const;

// TTLs in milliseconds
export const TTL = {
  AUTH: 60 * 60, // 1 hour
  IMAGE: 60 * 60 * 24, // 24 hours
  RATE_LIMIT: 60, // 1 minute
  CHAT: 60 * 60 * 24 * 7, // 7 days
  USER_PREFS: 2592000000, // 30 days
  AGENT_STATE: 86400000,  // 24 hours
  CHAT_HISTORY: 3600000,  // 1 hour (reduced from 7 days)
  AI_RESPONSE: 3600000,   // 1 hour
  CACHE_WARMING: 3600000, // 1 hour
  WALLET_TOTALS: 60000,   // 1 minute (frequent updates needed)
  LAUNCHPAD_AGENT: 60000, // 1 minute for public agent listings
} as const;

// Type for cache keys to ensure consistency
export type CacheKey = string | `chat_history_${string}`;

// Compression settings
export const COMPRESSION = {
  THRESHOLD_BYTES: 10 * 1024, // 10KB (reduced from 50KB)
  ENABLED: CACHE_ENABLED, // Tied to global cache toggle
  // Data types that should always be compressed regardless of size
  ALWAYS_COMPRESS: ['chat_history', 'ai_response', 'agent_state'] as const,
  // Data types that should never be compressed
  NEVER_COMPRESS: ['rate_limit', 'auth_token', 'user_prefs'] as const,
} as const;

// Cache warming configuration
export const CACHE_WARMING = {
  ENABLED: CACHE_ENABLED, // Tied to global cache toggle
  // Keys to warm on app startup
  STARTUP_KEYS: ['user_prefs', 'agent_list'] as const,
  // Keys to warm periodically
  PERIODIC_KEYS: ['chat_history'] as const,
  // Interval for periodic warming (in milliseconds)
  PERIODIC_INTERVAL: 1800000, // 30 minutes (reduced from 1 hour)
} as const;

// Monitoring thresholds
export const MONITORING = {
  HIT_RATE_THRESHOLD: 0.8, // 80% minimum hit rate
  MEMORY_THRESHOLD_MB: 1000, // 1GB max memory usage
  ERROR_RATE_THRESHOLD: 0.01, // 1% maximum error rate
} as const;

// Cache size limits
export const CACHE_LIMITS = {
  MAX_CACHE_SIZE_MB: 50,  // Maximum total cache size
  MAX_ITEM_SIZE_MB: 5,    // Maximum size per cached item
  WARNING_THRESHOLD_MB: 40, // Warning when cache reaches this size
} as const;

// React Query defaults
export const REACT_QUERY = {
  ENABLED: CACHE_ENABLED, // Tied to global cache toggle
  DEFAULT_STALE_TIME: CACHE_ENABLED ? 60000 : 0,    // 1 minute if enabled, 0 if disabled
  DEFAULT_GC_TIME: CACHE_ENABLED ? 300000 : 0,      // 5 minutes if enabled, 0 if disabled
  DEFAULT_RETRY_COUNT: 3,
  DEFAULT_RETRY_DELAY: 1000,    // 1 second
} as const;

// Cache invalidation policies
export const INVALIDATION = {
  // Keys that should be invalidated on user logout
  LOGOUT_KEYS: ['auth', 'user_prefs'] as const,
  // Keys that should be invalidated on agent update
  AGENT_UPDATE_KEYS: ['agent_list', 'agent_state'] as const,
  // Keys that should be invalidated on chat message
  CHAT_MESSAGE_KEYS: ['chat_history'] as const,
} as const;

// Helper to get TTL for a specific key
export function getTTL(key: CacheKey): number {
  return CACHE_ENABLED ? (TTL[key.toUpperCase() as keyof typeof TTL] || TTL.AUTH) : 0;
}

// Helper to determine if data should be compressed
export function shouldCompress(key: CacheKey, size: number): boolean {
  if (!CACHE_ENABLED) return false;
  if (COMPRESSION.ALWAYS_COMPRESS.includes(key as typeof COMPRESSION.ALWAYS_COMPRESS[number])) return true;
  if (COMPRESSION.NEVER_COMPRESS.includes(key as typeof COMPRESSION.NEVER_COMPRESS[number])) return false;
  return size > COMPRESSION.THRESHOLD_BYTES;
}
