import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { REACT_QUERY, CacheKey } from '../lib/cache/config';
import { useQueryClient } from '@tanstack/react-query';
import { CacheErrorHandler } from '@/lib/cache/error-handler';

interface QueryWithCacheOptions<TData = unknown, TError = Error>
  extends Omit<UseQueryOptions<TData, TError>, 'staleTime' | 'gcTime' | 'queryKey' | 'queryFn'> {
  cacheKey: CacheKey;
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  staleTime?: number;
  gcTime?: number;
}

/**
 * Enhanced useQuery hook with standardized caching behavior
 * 
 * Usage:
 * ```tsx
 * const { data, isLoading } = useQueryWithCache({
 *   cacheKey: 'agent_list',
 *   queryKey: ['agents'],
 *   queryFn: fetchAgents,
 * });
 * ```
 */
export function useQueryWithCache<TData = unknown, TError = Error>({
  cacheKey,
  queryKey,
  queryFn,
  staleTime = REACT_QUERY.DEFAULT_STALE_TIME,
  gcTime = REACT_QUERY.DEFAULT_GC_TIME,
  ...options
}: QueryWithCacheOptions<TData, TError>): UseQueryResult<TData, TError> {
  // Ensure queryKey is an array
  const finalQueryKey = Array.isArray(queryKey) ? queryKey : [queryKey];

  return useQuery<TData, TError>({
    ...options,
    queryKey: [cacheKey, ...finalQueryKey],
    queryFn: async () => {
      try {
        const data = await queryFn();
        return data;
      } catch (error) {
        await CacheErrorHandler.handleError(cacheKey, error as Error);
        throw error;
      }
    },
    staleTime,
    gcTime,
    retry: options.retry ?? REACT_QUERY.DEFAULT_RETRY_COUNT,
    retryDelay: options.retryDelay ?? REACT_QUERY.DEFAULT_RETRY_DELAY,
  });
}

/**
 * Hook for handling cache invalidation
 * 
 * Usage:
 * ```tsx
 * const { invalidateCache } = useCacheInvalidation();
 * 
 * // Invalidate specific cache
 * await invalidateCache('agent_list');
 * 
 * // Invalidate multiple caches
 * await invalidateCache(['agent_list', 'agent_state']);
 * ```
 */
export function useCacheInvalidation() {
  const queryClient = useQueryClient();

  const invalidateCache = async (keys: CacheKey | CacheKey[]) => {
    const keysToInvalidate = Array.isArray(keys) ? keys : [keys];
    
    // Invalidate each cache key
    await Promise.all(
      keysToInvalidate.map(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      )
    );
  };

  return { invalidateCache };
} 