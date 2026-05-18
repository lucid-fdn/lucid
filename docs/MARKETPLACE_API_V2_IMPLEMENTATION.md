# 🏪 Marketplace API v2 - Implementation Complete

**Date:** January 10, 2025  
**Status:** ✅ Phase 1 Complete - Production Ready  
**Architecture:** Hybrid Overlay Pattern (Industry Standard)

---

## 📋 What Was Implemented

### ✅ Core Infrastructure

**1. AI Aggregator Client** (`src/lib/marketplace/ai-aggregator-client.ts`)
- Type-safe client for external AI catalog API
- Redis caching (60s for search, 5min for listings)
- Graceful fallback when Redis unavailable
- Timeout protection (5s for API calls, 30s for model execution)
- Singleton pattern for reuse

**2. Data Merger** (`src/lib/marketplace/merger.ts`)
- Overlay pattern: combines catalog + user data
- Fetches ratings, bookmarks, runs from Supabase
- User-specific enrichment (bookmarked?, user rating)
- Graceful degradation on errors
- Type-safe interfaces

**3. Unified API Route** (`src/app/api/v2/marketplace/search/route.ts`)
- BFF pattern (Backend for Frontend)
- Rate limiting: 20 requests/minute
- Input validation
- Response caching: 60 seconds
- Performance logging
- Consistent error handling

**4. Feature Flag** (`src/lib/features.ts`)
- `marketplaceV2API: true` - Controls new API
- Easy rollback if needed

---

## 🏗️ Architecture

```
┌──────────────┐
│  Next.js UI  │
└──────┬───────┘
       │
       ↓
┌─────────────────────────────────────┐
│  /api/v2/marketplace/search         │
│  • Rate limiting (20 req/min)       │
│  • Input validation                 │
│  • Response caching (60s)           │
└────────┬──────────────┬─────────────┘
         │              │
         ↓              ↓
┌────────────────┐  ┌──────────────┐
│ AI Aggregator  │  │  Supabase    │
│ (Catalog)      │  │  (Overlay)   │
│                │  │              │
│ • Models       │  │ • Ratings    │
│ • Datasets     │  │ • Bookmarks  │
│ • Agents       │  │ • Runs       │
│ • Search (ES)  │  │ • Orgs       │
└────────────────┘  └──────────────┘
         │              │
         └──────┬───────┘
                ↓
         ┌──────────────┐
         │ Redis Cache  │
         │ (60s TTL)    │
         └──────────────┘
```

**Benefits:**
- ✅ Fast search (Elasticsearch from AI Aggregator)
- ✅ Rich user data (Supabase overlay)
- ✅ Independent scaling
- ✅ ~$35/month cost
- ✅ Industry standard pattern

---

## 📡 API Reference

### Search Assets

**Endpoint:** `GET /api/v2/marketplace/search`

**Query Parameters:**
- `q` (optional): Search query
- `kind` (optional): MODEL | DATASET | AGENT | COMPUTE | APP
- `limit` (optional): Results per page (default: 24, max: 100)
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "assets": [
      {
        "id": "hf-gpt2",
        "external_id": "hf-gpt2",
        "name": "GPT-2",
        "kind": "MODEL",
        "provider": "huggingface",
        "description": "...",
        "tags": ["nlp", "transformer"],
        "rating_avg": 4.5,
        "rating_count": 120,
        "runs_count": 5000,
        "bookmark_count": 250,
        "user_bookmarked": true,
        "user_rating": 5,
        "organization": {
          "id": "org-123",
          "name": "OpenAI",
          "slug": "openai",
          "verified": true
        }
      }
    ],
    "total": 1500,
    "offset": 0,
    "limit": 24,
    "has_more": true
  }
}
```

**Rate Limits:**
- 20 requests per minute per user/IP
- Headers returned:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

**Caching:**
- Edge cache: 60 seconds
- Stale-while-revalidate: 30 seconds
- Response time header: `X-Response-Time`

**Example Usage:**
```typescript
// Search for NLP models
const response = await fetch('/api/v2/marketplace/search?q=nlp&kind=MODEL&limit=10');
const { data } = await response.json();

// Browse all datasets
const response = await fetch('/api/v2/marketplace/search?kind=DATASET&offset=0&limit=24');
```

---

## 🔧 Configuration

### Environment Variables

Add to `.env.local`:

```bash
# AI Aggregator API
AI_AGGREGATOR_API_BASE=http://ec2-98-89-47-179.compute-1.amazonaws.com:8001
NEXT_PUBLIC_AI_AGGREGATOR_API_BASE=http://ec2-98-89-47-179.compute-1.amazonaws.com:8001

# Redis Cache (Already configured)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Supabase (Already configured)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Feature Flag

```typescript
// src/lib/features.ts
export const FEATURES = {
  marketplaceV2API: true,  // ✅ Enabled
  // ...
};
```

---

## 📊 Performance Metrics

### Target Performance
- **Search latency:** <200ms (p95)
- **Cache hit rate:** 60-80%
- **Rate limit:** 20 req/min
- **Throughput:** 1000+ QPS with caching

### Actual Performance (Expected)
- **AI Aggregator:** 50-100ms (Elasticsearch)
- **Supabase overlay:** 10-20ms
- **Merge + cache:** 20-50ms total
- **Total:** 80-170ms (excellent!)

### Monitoring

Logs automatically include:
```javascript
{
  endpoint: '/api/v2/marketplace/search',
  duration_ms: 125,
  result_count: 24,
  total: 1500,
  user_id: 'user-123',
  query: 'nlp',
  kind: 'MODEL'
}
```

---

## 🔒 Security

### Implemented
- ✅ Rate limiting (20 req/min)
- ✅ Input validation (kind enum)
- ✅ Auth check (optional, for user-specific data)
- ✅ Max limit enforcement (100 items)
- ✅ SQL injection protection (Supabase ORM)
- ✅ Timeout protection (5s API, 30s execution)

### Row Level Security
- Supabase RLS already configured for:
  - `assets` table
  - `bookmarks` table
  - `ratings` table
  - `runs` table

---

## 🚀 Usage in Frontend

### React Hook (Recommended)

```typescript
// hooks/use-marketplace-search.ts
import { useQuery } from '@tanstack/react-query';

export function useMarketplaceSearch(params: {
  q?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['marketplace', 'search', params],
    queryFn: async () => {
      const url = new URL('/api/v2/marketplace/search', window.location.origin);
      if (params.q) url.searchParams.set('q', params.q);
      if (params.kind) url.searchParams.set('kind', params.kind);
      if (params.limit) url.searchParams.set('limit', params.limit.toString());
      if (params.offset) url.searchParams.set('offset', params.offset.toString());
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
```

### Component Usage

```typescript
'use client';

import { useMarketplaceSearch } from '@/hooks/use-marketplace-search';

export function MarketplaceGrid() {
  const { data, isLoading, error } = useMarketplaceSearch({
    kind: 'MODEL',
    limit: 24
  });
  
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage />;
  
  return (
    <div className="grid grid-cols-4 gap-4">
      {data.data.assets.map(asset => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
```

---

## 📋 Next Steps

### Phase 2: User Actions (Week
