# Cache Architecture Audit

**Date:** 2025-10-16  
**Status:** ✅ Centralized & Industry-Standard

## Executive Summary

Your codebase has a **well-architected centralized cache system** with clear separation of concerns:

1. **Centralized Infrastructure**: `src/lib/cache/` (Redis, React Query, monitoring)
2. **Domain-Specific Implementations**: Auth, Settings (following centralized patterns)
3. **Clear Ownership Rules**: Server-sourced data, UI state, persistent preferences

## Cache System Architecture

### 1. Centralized Cache Infrastructure (`src/lib/cache/`)

**Purpose**: Shared caching infrastructure for the entire application

**Components**:
- `service.ts` - Main cache service
- `client.ts` - Redis/Upstash client
- `providers/redis.ts` - Redis provider implementation
- `compression.ts` - Data compression utilities
- `monitoring.ts` - Cache metrics and alerts
- `warming.ts` - Cache warming strategies
- `config.ts` - Cache configuration
- `types.ts` - Shared types
- `utils.ts` - Utility functions
- `error-handler.ts` - Error handling

**Usage**: Server-sourced data, Redis caching, React Query integration

```typescript
// ✅ Use for server-sourced data
const { data } = useQueryWithCache({
  cacheKey: 'agent_list',
  queryKey: ['agents'],
  queryFn: fetchAgents,
});
```

### 2. Auth Cache (`src/lib/auth/cache.ts`)

**Purpose**: Server-side authentication caching (session, user data, permissions)

**Pattern**: React `cache()` + MemoryCacheStore

**Scope**: Server-only (`import 'server-only'`)

**Key Functions**:
```typescript
// Request-level deduplication
export const getCachedSession = cache(async () => { ... })
export const getCachedUser = cache(async (userId: string) => { ... })
export const getCachedPermissions = cache(async (userId: string) => { ... })

// Prefetch utilities
export async function prefetchSession(): Promise<void>
export async function prefetchUser(userId: string): Promise<void>

// Cache store
export const cacheStore = new MemoryCacheStore()
```

**Usage**: Server components and API routes only

```typescript
// ✅ In server components
const session = await getCachedSession()

// ❌ Cannot use in client components (server-only)
```

### 3. Settings Cache (`src/lib/settings/cache.ts`)

**Purpose**: Client-side settings data caching (team members, invite tokens)

**Pattern**: React `cache()` + ClientCacheStore (browser-safe)

**Scope**: Client-safe (no server-only imports)

**Key Functions**:
```typescript
// Request-level deduplication (works client-side via fetch)
export const getCachedOrgMembers = cache(async (orgId: string) => { ... })
export const getCachedInviteToken = cache(async (orgId: string) => { ... })

// Client-side cache (5min TTL)
export async function prefetchAllSettings(orgId: string): Promise<CachedSettingsData>
export async function invalidateSettingsCache(orgId: string): Promise<void>

// Cache store
const clientCache = new ClientCacheStore() // Browser-safe
```

**Usage**: Client components via SettingsContext

```typescript
// ✅ In client components
const { settingsData } = useSettings()
const members = settingsData?.members || []
```

## Cache Pattern Comparison

| Aspect | Auth Cache | Settings Cache | Centralized Cache |
|--------|-----------|----------------|-------------------|
| **Location** | `src/lib/auth/cache.ts` | `src/lib/settings/cache.ts` | `src/lib/cache/` |
| **Scope** | Server-only | Client-safe | Both |
| **Pattern** | React `cache()` + MemoryCacheStore | React `cache()` + ClientCacheStore | Redis + React Query |
| **Use Case** | Auth sessions, user data | Settings UI data | Server-sourced data |
| **TTL** | Request-level | 5 minutes | Varies (1h - 30d) |
| **Storage** | Memory (server) | Memory (browser) | Redis + Browser |

## Data Ownership Rules

### ✅ Correct Usage

**1. Server-Sourced Data → Centralized Cache (React Query + Redis)**
```typescript
// API responses, database queries
const { data } = useQueryWithCache({
  cacheKey: 'agent_list',
  queryKey: ['agents'],
  queryFn: fetchAgents,
});
```

**2. Auth Data → Auth Cache (Server-only)**
```typescript
// Server components only
const session = await getCachedSession()
const user = await getCachedUser(userId)
```

**3. Settings UI Data → Settings Cache (Client-side)**
```typescript
// Client components
const { settingsData } = useSettings()
const members = settingsData?.members || []
```

**4. UI State → Zustand**
```typescript
// Ephemeral UI state
const useModalStore = createPersistedStore('modal', {
  isOpen: false,
  currentTab: 'profile',
});
```

**5. User Preferences → Local Storage**
```typescript
// Persistent preferences
const { value } = useLocalStorage('theme', 'system')
```

### ❌ Incorrect Usage

**Don't Duplicate Server Data**
```typescript
// ❌ Don't store API data in Zustand
const useAgentStore = createPersistedStore('agent', {
  agentData: {}, // Wrong - should be in React Query
});

// ✅ Use React Query instead
const { data: agentData } = useQueryWithCache({
  cacheKey: 'agent_data',
  queryKey: ['agent'],
  queryFn: fetchAgent,
});
```

**Don't Mix Server/Client Caches**
```typescript
// ❌ Can't use server cache in client
import { getCachedSession } from '@/lib/auth/cache' // Error: server-only

// ✅ Use appropriate cache for context
const { settingsData } = useSettings() // Client-safe
```

## Industry-Standard Patterns Implemented

### ✅ 1. Request-Level Deduplication (React `cache()`)
Both auth and settings caches use React's `cache()` for automatic request deduplication.

```typescript
// Multiple components calling getCachedSession()
// Only 1 DB query per request
export const getCachedSession = cache(async () => { ... })
```

### ✅ 2. Multi-Layer Caching
- **L1**: Memory (request-level via React cache)
- **L2**: Memory (5min TTL via MemoryCacheStore/ClientCacheStore)
- **L3**: Redis (production, via centralized cache)

### ✅ 3. Prefetch Pattern (Notion/Linear style)
Settings modal prefetches all data on open for instant tab switching.

```typescript
// Modal opens → Prefetch everything once
export async function prefetchAllSettings(orgId: string) {
  const [members, inviteToken] = await Promise.all([
    getCachedOrgMembers(orgId),
    getCachedInviteToken(orgId)
  ])
  // Cache for 5 minutes
  await setClientCachedSettings(orgId, { members, inviteToken, ... })
}
```

### ✅ 4. Clear Separation of Concerns
- Auth cache: Server-only authentication data
- Settings cache: Client-side UI data
- Centralized cache: Shared infrastructure

### ✅ 5. Monitoring & Observability
All caches include detailed logging for debugging and performance tracking.

```typescript
console.log('[SETTINGS-CACHE] ⚡ Using cached data (age:', age, 'ms)')
console.log('[DB-CACHE] ✅ getCachedSession COMPLETE', { duration_ms: 45 })
```

## Integration Points

### Settings Context (`src/contexts/settings-context.tsx`)
```typescript
export function SettingsProvider({ children, enabled }) {
  // Prefetch when modal opens
  useEffect(() => {
    if (enabled && workspace?.org?.id) {
      prefetchAllSettings(workspace.org.id)
    }
  }, [enabled, workspace?.org?.id])
  
  return (
    <SettingsContext.Provider value={{ settingsData, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}
```

### Team Settings Component
```typescript
export function TeamSettings() {
  const { settingsData, refreshSettings } = useSettings()
  
  // ⚡ Instant! Uses cached data
  const members = settingsData?.members || []
  
  // Refresh cache after mutations
  const handleRoleChange = async (memberId, newRole) => {
    await fetch(...) // Update
    await refreshSettings() // Refresh cache
  }
}
```

## Best Practices Followed

✅ **1. Single Source of Truth**
- Each data type has ONE cache owner
- No duplication across cache layers

✅ **2. Clear Boundaries**
- Server-only code marked with `'server-only'`
- Client-safe code has no server imports

✅ **3. Automatic Cache Management**
- React `cache()` handles request deduplication
- TTL-based expiration for stale data
- Event-driven invalidation for mutations

✅ **4. Industry-Standard Patterns**
- Follows Notion/Linear/Slack patterns
- Prefetch on modal open
- Instant tab switching

✅ **5. Monitoring & Observability**
- Detailed logging for debugging
- Performance metrics tracking
- Error handling with fallbacks

## Recommendations

### ✅ Current State: Excellent
Your cache architecture is:
- Well-structured and centralized
- Follows industry standards
- Has clear separation of concerns
- Properly documented

### Future Enhancements (Optional)

1. **Redis Integration for Auth Cache**
   ```typescript
   // When scaling to multiple servers
   // Currently: MemoryCacheStore (single server)
   // Future: RedisCache (distributed)
   export const cacheStore = new RedisCache()
   ```

2. **Cache Warming Strategy**
   ```typescript
   // Warm frequently accessed data on startup
   export async function warmCache() {
     await prefetchCommonSettings()
     await warmAuthData()
   }
   ```

3. **Cache Metrics Dashboard**
   - Track hit/miss rates per cache
   - Monitor cache memory usage
   - Alert on performance degradation

## Summary

### Current Cache Implementations

1. **`src/lib/cache/`** - ✅ Centralized infrastructure (Redis, React Query)
2. **`src/lib/auth/cache.ts`** - ✅ Server-only auth cache
3. **`src/lib/settings/cache.ts`** - ✅ Client-safe settings cache

### Key Achievements

✅ **Centralized**: Single source of truth for caching infrastructure  
✅ **Separated**: Clear domain boundaries (auth, settings, general)  
✅ **Industry-Standard**: Follows Notion/Linear patterns  
✅ **Well-Documented**: Clear usage guidelines and examples  
✅ **Monitored**: Logging and performance tracking included  

### Conclusion

Your caching system is **production-ready** and follows **industry best practices**. The architecture is:
- Centralized yet flexible
- Well-separated by domain
- Properly scoped (server vs client)
- Easy to extend and maintain

**Status: ✅ APPROVED** - No major changes needed!
