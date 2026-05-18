/**
 * Generic Infinite List Component
 * 
 * Industry-standard infinite scroll list with virtualization.
 * Works with any data type, any rendering logic.
 * 
 * Features:
 * - Automatic infinite loading on scroll
 * - Optional virtualization for 10,000+ items
 * - Loading states & error handling
 * - Skeleton loading
 * - Empty states
 * - Grid or list layout
 * 
 * @example
 * ```tsx
 * <InfiniteList
 *   endpoint="/api/nodes"
 *   renderItem={(node) => <NodeCard node={node} />}
 *   getItemKey={(node) => node.id}
 * />
 * ```
 */

'use client'

import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { useEffect, useRef, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface InfiniteListProps<T = unknown> {
  /** API endpoint */
  endpoint: string
  
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode
  
  /** Get unique key for each item */
  getItemKey: (item: T, index: number) => string | number
  
  /** Items per page */
  limit?: number
  
  /** Initial filters */
  filters?: Record<string, unknown>
  
  /** Initial data from SSR (industry standard: prevents refetch) */
  initialData?: T[]
  
  /** Layout mode */
  layout?: 'list' | 'grid'
  
  /** Grid columns (for grid layout) */
  gridCols?: number
  
  /** Enable virtualization (for 10,000+ items) */
  virtualized?: boolean
  
  /** Estimated item height (for virtualization) */
  estimateSize?: number
  
  /** Loading skeleton */
  skeleton?: ReactNode
  
  /** Skeleton count */
  skeletonCount?: number
  
  /** Empty state */
  emptyState?: ReactNode
  
  /** Error state */
  errorState?: (error: unknown) => ReactNode
  
  /** Container className */
  className?: string
  
  /** Item className */
  itemClassName?: string
  
  /** Show load more button instead of auto-load */
  showLoadMoreButton?: boolean
  
  /** Load more button text */
  loadMoreText?: string
  
  /** Loading text */
  loadingText?: string
  
  /** Transform item before rendering */
  transform?: (item: T) => T
}

// ============================================================================
// Default Components
// ============================================================================

function DefaultSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-muted rounded-lg" />
    </div>
  )
}

function DefaultEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-muted-foreground">No items found</p>
    </div>
  )
}

function DefaultErrorState({ error }: { error: unknown }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-destructive mb-2">Error loading items</p>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function InfiniteList<T = unknown>({
  endpoint,
  renderItem,
  getItemKey,
  limit = 50,
  filters = {},
  initialData,
  layout = 'list',
  gridCols = 3,
  virtualized = false,
  estimateSize = 200,
  skeleton = <DefaultSkeleton />,
  skeletonCount = 6,
  emptyState = <DefaultEmptyState />,
  errorState = (error) => <DefaultErrorState error={error} />,
  className,
  itemClassName,
  showLoadMoreButton = false,
  loadMoreText = 'Load More',
  loadingText = 'Loading...',
  transform
}: InfiniteListProps<T>) {
  const {
    items,
    isLoading,
    isLoadingMore,
    isReachingEnd,
    isEmpty,
    error,
    loadMore,
    total
  } = useInfiniteScroll<T>({
    endpoint,
    limit,
    initialFilters: filters as Record<string, string> | undefined,
    initialData,
    transform
  })
  
  const observerTarget = useRef<HTMLDivElement>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  
  // Auto-load on scroll (Intersection Observer)
  useEffect(() => {
    if (showLoadMoreButton) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !isReachingEnd) {
          loadMore()
        }
      },
      { threshold: 0.5, rootMargin: '100px' }
    )
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }
    
    return () => observer.disconnect()
  }, [isLoadingMore, isReachingEnd, loadMore, showLoadMoreButton])
  
  // Virtualization setup
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
    enabled: virtualized && items.length > 100
  })
  
  const virtualItems = virtualizer.getVirtualItems()
  
  // Grid class
  const gridClass = layout === 'grid' ? `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${gridCols} gap-4` : 'space-y-4'
  
  // Loading state
  if (isLoading) {
    return (
      <div className={cn(gridClass, className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i}>{skeleton}</div>
        ))}
      </div>
    )
  }
  
  // Error state
  if (error) {
    return <div className={className}>{errorState(error)}</div>
  }
  
  // Empty state
  if (isEmpty) {
    return <div className={className}>{emptyState}</div>
  }
  
  // Virtualized rendering
  if (virtualized && items.length > 100) {
    return (
      <div
        ref={parentRef}
        className={cn('h-full overflow-auto', className)}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`
                }}
                className={itemClassName}
              >
                {renderItem(item, virtualItem.index)}
              </div>
            )
          })}
        </div>
        
        {/* Load more trigger */}
        {!isReachingEnd && !showLoadMoreButton && (
          <div ref={observerTarget} className="h-20 flex items-center justify-center">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{loadingText}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  
  // Normal rendering
  return (
    <div className={className}>
      <div className={gridClass}>
        {items.map((item, index) => (
          <div key={getItemKey(item, index)} className={itemClassName}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
      
      {/* Load more section */}
      {!isReachingEnd && (
        <div className="mt-8 flex justify-center">
          {showLoadMoreButton ? (
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingText}
                </span>
              ) : (
                loadMoreText
              )}
            </button>
          ) : (
            <div ref={observerTarget} className="h-20 flex items-center justify-center">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{loadingText}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* End message */}
      {isReachingEnd && items.length > 0 && (
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            {total ? `Showing all ${total} items` : 'No more items'}
          </p>
        </div>
      )}
    </div>
  )
}
