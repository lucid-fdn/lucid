import { QueryClient, QueryKey } from '@tanstack/react-query';
import { REACT_QUERY, CACHE_LIMITS } from '@/lib/cache/config';

// Types
export interface ClientCacheOptions {
  staleTime?: number;
  gcTime?: number;
  persist?: boolean;
  storageKey?: string;
}

// React Query Client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: REACT_QUERY.DEFAULT_STALE_TIME,
      gcTime: REACT_QUERY.DEFAULT_GC_TIME,
      retry: REACT_QUERY.DEFAULT_RETRY_COUNT,
      retryDelay: REACT_QUERY.DEFAULT_RETRY_DELAY,
      refetchOnWindowFocus: false,
    },
  },
});

// Browser Cache Service
export class BrowserCacheService {
  static setCacheHeaders(response: Response, options: { maxAge?: number } = {}) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${options.maxAge || 3600}`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  static async cacheResponse(
    request: Request,
    response: Response,
    options: { maxAge?: number } = {}
  ) {
    const cache = await caches.open('lucid-cache');
    const responseWithHeaders = this.setCacheHeaders(response, options);
    await cache.put(request, responseWithHeaders);
  }

  static async getCachedResponse(request: Request) {
    const cache = await caches.open('lucid-cache');
    return cache.match(request);
  }
}

// Cache Manager
export class CacheManager {
  static async invalidateQuery(queryKey: QueryKey) {
    await queryClient.invalidateQueries({ queryKey });
  }

  static async clearAllCaches() {
    // Clear React Query cache
    await queryClient.clear();

    // Clear Browser Cache
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }

  static async preloadData<T>(
    queryKey: QueryKey,
    queryFn: () => Promise<T>,
    _options: ClientCacheOptions = {}
  ) {
    const data = await queryFn();
    queryClient.setQueryData(queryKey, data);
    return data;
  }

  static async cleanupCache() {
    const cache = queryClient.getQueryCache();
    const queries = cache.findAll();
    
    // Calculate current cache size
    const cacheSize = this.calculateCacheSize(cache);
    
    // If cache size is under warning threshold, no need to cleanup
    if (cacheSize < CACHE_LIMITS.WARNING_THRESHOLD_MB * 1024 * 1024) {
      return;
    }

    // Sort queries by last accessed time
    queries.sort((a, b) => {
      const aLastAccessed = a.state.dataUpdatedAt || 0;
      const bLastAccessed = b.state.dataUpdatedAt || 0;
      return aLastAccessed - bLastAccessed;
    });

    // Remove oldest queries until we're under the size limit
    while (this.calculateCacheSize(cache) > CACHE_LIMITS.MAX_CACHE_SIZE_MB * 1024 * 1024 && queries.length > 0) {
      const query = queries.shift();
      if (query) {
        await queryClient.removeQueries({ queryKey: query.queryKey });
      }
    }
  }

  private static calculateCacheSize(cache: unknown): number {
    try {
      return JSON.stringify(cache).length;
    } catch (error) {
      console.error('Error calculating cache size:', error);
      return 0;
    }
  }
}

// Example Usage:
/*
// Create a query hook
const useUserData = createQueryHook(
  ['user'],
  () => fetchUserData(),
  { staleTime: 60000 }
);

// Use browser cache
const response = await fetch('/api/data');
BrowserCacheService.cacheResponse(request, response, { maxAge: 3600 });

// Monitor cache usage
cacheMonitor.trackHit();

// Compress data
const compressed = CacheCompression.compress(data);
const decompressed = CacheCompression.decompress(compressed);

// Warm cache
await cacheWarmer.warmCache(['user']);
*/ 