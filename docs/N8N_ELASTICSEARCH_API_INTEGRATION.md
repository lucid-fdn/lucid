# n8n Elasticsearch API Integration

## Overview

This document describes how LucidMerged integrates with the n8n Elasticsearch API for fast node searching and filtering.

## API Endpoints

### Base URL
```
http://54.204.114.86:3001/api/flow/nodes
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | string | Full-text search across node properties | `slack` |
| `category` | string | Filter by node group (Transform, Input, Output, Trigger) | `Communication` |
| `limit` | number | Max results (default: 100, max: 1000) | `50` |
| `offset` | number | Pagination offset (default: 0) | `50` |

## Implementation

### Client (`src/lib/lucid-l2/client.ts`)

The `getAvailableNodes()` method queries the Elasticsearch API:

```typescript
async getAvailableNodes(options?: {
  search?: string
  category?: string
  offset?: number
  limit?: number
}): Promise<{ nodes: any[], total: number }>
```

**Query Building:**
```typescript
const params = new URLSearchParams({
  offset: offset.toString(),
  limit: limit.toString(),
});

if (search) {
  params.set('search', search); // Text search
}

if (category) {
  params.set('category', category); // Category filter
}
```

### API Route (`src/app/api/lucid-l2/nodes/route.ts`)

The Next.js API route handles two modes:

**1. Search/Filter Mode (Elasticsearch)**
- Triggered when: `search` OR `category` is provided
- Uses: Elasticsearch for fast querying
- Pagination: Offset-based via ES

**2. Browse Mode (Cached)**
- Triggered when: No search or category
- Uses: Cached node list
- Pagination: Cursor-based in memory

## Category Mapping

Frontend categories map to Elasticsearch groups:

| Frontend | Elasticsearch | Description |
|----------|---------------|-------------|
| Transform | transform | Data transformation nodes |
| Input | input | Data input/fetch nodes |
| Output | output | Data output/send nodes |
| Trigger | trigger | Workflow trigger nodes |

**Note:** Categories are case-sensitive in Elasticsearch queries.

## Response Format

```json
{
  "success": true,
  "count": 50,
  "total": 796,
  "nodes": [...],
  "facets": {
    "categories": {
      "transform": 308,
      "input": 199,
      "output": 189,
      "trigger": 110
    }
  },
  "executionTimeMs": 25,
  "source": "elasticsearch"
}
```

## Performance

| Operation | Time |
|-----------|------|
| Category filter | <50ms |
| Text search | <50ms |
| Load 50 nodes | <50ms |
| Pagination | <30ms |

## Troubleshooting

### Issue: Wrong parameter names

**Problem:** Using `filter` and `group` parameters (old API)

**Solution:** Use `search` and `category` parameters:
```typescript
// ❌ Wrong
params.set('filter', searchText)
params.set('group', category.toLowerCase())

// ✅ Correct
params.set('search', searchText)
params.set('category', category)
```

### Issue: Categories not filtering

**Checklist:**
1. Verify correct parameter name: `category` (not `group`)
2. Check case sensitivity: Use exact case ("Transform", not "transform")
3. Verify ES is running: Check server logs for "source": "elasticsearch"
4. Check server logs for ES query and response

### Issue: Getting all categories when filtering

This was caused by using wrong parameter names. After fixing to use `search` and `category`, ES filters correctly.

## Examples

### Frontend Usage

```typescript
// Filter by category
const { items } = await fetch('/api/lucid-l2/nodes?category=Transform&limit=50')

// Text search
const { items } = await fetch('/api/lucid-l2/nodes?q=slack&limit=50')

// Combined
const { items } = await fetch('/api/lucid-l2/nodes?q=api&category=Transform&limit=50')

// Pagination
const { items, nextCursor } = await fetch('/api/lucid-l2/nodes?category=Input&limit=50&cursor=50')
```

### Backend Implementation

```typescript
// In client.ts
const { nodes, total } = await client.getAvailableNodes({
  search: 'email',
  category: 'Communication',
  offset: 0,
  limit: 50
})

// In route.ts (automatic)
if (hasSearch || hasCategory) {
  // Uses Elasticsearch
  const { nodes, total } = await client.getAvailableNodes({
    search,
    category,
    offset,
    limit
  })
}
```

## Migration Notes

### Before (Wrong Implementation)
```typescript
// Client was using wrong parameters
params.set('filter', search) // Should be 'search'
params.set('group', category.toLowerCase()) // Should be 'category'

// This caused ES to ignore filters and return all nodes
```

### After (Correct Implementation)
```typescript
// Using correct Elasticsearch API parameters
params.set('search', search)
params.set('category', category)

// ES now correctly filters results
```

## Testing

To verify ES filtering works:

1. **Check server logs:**
```
[Lucid-L2 Client] 🔍 Querying n8n/Elasticsearch: { category: 'Transform', limit: 50 }
[Lucid-L2 Client] ✅ Query result: { groupsInResponse: ['transform'], requestedGroup: 'transform' }
```

2. **Check response source:**
```json
{
  "source": "elasticsearch"  // ✅ Using ES
}
```

3. **Verify facets match:**
```json
{
  "facets": {
    "categories": {
      "transform": 308  // Matches expected count
    }
  }
}
```

## References

- n8n Elasticsearch API Docs: See `N8N_NODE_ACTIONS_API_GUIDE.md`
- Implementation: `src/lib/lucid-l2/client.ts`
- API Route: `src/app/api/lucid-l2/nodes/route.ts`
- Frontend: `src/components/workflow/node-palette/index.tsx`
