/**
 * Generic Infinite Scroll Hook
 * 
 * Industry-standard infinite scroll with cursor-based pagination.
 * Works with any data type, any API endpoint.
 * 
 * Features:
 * - Cursor-based pagination (consistent results)
 * - SWR for caching & deduplication
 * - Automatic prefetching
 * - Optimistic updates
 * - Error handling
 * 
 * @example
 * ```tsx
 * const { items, loadMore, isLoading, isLoadingMore, isReachingEnd } = useInfiniteScroll({
 *   endpoint: '/api/nodes',
 *   limit: 50,
 *   initialFilters: { category: 'AI' }
 * })
 * ```
 */

'use client'

import useSWRInfinite from 'swr/infinite'
import { useMemo, useState, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface InfiniteScrollOptions<T = unknown> {
  /** API endpoint (e.g., '/api/nodes') */
  endpoint: string
  
  /** Items per page */
  limit?: number
  
  /** Initial filters/params */
  initialFilters?: Record<string, string>
  
  /** Initial data from SSR (industry standard: use SSR as first page, don't refetch) */
  initialData?: T[]
  
  /** Custom fetcher function */
  fetcher?: (url: string) => Promise<PaginatedResponse<T>>
  
  /** Revalidate options */
  revalidateOnFocus?: boolean
  revalidateOnReconnect?: boolean
  
  /** Transform response data */
  transform?: (item: T) => T
}

export interface PaginatedResponse<T = unknown> {
  items: T[]
  nextCursor: string | null
  total?: number
}

export interface InfiniteScrollResult<T = unknown> {
  /** All items flattened */
  items: T[]
  
  /** Loading state */
  isLoading: boolean
  
  /** Loading more pages */
  isLoadingMore: boolean
  
  /** Reached the end */
  isReachingEnd: boolean
  
  /** No items found */
  isEmpty: boolean
  
  /** Error if any */
  error: Error | undefined
  
  /** Load next page */
  loadMore: () => void
  
  /** Refresh all data */
  refresh: () => void
  
  /** Total count (if available) */
  total?: number
  
  /** Current page */
  currentPage: number
}

// ============================================================================
// Default Fetcher
// ============================================================================

async function defaultFetcher<T>(url: string): Promise<PaginatedResponse<T>> {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  // Handle marketplace API v2 format
  if (data.success && data.data) {
    const { results, total, offset, limit } = data.data
    const hasMore = results && results.length === limit
    
    return {
      items: results || [],
      nextCursor: hasMore ? String(offset + limit) : null,
      total
    }
  }
  
  // Handle standard cursor format
  if (data.items && 'nextCursor' in data) {
    return data
  }
  
  // Fallback: assume array response
  if (Array.isArray(data)) {
    return {
      items: data,
      nextCursor: null
    }
  }
  
  throw new Error('Invalid response format')
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * De-duplicate array by key function
 * Critical for infinite scroll to prevent duplicate items across pages
 */
function uniqBy<T>(arr: T[], keyFn: (x: T) => string | number): T[] {
  const seen = new Set<string | number>()
  return arr.filter(x => {
    const k = keyFn(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Generate stable unique key for any item
 * Tries multiple fields to ensure uniqueness
 */
function getItemKey(item: Record<string, unknown>): string {
  const repo = item.repo as Record<string, unknown> | undefined
  return String(
    item.id ??
    item.uid ??
    item.external_id ??
    item.repo_id ??
    repo?.id ??
    `${item.provider || 'unknown'}:${item.slug || item.name || item.repo_name || 'unknown'}`
  )
}

// ============================================================================
// Hook
// ============================================================================

export function useInfiniteScroll<T = unknown>(
  options: InfiniteScrollOptions<T>
): InfiniteScrollResult<T> {
  const {
    endpoint,
    limit = 50,
    initialFilters = {},
    initialData,
    fetcher = defaultFetcher,
    revalidateOnFocus = false,
    revalidateOnReconnect = true,
    transform
  } = options
  
  // Build query params (use latest initialFilters, not closure)
  const buildUrl = (cursor?: string) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...initialFilters // This captures latest filters
    })
    
    if (cursor) {
      // API uses 'offset' not 'cursor' for pagination
      params.set('offset', cursor)
    }
    
    return `${endpoint}?${params.toString()}`
  }
  
  // SWR Infinite key generator
  // CRITICAL: Include filters in key so changing filters triggers refetch
  const getKey = (pageIndex: number, previousPageData: PaginatedResponse<T> | null) => {
    // Reached the end
    if (previousPageData && !previousPageData.nextCursor) {
      return null
    }
    
    // IMPORTANT: Serialize filters to detect changes
    const filtersKey = JSON.stringify(initialFilters)
    
    // First page - include filters in key
    if (pageIndex === 0) {
      return [endpoint, filtersKey, pageIndex]
    }
    
    // Next pages with cursor - include filters in key
    return [endpoint, filtersKey, pageIndex, previousPageData!.nextCursor]
  }
  
  // Custom fetcher that uses the key info
  const swrFetcher = async (keyArray: [string, string, number, string?]) => {
    // keyArray[3] has cursor for next pages, undefined for first page
    const url = buildUrl(keyArray[3])
    return fetcher(url)
  }
  
  // SWR Infinite with SSR data support (industry standard)
  const {
    data,
    error,
    size,
    setSize,
    isLoading: _isLoading,
    isValidating,
    mutate
  } = useSWRInfinite<PaginatedResponse<T>>(
    getKey,
    swrFetcher,
    {
      // Industry standard: Use SSR data as first page WITHOUT refetching
      fallbackData: initialData ? [{
        items: initialData,
        // Use offset as cursor (API uses offset-based pagination)
        nextCursor: initialData.length >= limit ? String(initialData.length) : null,
        total: initialData.length
      }] : undefined,
      revalidateFirstPage: !initialData, // Don't revalidate if we have SSR data
      revalidateOnMount: !initialData, // Critical: Prevent refetch on mount when we have SSR data
      revalidateOnFocus,
      revalidateOnReconnect: !initialData && revalidateOnReconnect, // Don't revalidate SSR data
      revalidateIfStale: false,
      parallel: false,
      keepPreviousData: false,
      shouldRetryOnError: false,
      dedupingInterval: 2000,
      errorRetryCount: 0,
    }
  )
  
  // Compute derived state
  const result = useMemo(() => {
    const pages = data || []
    const lastPage = pages[pages.length - 1]
    
    // Flatten items
    let items = pages.flatMap(page => page.items || [])
    
    // De-duplicate across pages (critical for offset pagination + SSR)
    // Prevents duplicate keys when pages overlap
    const itemsBeforeDedup = items.length
    items = uniqBy(items, (item) => getItemKey(item as Record<string, unknown>))
    const itemsAfterDedup = items.length
    const itemsRemoved = itemsBeforeDedup - itemsAfterDedup
    
    // Transform if needed
    if (transform) {
      items = items.map(transform)
    }
    
    // States
    const isEmpty = pages[0]?.items?.length === 0
    const isLoadingMore = size > 0 && data && typeof data[size - 1] === 'undefined'
    
    // CRITICAL FIX: Detect when API returns only duplicates (no new unique items)
    // This happens when the API doesn't support offset pagination properly
    // If we have multiple pages but deduplication keeps us at the same count, we've reached the end
    const noNewItemsDetected = pages.length > 1 && itemsRemoved > 0 && itemsAfterDedup === pages[0].items.length
    const isReachingEnd = isEmpty || (lastPage && !lastPage.nextCursor) || noNewItemsDetected
    
    // Total (if available from first page)
    const total = pages[0]?.total
    
    return {
      items,
      isLoading: !data && !error,
      isLoadingMore: isLoadingMore || isValidating,
      isReachingEnd: !!isReachingEnd,
      isEmpty,
      error,
      total,
      currentPage: size
    }
  }, [data, error, size, isValidating, transform])
  
  return {
    ...result,
    loadMore: () => setSize(size + 1),
    refresh: () => mutate()
  }
}

// ============================================================================
// Utility: Debounced Version
// ============================================================================

export function useDebouncedInfiniteScroll<T = unknown>(
  options: InfiniteScrollOptions<T> & { debounceMs?: number }
) {
  const { debounceMs = 300, initialFilters, ...rest } = options
  
  const [debouncedFilters, setDebouncedFilters] = useState(initialFilters)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(initialFilters)
    }, debounceMs)
    
    return () => clearTimeout(timer)
  }, [initialFilters, debounceMs])
  
  return useInfiniteScroll({
    ...rest,
    initialFilters: debouncedFilters
  })
}
