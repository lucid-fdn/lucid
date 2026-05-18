/**
 * React Hook: useLucidNodes
 * 
 * Fetches all available node types from Lucid-L2.
 * Uses SWR for automatic caching, revalidation, and deduplication.
 * 
 * Benefits of SWR:
 * - Automatic caching (faster subsequent loads)
 * - Request deduplication (multiple components = 1 request)
 * - Auto revalidation (on focus, reconnect, interval)
 * - Optimistic updates
 * 
 * @example
 * ```tsx
 * function NodePalette() {
 *   const { nodes, grouped, loading, error } = useLucidNodes();
 *   
 *   if (loading) return <Skeleton />;
 *   if (error) return <Error message={error} />;
 *   
 *   return (
 *     <div>
 *       {Object.entries(grouped).map(([category, categoryNodes]) => (
 *         <Category key={category} name={category}>
 *           {categoryNodes.map(node => (
 *             <NodeItem key={node.name} node={node} />
 *           ))}
 *         </Category>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

'use client'

import useSWR from 'swr'
import { useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface LucidNode {
  name: string
  displayName: string
  description?: string
  category: string
  group?: string[]
  iconUrl?: string | { light: string; dark: string }
  icon?: string
  version?: number | number[]
  inputs?: string[]
  outputs?: string[]
  properties?: unknown[]
  credentials?: unknown[]
  subcategories?: Record<string, string[]>
  aliases?: string[]
  usableAsTool?: boolean
  docs?: string
}

export interface UseLucidNodesResult {
  /** All nodes as flat array */
  nodes: LucidNode[]
  
  /** Nodes grouped by category */
  grouped: Record<string, LucidNode[]>
  
  /** Array of category names */
  categories: string[]
  
  /** Total number of nodes */
  count: number
  
  /** Loading state */
  loading: boolean
  
  /** Error message if fetch failed */
  error: string | null
  
  /** Refetch function to manually reload nodes */
  refetch: () => Promise<unknown>
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetcher(url: string) {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch nodes')
  }
  
  return data
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch and manage Lucid-L2 node types
 * 
 * Uses SWR for automatic caching and request deduplication.
 * Multiple components calling this will only trigger 1 API request.
 */
export function useLucidNodes(): UseLucidNodesResult {
  const { data, error, isLoading, mutate } = useSWR(
    '/api/lucid-l2/nodes',
    fetcher,
    {
      revalidateOnFocus: false, // Don't refetch on window focus
      revalidateOnReconnect: true, // Refetch on reconnect
      dedupingInterval: 60000, // Dedupe requests within 1 minute
    }
  )

  return {
    nodes: data?.nodes || [],
    grouped: data?.grouped || {},
    categories: data?.categories || [],
    count: data?.count || 0,
    loading: isLoading,
    error: error?.message || null,
    refetch: mutate,
  }
}

/**
 * Hook variant that only fetches nodes for a specific category
 * 
 * @param category - Category name to filter by
 */
export function useLucidNodesByCategory(category: string): UseLucidNodesResult {
  const { nodes, grouped: _grouped, loading, error, refetch } = useLucidNodes()

  // Memoize filtered results
  const filtered = useMemo(() => {
    const filteredNodes = nodes.filter(node => node.category === category)
    
    return {
      nodes: filteredNodes,
      grouped: { [category]: filteredNodes },
      categories: [category],
      count: filteredNodes.length,
    }
  }, [nodes, category])

  return {
    ...filtered,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook to search/filter nodes by query
 * 
 * @param query - Search query (searches name, displayName, description)
 */
export function useSearchLucidNodes(query: string): UseLucidNodesResult {
  const { nodes, loading, error, refetch } = useLucidNodes()

  // Memoize filtered results
  const filtered = useMemo(() => {
    const searchText = query.toLowerCase().trim()
    
    const filteredNodes = searchText
      ? nodes.filter(node =>
          node.name.toLowerCase().includes(searchText) ||
          node.displayName.toLowerCase().includes(searchText) ||
          node.description?.toLowerCase().includes(searchText)
        )
      : nodes

    // Re-group filtered nodes
    const filteredGrouped = filteredNodes.reduce((acc, node) => {
      const cat = node.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(node)
      return acc
    }, {} as Record<string, LucidNode[]>)

    return {
      nodes: filteredNodes,
      grouped: filteredGrouped,
      categories: Object.keys(filteredGrouped),
      count: filteredNodes.length,
    }
  }, [nodes, query])

  return {
    ...filtered,
    loading,
    error,
    refetch,
  }
}
