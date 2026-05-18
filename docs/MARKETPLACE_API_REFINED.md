# 🏪 Marketplace API - Refined Implementation (Hybrid Architecture)

**Date:** January 10, 2025  
**Status:** Production Strategy  
**API Analyzed:** http://ec2-98-89-47-179.compute-1.amazonaws.com:8001/docs

---

## 📋 Executive Summary

After analyzing your **AI Aggregator API**, I'm **revising my recommendation**. Your external API is actually **well-designed** and should be **kept and enhanced** with Supabase as an overlay layer. This hybrid approach is **industry-standard** for marketplaces.

---

## 🎯 API Analysis

### Your AI Aggregator API (AWS EC2)

**What it provides:**
```
✅ Unified Model Invocation (OpenAI, Anthropic, HuggingFace, etc.)
✅ Resource Discovery (1000+ models, datasets)
✅ Elasticsearch-powered search
✅ Pluggable provider architecture
✅ Normalized responses
✅ Admin tools (reindexing, stats)
```

**Endpoints:**
- `GET /models` - List AI models
- `GET /datasets` - List datasets
- `GET /compute` - List compute resources
- `GET /agents` - List agents
- `GET /apps` - List apps
- `GET /search` - Unified search across all resources
- `POST /invoke/model/{model_id}` - Execute models
- `GET /providers` - List providers

**Architecture:**
```
AI Aggregator API
├─ HuggingFace Integration (1000+ models)
├─ Eden AI Integration (100+ providers)
├─ Elasticsearch (search index)
└─ Unified Response Format
```

---

## 🏗️ Recommended Architecture: **Hybrid Overlay**

### Industry Standard Pattern

This is how **successful marketplaces** work:

**1. NPM Registry**
```
Central Registry (source data) + Local Mirrors + Download stats
```

**2. Docker Hub**
```
Central Catalog (images) + User metadata (pulls, stars, comments)
```

**3. AWS Marketplace**
```
Product Catalog (listings) + Customer data (purchases, reviews)
```

**4. Chrome Web Store**
```
Extension catalog (source) + User data (ratings, installs)
```

### Your Architecture (Recommended)

```
┌─────────────────────────────────────────────────────┐
│                    Client (Next.js)                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────┐
│           Next.js API Layer (BFF Pattern)            │
│  • Request routing                                   │
│  • Data merging                                      │
│  • Caching strategy                                  │
│  • Auth enforcement                                  │
└──────────┬────────────────────────┬──────────────────┘
           │                        │
           ↓                        ↓
┌──────────────────┐    ┌───────────────────────────┐
│  AI Aggregator   │    │      Supabase             │
│  (Source Data)   │    │   (Overlay Data)          │
│                  │    │                           │
│ • Models         │    │ • Ratings                 │
│ • Datasets       │    │ • Bookmarks               │
│ • Agents         │    │ • Runs (usage tracking)   │
│ • Compute        │    │ • Organizations           │
│ • Apps           │    │ • Custom metadata         │
│ • Search (ES)    │    │ • Analytics               │
│ • Invoke         │    │ • User comments           │
└──────────────────┘    └───────────────────────────┘
           │                        │
           └────────────┬───────────┘
                        ↓
              ┌─────────────────┐
              │  Redis Cache    │
              │  (Performance)  │
              └─────────────────┘
```

---

## 💡 Why This Approach is Better

### ❌ What I Initially Suggested (Wrong)
- Replace external API with Supabase-only
- Re-implement Elasticsearch
- Lose provider integrations
- Duplicate data

### ✅ What You Should Actually Do (Right)
- **Keep AI Aggregator API** (it's your core asset!)
- **Add Supabase overlay** for user/org data
- **Merge data in Next.js** (BFF pattern)
- **Cache aggressively** with Redis

### Benefits

**1. Separation of Concerns**
```
AI Aggregator API      → What models exist (source of truth)
Supabase              → How users interact with them (overlay)
Next.js API           → Merge + present unified view
```

**2. Scalability**
```
AI Aggregator  → Scales independently
Supabase       → Scales independently
Caching        → Reduces load on both
```

**3. Maintainability**
```
AI Aggregator  → Update providers without touching user data
Supabase       → Update user features without touching catalog
```

**4. Performance**
```
Search (ES)         → 50-100ms (fast!)
Overlay data        → 10-20ms (Supabase)
Merged + cached     → 20-50ms (excellent!)
```

---

## 🛠️ Implementation Plan

### Phase 1: Integration Layer (Week 1)

**Goal:** Create BFF (Backend for Frontend) that merges AI Aggregator + Supabase data

**1. AI Aggregator Client**

```typescript
// src/lib/marketplace/ai-aggregator-client.ts
import { Redis } from '@upstash/redis';

const AI_API_BASE = process.env.AI_AGGREGATOR_API_BASE || 
  'http://ec2-98-89-47-179.compute-1.amazonaws.com:8001';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

// Type-safe client
export class AIAggregatorClient {
  private baseURL: string;
  
  constructor(baseURL: string = AI_API_BASE) {
    this.baseURL = baseURL;
  }
  
  /**
   * Search all resources with caching
   */
  async search(params: {
    q?: string;
    kind?: 'MODEL' | 'DATASET' | 'AGENT' | 'COMPUTE' | 'APP';
    limit?: number;
    offset?: number;
  }) {
    const cacheKey = `ai:search:${JSON.stringify(params)}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }
    
    // Call AI Aggregator API
    const url = new URL('/search', this.baseURL);
    if (params.q) url.searchParams.set('q', params.q);
    if (params.kind) url.searchParams.set('kind', params.kind);
    if (params.limit) url.searchParams.set('limit', params.limit.toString());
    if (params.offset) url.searchParams.set('offset', params.offset.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      throw new Error(`AI Aggregator API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache for 60 seconds
    await redis.setex(cacheKey, 60, JSON.stringify(data));
    
    return data;
  }
  
  /**
   * Get models
   */
  async getModels(params?: {
    provider?: string;
    limit?: number;
    offset?: number;
  }) {
    const cacheKey = `ai:models:${JSON.stringify(params || {})}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached as string);
    
    const url = new URL('/models', this.baseURL);
    if (params?.provider) url.searchParams.set('provider', params.provider);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    if (params?.offset) url.searchParams.set('offset', params.offset.toString());
    
    const response = await fetch(url.toString());
    const data = await response.json();
    
    await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min cache
    return data;
  }
  
  /**
   * Get datasets
   */
  async getDatasets(params?: { limit?: number; offset?: number }) {
    // Similar to getModels
    const url = new URL('/datasets', this.baseURL);
    // ... implementation
  }
  
  /**
   * Invoke a model
   */
  async invokeModel(modelId: string, request: any) {
    // NO caching for invocations!
    const url = new URL(`/invoke/model/${modelId}`, this.baseURL);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
    
    return response.json();
  }
}

export const aiAggregator = new AIAggregatorClient();
```

**2. Data Merger**

```typescript
// src/lib/marketplace/merger.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface EnrichedAsset {
  // From AI Aggregator
  id: string;
  name: string;
  kind: 'MODEL' | 'DATASET' | 'AGENT' | 'COMPUTE' | 'APP';
  provider: string;
  description?: string;
  
  // From Supabase (overlay)
  rating_avg?: number;
  rating_count?: number;
  runs_count?: number;
  bookmark_count?: number;
  user_bookmarked?: boolean;
  user_rating?: number;
  organization?: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
  };
}

/**
 * Merge AI Aggregator results with Supabase overlay data
 */
export async function enrichAssets(
  aiAssets: any[],
  userId?: string
): Promise<EnrichedAsset[]> {
  if (aiAssets.length === 0) return [];
  
  // Extract external IDs
  const externalIds = aiAssets.map(a => a.id);
  
  // Fetch overlay data from Supabase
  const { data: overlays } = await supabase
    .from('assets')
    .select(`
      external_id,
      owner_org_id,
      rating,
      proven_runs,
      organizations!inner(id, name, slug, verified),
      asset_stats!left(rating_count, rating_avg, runs_count, bookmark_count)
    `)
    .in('external_id', externalIds);
  
  // Fetch user-specific data if authenticated
  let userBookmarks: Set<string> = new Set();
  let userRatings: Map<string, number> = new Map();
  
  if (userId) {
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('asset_id, assets!inner(external_id)')
      .eq('user_id', userId)
      .in('assets.external_id', externalIds);
    
    const { data: ratings } = await supabase
      .from('ratings')
      .select('score, asset_id, assets!inner(external_id)')
      .eq('user_id', userId)
      .in('assets.external_id', externalIds);
    
    bookmarks?.forEach(b => userBookmarks.add(b.assets.external_id));
    ratings?.forEach(r => userRatings.set(r.assets.external_id, r.score));
  }
  
  // Create lookup map
  const overlayMap = new Map(
    overlays?.map(o => [o.external_id, o]) || []
  );
  
  // Merge data
  return aiAssets.map(asset => {
    const overlay = overlayMap.get(asset.id);
    const stats = overlay?.asset_stats?.[0];
    
    return {
      // AI Aggregator data (source)
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      provider: asset.provider,
      description: asset.description,
      
      // Supabase overlay
      rating_avg: stats?.rating_avg || overlay?.rating,
      rating_count: stats?.rating_count || 0,
      runs_count: stats?.runs_count || overlay?.proven_runs || 0,
      bookmark_count: stats?.bookmark_count || 0,
      user_bookmarked: userBookmarks.has(asset.id),
      user_rating: userRatings.get(asset.id),
      organization: overlay?.organizations,
    };
  });
}
```

**3. Unified API Route**

```typescript
// src/app/api/v2/marketplace/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { aiAggregator } from '@/lib/marketplace/ai-aggregator-client';
import { enrichAssets } from '@/lib/marketplace/merger';
import { getServerAuth } from '@/lib/auth/server-utils';
import { rateLimit } from '@/lib/auth/rate-limit';

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    // Rate limiting
    const { userId } = await getServerAuth();
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const limiter = rateLimit.API;
    
    const allowed = await limiter.check(userId || ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const params = {
      q: searchParams.get('q') || undefined,
      kind: searchParams.get('kind') as any || undefined,
      limit: parseInt(searchParams.get('limit') || '24'),
      offset: parseInt(searchParams.get('offset') || '0'),
    };
    
    // 1. Fetch from AI Aggregator (with caching)
    const aiResults = await aiAggregator.search(params);
    
    // 2. Enrich with Supabase overlay
    const enriched = await enrichAssets(aiResults.results || [], userId);
    
    const duration = performance.now() - startTime;
    
    console.log({
      endpoint: '/api/v2/marketplace/search',
      duration_ms: duration.toFixed(0),
      result_count: enriched.length,
      user_id: userId,
    });
    
    return NextResponse.json({
      assets: enriched,
      total: aiResults.total,
      offset: params.offset,
      limit: params.limit,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      }
    });
    
  } catch (error) {
    console.error('[marketplace/search] Error:', error);
    
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

### Phase 2: Supabase Sync (Week 2)

**Goal:** Keep Supabase assets table in sync with AI Aggregator

**1. Sync Job**

```typescript
// src/lib/marketplace/sync-job.ts

/**
 * Periodic sync job to keep Supabase assets table updated
 * Run this via cron or Vercel edge functions
 */
export async function syncAssetsFromAggregator() {
  console.log('[sync] Starting asset sync...');
  
  const startTime = performance.now();
  let synced = 0;
  let errors = 0;
  
  try {
    // Fetch all resources from AI Aggregator
    const [models, datasets, agents, compute, apps] = await Promise.all([
      aiAggregator.getModels({ limit: 1000 }),
      aiAggregator.getDatasets({ limit: 1000 }),
      // ... other types
    ]);
    
    const allResources = [
      ...models.map(m => ({ ...m, kind: 'MODEL' })),
      ...datasets.map(d => ({ ...d, kind: 'DATASET' })),
      // ... etc
    ];
    
    // Upsert to Supabase
    for (const resource of allResources) {
      try {
        await supabase
          .from('assets')
          .upsert({
            external_id: resource.id,
            kind: resource.kind,
            name: resource.name,
            summary: resource.description,
            tags: resource.tags || [],
            visibility: 'PUBLIC',
            // Initialize counters if new
            proven_runs: 0,
            rating: 0,
          }, {
            onConflict: 'external_id',
            ignoreDuplicates: false // Update existing
          });
        
        synced++;
      } catch (err) {
        console.error(`[sync] Failed to sync ${resource.id}:`, err);
        errors++;
      }
    }
    
    const duration = performance.now() - startTime;
    
    console.log({
      message: '[sync] Completed',
      duration_ms: duration.toFixed(0),
      synced,
      errors,
      total: allResources.length
    });
    
  } catch (error) {
    console.error('[sync] Fatal error:', error);
    throw error;
  }
}
```

**2. Cron Endpoint**

```typescript
// src/app/api/cron/sync-assets/route.ts
import { NextResponse } from 'next/server';
import { syncAssetsFromAggregator } from '@/lib/marketplace/sync-job';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    await syncAssetsFromAggregator();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: error },
      { status: 500 }
    );
  }
}
```

**3. Vercel Cron Config**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-assets",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### Phase 3: User Actions (Week 3)

**Goal:** Implement bookmarks, ratings, runs tracking

**1. Bookmark API**

```typescript
// src/app/api/v2/marketplace/assets/[id]/bookmark/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/
