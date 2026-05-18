# 🏗️ COMPOSABLE SEARCH ARCHITECTURE

## 🎯 Goal

Create an **industry-standard composable search system** that:
- Searches across **ALL resource types** (models, datasets, agents, apps, compute)
- Combines **multiple data sources** (external API + Supabase)
- Is **extensible** (easy to add new sources)
- Follows **federated search** best practices

---

## 📊 Current API Resources

From `http://ec2-98-89-47-179.compute-1.amazonaws.com:8001/docs`:

```
Available Endpoints:
├─ /search          → Search ALL resource types ✅
├─ /models          → Models only
├─ /datasets        → Datasets only  
├─ /compute         → Compute resources only
├─ /agents          → Agents only
└─ /apps            → Apps only
```

---

## 🏛️ Industry Standard: Composable Federated Search

### Pattern: Search Adapter + Aggregator

```typescript
┌─────────────────────────────────────────┐
│         Search Orchestrator             │
│  (Coordinates all search sources)       │
└────────┬────────────────────────────────┘
         │
         ├──► External AI Aggregator
         │    ├─ Models
         │    ├─ Datasets
         │    ├─ Agents
         │    ├─ Apps
         │    └─ Compute
         │
         ├──► Supabase
         │    ├─ User's favorites
         │    ├─ Workspace assets
         │    ├─ Custom uploads
         │    └─ Private resources
         │
         ├──► Future: Algolia (optional)
         │    └─ Full-text search
         │
         └──► Future: Internal Assets
              └─ Company-specific resources
```

---

## 🎨 Architecture Design

### 1. Search Adapter Interface

```typescript
// src/lib/search/adapters/base.ts
export interface SearchAdapter {
  name: string;
  search(query: SearchQuery): Promise<SearchResult[]>;
  priority: number; // For result ranking
}

export interface SearchQuery {
  q: string;
  types?: ResourceType[];
  limit?: number;
  offset?: number;
  userId?: string; // For personalization
}

export type ResourceType = 
  | 'MODEL' 
  | 'DATASET' 
  | 'AGENT' 
  | 'APP' 
  | 'COMPUTE';

export interface SearchResult {
  id: string;
  type: ResourceType;
  source: string; // 'ai-aggregator', 'supabase', etc.
  name: string;
  description: string;
  provider: string;
  metadata: Record<string, any>;
  score?: number; // Relevance score
}
```

---

### 2. External AI Aggregator Adapter

```typescript
// src/lib/search/adapters/ai-aggregator.ts
export class AIAggregatorAdapter implements SearchAdapter {
  name = 'ai-aggregator';
  priority = 100;

  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Use /search endpoint for ALL types
    const response = await fetch(
      `${AI_API_BASE}/search?` +
      `q=${query.q}&` +
      `limit=${query.limit || 10}`
    );
    
    const data = await response.json();
    
    return data.results.map(item => ({
      id: item.id,
      type: item.type,
      source: 'ai-aggregator',
      name: item.name,
      description: item.description,
      provider: item.provider,
      metadata: item,
      score: item.score
    }));
  }
}
```

---

### 3. Supabase Adapter

```typescript
// src/lib/search/adapters/supabase.ts
export class SupabaseAdapter implements SearchAdapter {
  name = 'supabase';
  priority = 200; // Higher priority (user's own data)

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const supabase = createClient();
    
    // Search across multiple tables
    const [favorites, workspace, uploads] = await Promise.all([
      this.searchFavorites(query),
      this.searchWorkspace(query),
      this.searchUploads(query)
    ]);
    
    return [...favorites, ...workspace, ...uploads];
  }

  private async searchFavorites(query: SearchQuery) {
    // Search user's bookmarked items
  }

  private async searchWorkspace(query: SearchQuery) {
    // Search workspace-specific assets
  }

  private async searchUploads(query: SearchQuery) {
    // Search user-uploaded files
  }
}
```

---

### 4. Search Orchestrator

```typescript
// src/lib/search/orchestrator.ts
export class SearchOrchestrator {
  private adapters: SearchAdapter[] = [];

  constructor(adapters: SearchAdapter[]) {
    this.adapters = adapters.sort((a, b) => 
      b.priority - a.priority
    );
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    console.log('[SearchOrchestrator] Searching across sources:', {
      query,
      sources: this.adapters.map(a => a.name)
    });

    // Execute all searches in parallel
    const results = await Promise.allSettled(
      this.adapters.map(adapter => 
        adapter.search(query).catch(error => {
          console.error(`[${adapter.name}] Search failed:`, error);
          return [];
        })
      )
    );

    // Merge and deduplicate results
    const allResults = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => (r as PromiseFulfilledResult<SearchResult[]>).value);

    // Deduplicate by ID
    const uniqueResults = this.deduplicateResults(allResults);

    // Sort by priority and relevance
    return this.sortResults(uniqueResults);
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = `${result.type}:${result.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sortResults(results: SearchResult[]): SearchResult[] {
    return results.sort((a, b) => {
      // 1. User's own data first (higher priority)
      if (a.source !== b.source) {
        const aPriority = this.adapters.find(ad => ad.name === a.source)?.priority || 0;
        const bPriority = this.adapters.find(ad => ad.name === b.source)?.priority || 0;
        return bPriority - aPriority;
      }
      
      // 2. Then by relevance score
      return (b.score || 0) - (a.score || 0);
    });
  }

  // Add new source dynamically
  addAdapter(adapter: SearchAdapter) {
    this.adapters.push(adapter);
    this.adapters.sort((a, b) => b.priority - a.priority);
  }
}
```

---

### 5. Usage in API Route

```typescript
// src/app/api/v2/marketplace/search/route.ts
import { SearchOrchestrator } from '@/lib/search/orchestrator';
import { AIAggregatorAdapter } from '@/lib/search/adapters/ai-aggregator';
import { SupabaseAdapter } from '@/lib/search/adapters/supabase';

// Initialize orchestrator (singleton)
const orchestrator = new SearchOrchestrator([
  new AIAggregatorAdapter(),
  new SupabaseAdapter()
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const results = await orchestrator.search({
    q: searchParams.get('q') || '',
    types: searchParams.get('types')?.split(',') as ResourceType[],
    limit: parseInt(searchParams.get('limit') || '10'),
    userId: userId
  });

  return NextResponse.json({
    success: true,
    data: {
      results,
      sources: ['ai-aggregator', 'supabase'],
      total: results.length
    }
  });
}
```

---

## 🎯 Benefits

### 1. Composable ✅
```typescript
// Easy to add new sources
orchestrator.addAdapter(new AlgoliaAdapter());
orchestrator.addAdapter(new InternalDBAdapter());
```

### 2. Testable ✅
```typescript
// Mock adapters for testing
const mockAdapter: SearchAdapter = {
  name: 'mock',
  priority: 1,
  search: async () => [/* test data */]
};
```

### 3. Extensible ✅
```typescript
// Add custom logic per source
class CustomAdapter implements SearchAdapter {
  async search(query) {
    // Custom filtering
    // Custom ranking
    // Custom caching
  }
}
```

### 4. Performant ✅
```typescript
// Parallel searches
// Source-level caching
// Smart deduplication
// Prioritized results
```

---

## 📈 Migration Path

### Phase 1: Basic Multi-Source (Now)
- AI Aggregator (all types)
- Supabase (favorites)

### Phase 2: Enhanced (Week 2)
- Add Algolia for instant search
- Add workspace-specific search
- Add private uploads

### Phase 3: Advanced (Month 1)
- Machine learning ranking
- Personalized results
- Search analytics

---

## 🏆 Industry Examples

### Algolia
```typescript
// Multi-index search
const results = await algolia.multipleQueries([
  { indexName: 'models', query: 'gpt' },
  { indexName: 'datasets', query: 'gpt' }
]);
```

### Elasticsearch
```typescript
// Cross-cluster search
GET /_search
{
  "query": { "multi_match": { "query": "gpt" } },
  "indices": ["models", "datasets", "agents"]
}
```

### Google
```typescript
// Federated search across Gmail, Drive, Calendar
const results = await google.search({
  query: 'project',
  sources: ['gmail', 'drive', 'calendar']
});
```

---

## ✅ Implementation Checklist

- [ ] Create SearchAdapter interface
- [ ] Implement AIAggregatorAdapter (all types)
- [ ] Implement SupabaseAdapter (favorites, workspace)
- [ ] Create SearchOrchestrator
- [ ] Update API route to use orchestrator
- [ ] Add caching layer
- [ ] Add analytics/logging
- [ ] Add tests

---

## 🎉 Result

A **production-ready, industry-standard** search system that:
- ✅ Searches across ALL resource types
- ✅ Combines multiple data sources
- ✅ Is composable and extensible
- ✅ Follows federated search best practices
- ✅ Easy to test and maintain
- ✅ Ready to scale

**This is how companies like Google, Algolia, and Elastic do it!**
