# 🏗️ Server-Side Data Fetching Architecture Audit

**Date:** October 14, 2025  
**Status:** 🚨 **NEEDS MAJOR REFACTORING**

---

## 🎯 Executive Summary

Your server-side data fetching is **not industry standard**:
- ❌ Privy API called on EVERY page load (1.7s external call)
- ❌ Duplicate profile queries  
- ❌ Hard-coded fetching scattered across files
- ❌ No session caching strategy
- ❌ No proper data loader pattern

**Industry Standard:** JWT validation should be local/cached, not calling external API every time.

---

## 🚨 Critical Issues

### 1. **Privy API Called Every Page Load** (CRITICAL)
**File:** `src/lib/auth/session.ts:192`

```typescript
// THIS IS THE PROBLEM:
const claims = await privy.verifyAuthToken(token);
// ⚠️ Makes HTTP call to Privy API: ~1700ms EVERY TIME
```

**Why This is Wrong:**
- Industry standard: JWT tokens are self-contained and can be verified **locally**
- Privy SDK makes external API call to verify token
- Should only need to verify signature, not call external API

**Industry Standard Pattern:**
```typescript
// Verify JWT signature locally (using public key)
const decoded = jwt.verify(token, publicKey); // <10ms
// Only call external API if token is expired/suspicious
```

---

### 2. **No Session Caching** (CRITICAL)
**Current:** Every request fetches everything from scratch
**Industry Standard:** Use Redis to cache sessions

```typescript
// CURRENT (no caching)
export async function getServerSession() {
  // 1. Call Privy API: 1700ms
  // 2. Query database: 120ms
  // 3. Query org: 118ms
  // Total: ~2000ms EVERY TIME
}

// INDUSTRY STANDARD (with Redis)
export async function getServerSession() {
  const cached = await redis.get(`session:${tokenHash}`);
  if (cached) return JSON.parse(cached); // <5ms!
  
  // Only on cache miss:
  const session = await fetchFreshSession();
  await redis.setex(`session:${tokenHash}`, 3600, JSON.stringify(session));
  return session;
}
```

---

### 3. **Duplicate Profile Fetching** (HIGH)
**File:** `src/app/layout.tsx`

```typescript
// PROBLEM: Profile fetched TWICE

// Fetch #1 (inside getCachedSession)
const auth = await getServerAuth()  // Calls getCachedUser → fetches profile

// Fetch #2 (explicit call)
const initialProfile = await getProfile(auth.userId)  // Fetches profile AGAIN!
```

**Why This is Wrong:**
- Wastes 113ms on redundant query
- More database load
- Inefficient

**Fix:**
```typescript
const auth = await getServerAuth()
const initialProfile = auth.user  // Already fetched!
```

---

### 4. **No Centralized Data Loader** (HIGH)
**Current:** Data fetching scattered in multiple files:
- `src/app/layout.tsx` - fetches auth, profile, org
- `src/lib/auth/session.ts` - fetches identity links
- `src/lib/auth/cache.ts` - fetches profile
- `src/lib/db/index.ts` - fetches profile, org

**Industry Standard:** Single data loader that coordinates all fetching

```typescript
// INDUSTRY STANDARD: src/lib/loaders/server-loader.ts

export async function loadServerContext(request: Request) {
  const session = await loadSession(request);  // Cached
  
  if (!session) return { user: null };
  
  // Fetch all data in PARALLEL
  const [profile, orgs, preferences] = await Promise.all([
    getProfile(session.userId),
    getOrganizations(session.userId),
    getPreferences(session.userId)
  ]);
  
  return {
    user: session,
    profile,
    orgs,
    preferences
  };
}
```

---

### 5. **No Request Deduplication** (MEDIUM)
**Problem:** Multiple components calling same queries

**Industry Standard:** Use DataLoader pattern
```typescript
import DataLoader from 'dataloader';

const profileLoader = new DataLoader(async (userIds) => {
  // Batch load profiles
  const profiles = await db.profiles.findMany({
    where: { id: { in: userIds } }
  });
  return userIds.map(id => profiles.find(p => p.id === id));
});

// Multiple calls get batched:
const profile1 = await profileLoader.load(userId1);
const profile2 = await profileLoader.load(userId2);
// Single database query for both!
```

---

## 🏗️ Industry-Standard Architecture

### Recommended Structure:

```
src/lib/
├── loaders/
│   ├── session-loader.ts      # JWT verification + caching
│   ├── profile-loader.ts      # Profile data with batching
│   ├── org-loader.ts          # Organization data
│   └── index.ts               # Main loader coordinator
├── cache/
│   ├── redis.ts               # Redis client
│   ├── session-cache.ts       # Session caching
│   └── query-cache.ts         # Query result caching
└── auth/
    ├── jwt-verify.ts          # Local JWT verification
    ├── session.ts             # Session management
    └── types.ts               # Auth types
```

### Key Principles:

1. **Local JWT Verification**
   - Verify signature locally (fast)
   - Only call external API if token suspicious

2. **Redis Session Cache**
   - Cache complete session for 1 hour
   - Invalidate on logout/token refresh

3. **Parallel Data Fetching**
   - Use Promise.all() for independent queries
   - Load profile + org + preferences together

4. **Request Deduplication**
   - Use DataLoader for batching
   - Cache queries within request

5. **Centralized Loader**
   - Single entry point for all server data
   - Consistent error handling
   - Easy to monitor/optimize

---

## 📋 Implementation Plan

### Phase 1: Add Session Caching (HIGH PRIORITY)
**Impact:** Reduce 1.7s → <10ms on cache hit

```typescript
// src/lib/cache/session-cache.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getCachedSession(tokenHash: string) {
  const cached = await redis.get(`session:${tokenHash}`);
  if (cached) return JSON.parse(cached as string);
  return null;
}

export async function setCachedSession(tokenHash: string, session: any) {
  await redis.setex(`session:${tokenHash}`, 3600, JSON.stringify(session));
}
```

```typescript
// Update src/lib/auth/session.ts
export async function getServerSession(): Promise<ServerSession> {
  const token = await getToken();
  if (!token) return { userId: null };
  
  const tokenHash = createHash('sha256').update(token).digest('hex');
  
  // Try cache first
  const cached = await getCachedSession(tokenHash);
  if (cached) {
    console.log('[SESSION] ✅ Cache HIT');
    return cached;
  }
  
  console.log('[SESSION] ❌ Cache MISS, fetching fresh');
  
  // Fetch fresh (only on cache miss)
  const session = await fetchFreshSession(token);
  
  // Cache for 1 hour
  await setCachedSession(tokenHash, session);
  
  return session;
}
```

**Expected Result:** 1700ms → <10ms (170x faster!)

---

### Phase 2: Local JWT Verification (HIGH PRIORITY)
**Impact:** Reduce external API dependency

```typescript
// src/lib/auth/jwt-verify.ts
import jwt from 'jsonwebtoken';

export async function verifyJWT(token: string) {
  try {
    // Verify locally using Privy's public key
    const publicKey = await getPrivyPublicKey(); // Cache this
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256']
    });
    return decoded;
  } catch (error) {
    // Only on verification failure, call Privy API
    console.log('[JWT] Local verification failed, calling Privy API');
    return await privyClient.verifyAuthToken(token);
  }
}
```

**Expected Result:** Only call Privy API on first request or verification failure

---

### Phase 3: Remove Duplicate Query (QUICK WIN)
**Impact:** Save 113ms

```typescript
// src/app/layout.tsx

// BEFORE
const auth = await getServerAuth()
const initialProfile = await getProfile(auth.userId)  // ❌

// AFTER
const auth = await getServerAuth()
const initialProfile = auth.user  // ✅ Already fetched
```

---

### Phase 4: Parallel Fetching (MEDIUM PRIORITY)
**Impact:** Reduce total time by doing work in parallel

```typescript
// src/app/layout.tsx

// BEFORE (serial)
const auth = await getServerAuth()        // 1840ms
const profile = await getProfile()        // 113ms
const orgs = await getUserOrganizations() // 118ms
// Total: 2071ms

// AFTER (parallel)
const auth = await getServerAuth()  // 1840ms (has profile already)
const orgs = await getUserOrganizations(auth.userId)  // 118ms in parallel
// Total: 1840ms (saved 231ms by parallelizing and removing duplicate)

// EVEN BETTER (with caching)
const auth = await getServerAuth()  // 10ms (from cache!)
const orgs = await getUserOrganizations(auth.userId)  // 118ms
// Total: 128ms (93% faster!)
```

---

### Phase 5: Centralized Loader (LONG TERM)
**Impact:** Better architecture, easier to maintain

```typescript
// src/lib/loaders/index.ts
export async function loadServerContext(request: Request) {
  const startTime = Date.now();
  
  // Step 1: Load session (cached)
  const session = await loadSession(request);
  
  if (!session) {
    return { user: null, profile: null, orgs: [] };
  }
  
  // Step 2: Load all user data in PARALLEL
  const [profile, orgs, preferences] = await Promise.all([
    profileLoader.load(session.userId),
    orgLoader.loadUserOrgs(session.userId),
    preferencesLoader.load(session.userId)
  ]);
  
  console.log('[LOADER] ✅ Loaded all server context', {
    duration_ms: Date.now() - startTime
  });
  
  return {
    user: session,
    profile,
    orgs,
    preferences
  };
}
```

---

## 📊 Expected Performance

### Current State:
```
Server Time: 2,073ms
├─ Privy API: 1,717ms (83%)
├─ Profile:     119ms (6%)
├─ Org:         118ms (6%)
└─ Duplicate:   113ms (5%)
```

### After Phase 1 (Session Cache):
```
Server Time: ~250ms (8x faster!)
├─ Cache hit:    10ms (cached session)
├─ Profile:     119ms
└─ Org:         118ms
```

### After Phase 3 (Remove Duplicate):
```
Server Time: ~137ms (15x faster!)
├─ Cache hit:    10ms
└─ Org:         118ms (profile already in session)
```

### After Phase 4 (Parallel):
```
Server Time: ~128ms (16x faster!)
└─ All parallel: 128ms
```

### Final Target:
```
Server Time: <100ms (20x faster!)
└─ Everything cached and parallelized
```

---

## 🎯 Priority Actions

### This Week:
1. ✅ Add detailed logging (done)
2. [ ] Implement session caching with Redis
3. [ ] Remove duplicate profile query
4. [ ] Test with slow 3G network

### Next Week:
1. [ ] Implement local JWT verification
2. [ ] Add parallel fetching
3. [ ] Create centralized loader
4. [ ] Add DataLoader for batching

---

## 🔍 Questions to Answer

1. **Can we get Privy's public key for local JWT verification?**
   - Check Privy docs
   - May need to request from support

2. **Do we have Redis infrastructure?**
   - Check Vercel/deployment setup
   - Upstash Redis is free tier available

3. **What's the session invalidation strategy?**
   - Logout
   - Token refresh
   - Password change

---

## 📝 Summary

**Current Architecture:** ❌ Not Industry Standard
- External API on every request
- No caching
- Duplicate queries
- Scattered fetching logic

**Recommended Architecture:** ✅ Industry Standard
- Local JWT verification
- Redis session caching
- Centralized data loader
- Parallel + batched queries

**Expected Impact:**
- **Current:** 2,073ms server time
- **Target:** <100ms server time
- **Improvement:** 20x faster!

**Effort:** 2-3 days of focused work

**Next Step:** Implement session caching (Phase 1) - highest impact, lowest effort
