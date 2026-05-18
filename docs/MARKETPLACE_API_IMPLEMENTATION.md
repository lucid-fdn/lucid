# 🏪 Marketplace API - Production Implementation Guide

**Date:** January 10, 2025  
**Status:** Implementation Plan  
**Goal:** Replace placeholder API with production-ready marketplace system

---

## 📋 Executive Summary

Current marketplace uses **placeholder/mock data** with external API dependency. This document outlines the **industry-standard** approach to build a **scalable, production-ready marketplace API** using your existing Supabase infrastructure.

---

## 🎯 Industry Standards Analysis

### Leading Marketplace APIs

**1. Stripe API**
- RESTful design
- Cursor-based pagination
- Comprehensive filtering
- Rich metadata support
- Webhook events
- Extensive documentation

**2. Shopify API**
- GraphQL + REST
- Full-text search
- Faceted filtering
- Real-time inventory
- Rate limiting (40 req/s)
- Versioned API

**3. AWS Marketplace**
- Product catalog API
- Search with Elasticsearch
- Usage metering
- License management
- Analytics tracking

**4. NPM Registry**
- Package search
- Download metrics
- Dependency graphs
- Semantic versioning
- CDN caching

### Common Patterns

✅ **Search & Discovery**
- Full-text search (PostgreSQL FTS or Elasticsearch)
- Faceted filtering (tags, categories, price)
- Relevance scoring
- Cursor-based pagination

✅ **Performance**
- Database indexes on filter columns
- Materialized views for aggregates
- Edge caching (60-300s)
- Query result caching (Redis)

✅ **Scale**
- Horizontal scaling with read replicas
- CDN for asset metadata
- Async jobs for heavy operations
- Rate limiting per user/IP

✅ **User Experience**
- Fast response times (<200ms p95)
- Graceful degradation
- Clear error messages
- Comprehensive documentation

---

## 🏗️ Recommended Architecture

### Option 1: Supabase-Only (Recommended for MVP → Scale)

**Best for:** 0-1M assets, 10K-100K QPS

```
Client → Next.js API Route → Supabase PostgreSQL
                                ↓
                           [Indexes + FTS]
                                ↓
                           [Materialized Views]
```

**Advantages:**
- ✅ No additional infrastructure
- ✅ Built-in auth & RLS
- ✅ Real-time subscriptions
- ✅ Excellent query performance with indexes
- ✅ Cost-effective
- ✅ Easy to maintain

**Performance:**
- Full-text search: 50-200ms
- Filtered queries: 10-50ms
- Aggregations: 5-20ms (with materialized views)
- Supports 100K+ QPS with read replicas

### Option 2: Supabase + Search Service (Enterprise Scale)

**Best for:** 1M+ assets, 100K+ QPS, complex search

```
Client → Next.js API → Supabase (source of truth)
                    → Algolia/Typesense/Meilisearch
                    → Redis (cache)
```

**When to upgrade:**
- Complex relevance scoring needed
- Typo tolerance required
- Faceted search with 10+ filters
- Sub-50ms search required
- 1M+ assets

---

## 📊 Current vs. Proposed Architecture

### Current (Placeholder)

```typescript
// Falls back to mock data
if (!ASSETS_API_BASE) {
  return paginateMockAssets(filters);
}

// Or fetches from undefined external API
const response = await fetch(ASSETS_API_BASE + '/search');
```

**Issues:**
- ❌ External dependency
- ❌ No real data
- ❌ Can't leverage existing Supabase data
- ❌ No filtering/sorting
- ❌ No analytics

### Proposed (Production)

```typescript
// Direct Supabase queries with caching
const { data, error } = await supabase
  .from('assets')
  .select('*, organizations(*), ratings_agg(*)')
  .textSearch('fts', query, { type: 'websearch' })
  .order(sortField, { ascending: sortDir === 'asc' })
  .range(offset, offset + limit - 1);
```

**Benefits:**
- ✅ Uses existing database
- ✅ Real data
- ✅ Leverages RLS
- ✅ Built-in caching
- ✅ Analytics ready

---

## 🛠️ Implementation Plan

### Phase 1: Core API (Week 1)

**Goal:** Replace mock data with real Supabase queries

**Tasks:**

1. **Full-Text Search Setup**
```sql
-- Add FTS column to assets table
ALTER TABLE assets 
ADD COLUMN fts tsvector 
GENERATED ALWAYS AS (
  to_tsvector('english', 
    coalesce(name, '') || ' ' || 
    coalesce(summary, '') || ' ' || 
    array_to_string(tags, ' ')
  )
) STORED;

-- Create GIN index for fast FTS
CREATE INDEX idx_assets_fts ON assets USING gin(fts);
```

2. **Aggregation Views**
```sql
-- Rating aggregates (pre-computed)
CREATE MATERIALIZED VIEW asset_stats AS
SELECT 
  a.id,
  a.external_id,
  COUNT(DISTINCT r.id) as rating_count,
  AVG(r.score)::numeric(3,2) as rating_avg,
  COUNT(DISTINCT ru.id) as runs_count,
  COUNT(DISTINCT b.id) as bookmark_count
FROM assets a
LEFT JOIN ratings r ON r.asset_id = a.id
LEFT JOIN runs ru ON ru.asset_id = a.id
LEFT JOIN bookmarks b ON b.asset_id = a.id
GROUP BY a.id, a.external_id;

-- Refresh materialized view every hour
CREATE INDEX idx_asset_stats_id ON asset_stats(id);
```

3. **API Implementation**
```typescript
// src/lib/marketplace/supabase-search.ts
export async function searchAssetsDB(filters: SearchFilters) {
  let query = supabase
    .from('assets')
    .select(`
      *,
      organizations(id, name, slug, logo_url, verified),
      asset_stats(rating_count, rating_avg, runs_count, bookmark_count)
    `)
    .eq('visibility', 'PUBLIC');
  
  // Full-text search
  if (filters.q) {
    query = query.textSearch('fts', filters.q, {
      type: 'websearch',
      config: 'english'
    });
  }
  
  // Filters
  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.tags) query = query.contains('tags', filters.tags);
  if (filters.eu_only) query = query.eq('eu_only', true);
  if (filters.p95_lte) query = query.lte('p95_ms', filters.p95_lte);
  
  // Sorting
  const sortMap = {
    'newest': ['created_at', false],
    'popular': ['proven_runs', false],
    'rating': ['rating', false],
  };
  const [sortField, ascending] = sortMap[filters.sort || 'newest'];
  query = query.order(sortField, { ascending });
  
  // Pagination (cursor-based)
  const limit = filters.limit || 24;
  const offset = filters.cursor ? parseInt(filters.cursor) : 0;
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) throw error;
  
  return {
    assets: data,
    cursor: data.length === limit ? (offset + limit).toString() : undefined,
    total: count || 0
  };
}
```

### Phase 2: Performance Optimization (Week 2)

**Goal:** Sub-200ms response times

**Tasks:**

1. **Add Indexes**
```sql
-- Performance indexes
CREATE INDEX idx_assets_kind_created ON assets(kind, created_at DESC);
CREATE INDEX idx_assets_visibility_kind ON assets(visibility, kind);
CREATE INDEX idx_assets_rating ON assets(rating DESC) WHERE rating IS NOT NULL;
CREATE INDEX idx_assets_proven_runs ON assets(proven_runs DESC);
CREATE INDEX idx_assets_tags_gin ON assets USING gin(tags);
```

2. **Redis Caching**
```typescript
// src/lib/marketplace/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export async function getCachedSearch(key: string) {
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached as string) : null;
}

export async function setCachedSearch(key: string, data: any, ttl = 60) {
  await redis.setex(key, ttl, JSON.stringify(data));
}
```

3. **Query Optimization**
```typescript
// Use lean queries for list views
.select('id, name, slug, kind, tags, rating, proven_runs, created_at, owner_org_id')

// Full data only for detail views
.select('*, organizations(*), ratings(*), bookmarks(*)')
```

### Phase 3: Advanced Features (Week 3)

**Goal:** Complete marketplace functionality

**Tasks:**

1. **Faceted Search**
```typescript
// Return available filters with counts
export async function getFacets() {
  const { data } = await supabase.rpc('get_facets');
  return {
    kinds: data.kinds, // [{ kind: 'MODEL', count: 123 }]
    tags: data.tags,   // [{ tag: 'nlp', count: 45 }]
    // ...
  };
}
```

2. **Analytics Tracking**
```typescript
// Track search queries
await supabase.from('search_analytics').insert({
  query: filters.q,
  filters: filters,
  result_count: assets.length,
  user_id: userId,
  created_at: new Date().toISOString()
});
```

3. **Rate Limiting**
```typescript
import { rateLimit } from '@/lib/auth/rate-limit';

// In API route
const limiter = rateLimit.API; // 1000 req/min
const allowed = await limiter.check(userId || ip);
if (!allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429 }
  );
}
```

### Phase 4: Scale & Monitor (Week 4)

**Goal:** Production monitoring and optimization

**Tasks:**

1. **Performance Monitoring**
```typescript
// Track query performance
console.log({
  query: filters.q,
  duration_ms: performance.now() - start,
  result_count: assets.length,
  cache_hit: cacheHit
});
```

2. **Materialized View Refresh**
```sql
-- Scheduled job (every hour)
REFRESH MATERIALIZED VIEW CONCURRENTLY asset_stats;
```

3. **Read Replicas** (if needed)
```typescript
// Use replica for read queries
const supabaseRead = createClient(
  process.env.SUPABASE_READ_REPLICA_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

---

## 📡 API Endpoints

### Search & Discovery

**POST /api/marketplace/search**
```typescript
// Request
{
  "q": "text generation",
  "kind": "MODEL",
  "tags": ["nlp", "transformer"],
  "sort": "rating",
  "limit": 24,
  "cursor": "24"
}

// Response
{
  "assets": [...],
  "cursor": "48",
  "total": 156,
  "facets": {
    "kinds": [{ "kind": "MODEL", "count": 120 }],
    "tags": [{ "tag": "nlp", "count": 45 }]
  }
}
```

**GET /api/marketplace/assets/:id**
```typescript
// Response
{
  "asset": {
    "id": "...",
    "name": "GPT-4",
    "kind": "MODEL",
    // ... full details
    "organization": {...},
    "stats": {
      "rating_avg": 4.8,
      "rating_count": 245,
      "runs_count": 12500
    }
  }
}
```

### User Actions

**POST /api/marketplace/assets/:id/bookmark**
**DELETE /api/marketplace/assets/:id/bookmark**
**POST /api/marketplace/assets/:id/rate**
**POST /api/marketplace/assets/:id/run**

### Analytics

**GET /api/marketplace/trending**
```typescript
// Hot assets in last 7 days
{
  "assets": [...],
  "period": "7d"
}
```

**GET /api/marketplace/categories**
```typescript
// Available categories with counts
{
  "categories": [
    { "id": "...", "slug": "nlp", "title": "Natural Language", "count": 450 }
  ]
}
```

---

## 🔒 Security Considerations

### Row Level Security

```sql
-- Public assets visible to all
CREATE POLICY "Public assets viewable"
ON assets FOR SELECT
USING (visibility = 'PUBLIC');

-- Private assets only to owner
CREATE POLICY "Private assets to owner"
ON assets FOR SELECT
USING (
  visibility = 'PRIVATE' AND
  (owner_user_id = auth.uid() OR 
   owner_org_id IN (
     SELECT organization_id FROM organization_members 
     WHERE user_id = auth.uid()
   ))
);
```

### Rate Limiting

```typescript
// Different limits per endpoint
const limits = {
  search: 100,      // per minute
  detail: 300,      // per minute
  action: 30,       // per minute (bookmark, rate)
};
```

### Input Validation

```typescript
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(['MODEL', 'DATASET', 'AGENT', 'COMPUTE']).optional(),
  tags: z.array(z.string()).max(10).optional(),
  sort: z.enum(['newest', 'popular', 'rating']).optional(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional()
});
```

---

## 📊 Performance Targets

### Response Times (p95)

- **Search (no filters):** <100ms
- **Search (with filters):** <200ms
- **Asset detail:** <50ms
- **Facets:** <100ms

### Throughput

- **Search QPS:** 1000+
- **Detail QPS:** 5000+
- **Concurrent users:** 10,000+

### Cache Hit Rates

- **Search results:** 60-80%
- **Asset details:** 80-90%
- **Facets:** 90-95%

---

## 🚀 Migration Strategy

### Week 1: Parallel Implementation

1. Create new `/api/v2/marketplace` endpoints
2. Keep old endpoints working
3. Test extensively with real data

### Week 2: Gradual Rollout

1. Feature flag: `USE_SUPABASE_MARKETPLACE`
2. Roll out to 10% of users
3. Monitor performance & errors
4. Increase to 50%, then 100%

### Week 3: Deprecation

1. Mark old endpoints as deprecated
2. Add sunset headers
3. Update documentation

### Week 4: Cleanup

1. Remove old code
2. Delete mock data
3. Update tests

---

## 📈 Monitoring & Metrics

### Key Metrics

```typescript
// Track in your analytics system
{
  search_requests_total: counter,
  search_duration_ms: histogram,
  search_results_count: histogram,
  cache_hit_rate: gauge,
  error_rate: counter,
  p95_latency_ms: gauge,
  active_users: gauge
}
```

### Alerts

- p95 latency > 500ms
- Error rate > 1%
- Cache hit rate < 50%
- QPS > 80% capacity

---

## 💰 Cost Analysis

### Current (External API)

- **Unknown costs** - depends on provider
- **No control** over pricing
- **Vendor lock-in**

### Proposed (Supabase)

**Supabase Pro ($25/month):**
- 8GB database
- 50GB bandwidth
- 100GB file storage
- Handles 100K+ QPS with caching

**Upstash Redis ($10/month):**
- 1GB cache
- 10K req/day included
- Additional: $0.20/100K requests

**Total: ~$35/month** for production marketplace

**At scale (Enterprise):**
- Supabase Pro + read replicas: ~$200/month
- Redis Pro: ~$50/month
- **Total: ~$250/month** for 1M+ assets, 100K+ users

---

## ✅ Recommendations

### Immediate Actions

1. **This Week:**
   - Add FTS column to assets table
   - Create materialized views
   - Implement Supabase-based search

2. **Next Week:**
   - Add Redis caching
   - Create performance indexes
   - Implement rate limiting

3. **This Month:**
   - Roll out to production
   - Monitor performance
   - Optimize based on metrics

### Long-Term

- **3 months:** Add Algolia/Typesense if search complexity increases
- **6 months:** Implement GraphQL API for flexible queries
- **12 months:** Add machine learning recommendations

---

## 🎯 Success Criteria

✅ **Performance:**
- p95 search latency < 200ms
- p95 detail latency < 50ms
- 99.9% uptime

✅ **Scale:**
- Handle 10K concurrent users
- Support 1M+ assets
- 100K+ searches/day

✅ **Cost:**
- <$50/month for MVP
- <$500/month at scale

✅ **User Experience:**
- Fast, relevant search
- Real-time updates
- Graceful degradation

---

## 📚 Next Steps

1. **Review this document** with your team
2. **Run the database migrations** (FTS, indexes, views)
3. **Implement Phase 1** (core API with Supabase)
4. **Test performance** with real data
5. **Deploy to staging** for validation
6. **Roll out gradually** to production

**Questions? Need Help?**
Refer to the implementation code in:
- `src/lib/marketplace/supabase-search.ts` (to be created)
- `src/app/api/v2/marketplace/` (new API routes)
- `migrations/015_marketplace_fts.sql` (database changes)
