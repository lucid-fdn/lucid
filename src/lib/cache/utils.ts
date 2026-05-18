import { CACHE_ENABLED, COMPRESSION, CACHE_WARMING, REACT_QUERY, HTTP_CACHE, ZUSTAND, LOCAL_STORAGE, HOOKS_CACHE } from './config';

export const isCacheEnabled = (): boolean => {
  return CACHE_ENABLED;
};

export interface CacheLayerStatus {
  enabled: boolean;
  reason: string;
}

export interface CacheStatus {
  global: CacheLayerStatus;
  redis: CacheLayerStatus;
  reactQuery: CacheLayerStatus;
  compression: CacheLayerStatus;
  warming: CacheLayerStatus;
  http: CacheLayerStatus;
  etag: CacheLayerStatus;
  memory: CacheLayerStatus;
  zustand: CacheLayerStatus;
  localStorage: CacheLayerStatus;
  hooks: {
    query: CacheLayerStatus;
    localStorage: CacheLayerStatus;
    agentCreation: CacheLayerStatus;
  };
}

export const getCacheStatus = (): CacheStatus => {
  const globalEnabled = CACHE_ENABLED;
  const globalReason = globalEnabled 
    ? 'Cache is enabled via configuration'
    : 'Cache is disabled via NEXT_PUBLIC_CACHE_ENABLED environment variable';

  return {
    global: {
      enabled: globalEnabled,
      reason: globalReason
    },
    redis: {
      enabled: globalEnabled,
      reason: globalEnabled ? 'Redis cache is enabled' : 'Redis cache is disabled by global setting'
    },
    reactQuery: {
      enabled: REACT_QUERY.ENABLED,
      reason: REACT_QUERY.ENABLED 
        ? `React Query cache is enabled (stale time: ${REACT_QUERY.DEFAULT_STALE_TIME}ms)`
        : 'React Query cache is disabled by global setting'
    },
    compression: {
      enabled: COMPRESSION.ENABLED,
      reason: COMPRESSION.ENABLED 
        ? `Compression is enabled (threshold: ${COMPRESSION.THRESHOLD_BYTES} bytes)`
        : 'Compression is disabled by global setting'
    },
    warming: {
      enabled: CACHE_WARMING.ENABLED,
      reason: CACHE_WARMING.ENABLED 
        ? `Cache warming is enabled (interval: ${CACHE_WARMING.PERIODIC_INTERVAL}ms)`
        : 'Cache warming is disabled by global setting'
    },
    http: {
      enabled: HTTP_CACHE.ENABLED,
      reason: HTTP_CACHE.ENABLED
        ? `HTTP cache is enabled (default max-age: ${HTTP_CACHE.DEFAULT_MAX_AGE}s)`
        : 'HTTP cache is disabled by global setting'
    },
    etag: {
      enabled: HTTP_CACHE.ETAG_ENABLED,
      reason: HTTP_CACHE.ETAG_ENABLED
        ? 'ETag caching is enabled'
        : 'ETag caching is disabled by global setting'
    },
    memory: {
      enabled: REACT_QUERY.ENABLED,
      reason: REACT_QUERY.ENABLED
        ? 'In-memory cache is enabled via React Query'
        : 'In-memory cache is disabled by global setting'
    },
    zustand: {
      enabled: ZUSTAND.ENABLED,
      reason: ZUSTAND.ENABLED
        ? `Zustand persistence is enabled (storage key: ${ZUSTAND.STORAGE_KEY})`
        : 'Zustand persistence is disabled by global setting'
    },
    localStorage: {
      enabled: LOCAL_STORAGE.ENABLED,
      reason: LOCAL_STORAGE.ENABLED
        ? `LocalStorage caching is enabled (prefix: ${LOCAL_STORAGE.PREFIX})`
        : 'LocalStorage caching is disabled by global setting'
    },
    hooks: {
      query: {
        enabled: HOOKS_CACHE.ENABLED,
        reason: HOOKS_CACHE.ENABLED
          ? `Query hooks cache is enabled (stale time: ${HOOKS_CACHE.QUERY.DEFAULT_STALE_TIME}ms)`
          : 'Query hooks cache is disabled by global setting'
      },
      localStorage: {
        enabled: HOOKS_CACHE.LOCAL_STORAGE.ENABLED,
        reason: HOOKS_CACHE.LOCAL_STORAGE.ENABLED
          ? `LocalStorage hooks cache is enabled (debounce: ${HOOKS_CACHE.LOCAL_STORAGE.DEBOUNCE_MS}ms)`
          : 'LocalStorage hooks cache is disabled by global setting'
      },
      agentCreation: {
        enabled: HOOKS_CACHE.AGENT_CREATION.ENABLED,
        reason: HOOKS_CACHE.AGENT_CREATION.ENABLED
          ? `Agent creation state cache is enabled (key: ${HOOKS_CACHE.AGENT_CREATION.STORAGE_KEY})`
          : 'Agent creation state cache is disabled by global setting'
      }
    }
  };
}; 