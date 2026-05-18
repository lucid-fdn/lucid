# Pagination & Infinite Scroll Best Practices

## When to Update Memory Bank

**Trigger Points:**
1. After implementing major new patterns (like this service layer)
2. When architectural decisions are made that affect multiple parts of app
3. When you discover/fix critical issues that should be documented
4. Every ~10-20 significant changes
5. When you say "**update memory bank**" in chat

**What to Update:**
- `systemPatterns.md` - New patterns, architecture decisions
- `activeContext.md` - Current work, recent learnings
- `progress.md` - What's complete, what's next
- `techContext.md` - New tech/libraries added

---

## Pagination Patterns for Large Datasets

### Pattern 1: Cursor-Based Pagination (Recommended)

**Best for:** Infinite scroll, real-time data, large datasets

**Why Better Than Offset:**
- Consistent results (no duplicates/skips when data changes)
- Better performance (no counting needed)
- Works with real-time inserts

**Backend:**
```typescript
// src/lib/db/index.ts
export const getNodes = cache(async (cursor?: string, limit = 50) => {
  const query = supabase
    .from('nodes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (cursor) {
    // Cursor = timestamp of last item
    query.lt('created_at', cursor)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  
  return {
    items: data,
    nextCursor: data.length === limit ? data[data.length - 1].created_at : null
  }
})
```

**Hook with SWR Infinite:**
```typescript
// src/hooks/use-infinite-nodes.ts
import useSWRInfinite from 'swr/infinite'

export function useInfiniteNodes(limit = 50) {
  const getKey = (pageIndex: number, previousPageData: any) => {
    // Reached the end
    if (previousPageData && !previousPageData.nextCursor) return null
    
    // First page
    if (pageIndex === 0) return `/api/nodes?limit=${limit}`
    
    // Next pages with cursor
    return `/api/nodes?cursor=${previousPageData.nextCursor}&limit=${limit}`
  }
  
  const { data, error, size, setSize, isLoading } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false, // Don't refetch page 1 when loading more
      parallel: false, // Load pages sequentially
    }
  )
  
  const items = data ? data.flatMap(page => page.items) : []
  const isLoadingMore = size > 0 && data && typeof data[size - 1] === 'undefined'
  const isEmpty = data?.[0]?.items?.length === 0
  const isReachingEnd = isEmpty || !data?.[data.length - 1]?.nextCursor
  
  return {
    items,
    error,
    isLoading,
    isLoadingMore,
    isReachingEnd,
    loadMore: () => setSize(size + 1),
    refresh: () => mutate()
  }
}
```

**Component:**
```typescript
'use client'
import { useInfiniteNodes } from '@/hooks/use-infinite-nodes'
import { useEffect, useRef } from 'react'

export function NodeList() {
  const { items, isLoading, isLoadingMore, isReachingEnd, loadMore } = useInfiniteNodes()
  const observerTarget = useRef<HTMLDivElement>(null)
  
  // Intersection Observer for auto-load
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !isReachingEnd) {
          loadMore()
        }
      },
      { threshold: 0.5 }
    )
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }
    
    return () => observer.disconnect()
  }, [isLoadingMore, isReachingEnd, loadMore])
  
  if (isLoading) return <Skeleton count={10} />
  
  return (
    <div className="space-y-4">
      {items.map(item => (
        <NodeCard key={item.id} node={item} />
      ))}
      
      {/* Loading indicator */}
      {isLoadingMore && <Spinner />}
      
      {/* Intersection observer target */}
      {!isReachingEnd && (
        <div ref={observerTarget} className="h-20" />
      )}
      
      {/* End message */}
      {isReachingEnd && <p>No more items</p>}
    </div>
  )
}
```

---

### Pattern 2: Offset Pagination (Numbered Pages)

**Best for:** Traditional pagination UI, smaller datasets, admin panels

**Backend:**
```typescript
export const getNodesPaginated = cache(async (page = 1, pageSize = 50) => {
  const offset = (page - 1) * pageSize
  
  const [{ data: items }, { count }] = await Promise.all([
    supabase
      .from('nodes')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1),
    supabase
      .from('nodes')
      .select('*', { count: 'exact', head: true })
  ])
  
  return {
    items,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize)
  }
})
```

**Hook:**
```typescript
export function usePaginatedNodes(initialPage = 1, pageSize = 50) {
  const [page, setPage] = useState(initialPage)
  
  const { data, error, isLoading } = useSWR(
    `/api/nodes?page=${page}&pageSize=${pageSize}`,
    fetcher
  )
  
  return {
    items: data?.items || [],
    total: data?.total || 0,
    page,
    totalPages: data?.totalPages || 0,
    isLoading,
    error,
    nextPage: () => setPage(p => Math.min(p + 1, data?.totalPages || p)),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    goToPage: setPage
  }
}
```

---

### Pattern 3: Virtual Scrolling (Large Lists)

**Best for:** 10,000+ items, uniform item heights

**Use:** `react-virtual` or `react-window`

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

export function VirtualNodeList({ items }: { items: Node[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated item height
    overscan: 5 // Render 5 extra items above/below viewport
  })
  
  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <NodeCard node={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Performance Optimizations

### 1. Prefetch Next Page

```typescript
import { useSWRConfig } from 'swr'

export function useInfiniteNodesWithPrefetch() {
  const { mutate } = useSWRConfig()
  const result = useInfiniteNodes()
  
  useEffect(() => {
    // Prefetch next page when user reaches 80% of current list
    if (result.items.length > 0 && !result.isReachingEnd) {
      const nextCursor = result.data?.[result.data.length - 1]?.nextCursor
      if (nextCursor) {
        mutate(`/api/nodes?cursor=${nextCursor}&limit=50`)
      }
    }
  }, [result.items.length])
  
  return result
}
```

### 2. Skeleton Loading

```typescript
export function NodeListSkeleton({ count = 10 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-20 bg-gray-200 rounded mb-4" />
        </div>
      ))}
    </>
  )
}
```

### 3. Debounced Search with Pagination

```typescript
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export function SearchableInfiniteList() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  
  const { items, loadMore, isReachingEnd } = useInfiniteNodes({
    query: debouncedQuery
  })
  
  return (
    <>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <NodeList items={items} />
      {!isReachingEnd && <button onClick={loadMore}>Load More</button>}
    </>
  )
}
```

---

## Best Practices Summary

### ✅ DO:
- **Use cursor-based pagination** for infinite scroll
- **Use SWR Infinite** for automatic cache management
- **Use Intersection Observer** for auto-loading
- **Prefetch next page** when user is 80% through current
- **Show loading states** clearly (skeleton, spinner, etc.)
- **Debounce search inputs** (300ms)
- **Virtual scroll** for 10,000+ items
- **Index cursors** in database (e.g., `created_at`)

### ❌ DON'T:
- Don't use offset pagination for infinite scroll (inconsistent)
- Don't load all items at once (memory issues)
- Don't forget loading states (bad UX)
- Don't skip error handling (what if fetch fails?)
- Don't make items clickable during loading (poor UX)

---

## Database Indexes

**Critical for performance:**

```sql
-- For cursor-based pagination
CREATE INDEX idx_nodes_created_at ON nodes(created_at DESC);

-- For filtered lists
CREATE INDEX idx_nodes_category_created ON nodes(category, created_at DESC);

-- For search
CREATE INDEX idx_nodes_name_trgm ON nodes USING gin(name gin_trgm_ops);
```

---

## Example: Complete Implementation

**Service:**
```typescript
// src/lib/lucid-l2/node-service.ts
export const getNodesPaginated = cache(async (cursor?: string, limit = 50) => {
  const query = supabase
    .from('nodes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (cursor) {
    query.lt('created_at', cursor)
  }
  
  const { data } = await query
  
  return {
    items: data || [],
    nextCursor: data && data.length === limit 
      ? data[data.length - 1].created_at 
      : null
  }
})
```

**API Route:**
```typescript
// src/app/api/nodes/route.ts
import { getNodesPaginated } from '@/lib/lucid-l2/node-service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') || undefined
  const limit = parseInt(searchParams.get('limit') || '50')
  
  const result = await getNodesPaginated(cursor, limit)
  return Response.json(result)
}
```

**Hook:**
```typescript
// src/hooks/use-infinite-nodes.ts
import useSWRInfinite from 'swr/infinite'

export function useInfiniteNodes(limit = 50) {
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && !previousPageData.nextCursor) return null
    if (pageIndex === 0) return `/api/nodes?limit=${limit}`
    return `/api/nodes?cursor=${previousPageData.nextCursor}&limit=${limit}`
  }
  
  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher)
  
  return {
    items: data?.flatMap(page => page.items) || [],
    isLoading,
    isLoadingMore: size > 0 && data && typeof data[size - 1] === 'undefined',
    isReachingEnd: !data?.[data.length - 1]?.nextCursor,
    loadMore: () => setSize(size + 1)
  }
}
```

**Component:**
```typescript
// src/components/node-list.tsx
'use client'
import { useInfiniteNodes } from '@/hooks/use-infinite-nodes'

export function NodeList() {
  const { items, isLoading, loadMore, isReachingEnd } = useInfiniteNodes()
  
  // Auto-load implementation here
  
  return (
    <div>
      {items.map(item => <NodeCard key={item.id} node={item} />)}
      {!isReachingEnd && <button onClick={loadMore}>Load More</button>}
    </div>
  )
}
```

---

**When to use which:**
- **Cursor pagination + Infinite scroll:** User-facing lists (feeds, search results)
- **Offset pagination:** Admin panels, reports, data tables
- **Virtual scrolling:** 10,000+ items, uniform heights
