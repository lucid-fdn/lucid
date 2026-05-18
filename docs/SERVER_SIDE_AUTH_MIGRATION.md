# Server-Side Auth Migration Plan

**Date:** January 6, 2025  
**Status:** 🚧 Planning  
**Goal:** Migrate to fully server-side auth with Privy

---

## 📊 Current State Analysis

### ✅ What's Already Good

**Server-Side Components:**
- ✅ `lib/auth/session.ts` - Server-side session management with JIT user creation
- ✅ `lib/auth/middleware-helpers.ts` - Privy token verification
- ✅ `middleware.ts` - Route protection
- ✅ Rate limiting (5/min + 50/hr) on auth endpoints
- ✅ CSRF protection with double-submit pattern
- ✅ Audit logging for all auth events
- ✅ Supabase integration with identity_links table

**Configuration:**
- ✅ Feature flags system (`lib/features.ts`)
- ✅ Cache configuration (`lib/cache/config.ts`)
- ✅ Environment variables properly configured
- ✅ TypeScript types defined

### ⚠️ Issues to Address

**Client-Side Overuse (140 Privy imports):**
- 🔴 Many components using `usePrivy()` hook directly
- 🔴 Auth state managed client-side in `contexts/auth-context.tsx`
- 🔴 `PrivyProvider` wrapping entire app
- 🔴 Login flows mostly client-side
- 🔴 No session caching (repeated DB queries)
- 🔴 Mixed client/server auth patterns

**Performance Issues:**
- 🟡 No caching of user sessions
- 🟡 DB queries on every server component render
- 🟡 No prefetching of auth state
- 🟡 Redundant Privy API calls

**Architecture Issues:**
- 🟡 No clear separation between client/server auth
- 🟡 Auth context doesn't work with RSC
- 🟡 No server actions for auth operations
- 🟡 Limited use of Next.js 14+ features

---

## 🎯 Migration Goals

### 1. Performance & Scalability
- ⚡ Cache user sessions (Redis-ready)
- ⚡ Minimize DB queries with smart caching
- ⚡ Prefetch auth state where possible
- ⚡ Optimize for server components

### 2. Security
- 🔒 Move all sensitive auth logic server-side
- 🔒 Minimize client-side token exposure
- 🔒 Implement proper session refresh
- 🔒 Add session invalidation on logout

### 3. Developer Experience
- 🛠️ Simple server-side auth API
- 🛠️ Type-safe auth utilities
- 🛠️ Clear patterns for protected routes
- 🛠️ Integration with feature flags

### 4. Industry Standards
- ✨ Follow Next.js 14+ best practices
- ✨ Use React Server Components
- ✨ Implement server actions
- ✨ Proper error boundaries

---

## 📋 Implementation Plan

### Phase 1: Core Server Infrastructure (Priority: HIGH)

**1.1 Enhanced Session Management**
- [ ] Create `lib/auth/server-session.ts` with caching
- [ ] Add session cache utilities (in-memory → Redis-ready)
- [ ] Implement session prefetching
- [ ] Add session invalidation on logout
- [ ] Cache user profile data with TTL

**1.2 Server Actions**
```typescript
// lib/auth/actions.ts
'use server'

export async function loginAction(credentials)
export async function logoutAction()
export async function refreshSessionAction()
export async function getUserProfileAction()
```

**1.3 Auth API Routes**
- [ ] `app/api/auth/session/route.ts` - Get current session
- [ ] `app/api/auth/user/route.ts` - Get user profile
- [ ] Enhance `app/api/auth/refresh/route.ts` with caching
- [ ] Add `app/api/auth/logout/route.ts` with session cleanup

**1.4 Centralized Auth Config**
```typescript
// lib/auth/config.ts
export const AUTH_CONFIG = {
  sessionTTL: 3600, // 1 hour
  refreshTokenTTL: 86400, // 24 hours
  cacheTTL: 300, // 5 minutes
  cookieOptions: { /* ... */ }
}
```

### Phase 2: Server Components Migration (Priority: HIGH)

**2.1 Create Server Auth Utilities**
```typescript
// lib/auth/server-utils.ts
export async function getServerAuth() // Returns session + user
export async function requireServerAuth() // Throws if not authed
export async function getServerUser() // Returns user or null
```

**2.2 Protected Layout Pattern**
```typescript
// app/(studio)/layout.tsx
import { requireServerAuth } from '@/lib/auth/server-utils'

export default async function StudioLayout() {
  const { user } = await requireServerAuth()
  
  return (
    <div>
      <Navbar user={user} />
      {children}
    </div>
  )
}
```

**2.3 Migrate Pages to Server Components**
- [ ] `app/(studio)/dashboard/page.tsx`
- [ ] `app/(studio)/settings/*/page.tsx`
- [ ] `app/(studio)/agents/*/page.tsx`
- [ ] All protected pages

**2.4 Create Client Auth Context (Minimal)**
```typescript
// contexts/auth-context-client.tsx
'use client'

// Only for UI state, not for auth logic
export function AuthProvider({ session, children }) {
  // Hydrate client with server session
  // Handle optimistic updates
  // Manage loading states
}
```

### Phase 3: Caching Layer (Priority: HIGH)

**3.1 Session Cache**
```typescript
// lib/auth/cache.ts
import { cache } from 'react'
import { REACT_QUERY } from '@/lib/cache/config'

export const getCachedSession = cache(async () => {
  // Cache for React request
  return getServerSession()
})

export const getCachedUser = cache(async (userId: string) => {
  // Cache user profile
  return getUserProfile(userId)
})
```

**3.2 Cache Invalidation**
```typescript
// On logout, refresh, etc.
revalidateTag('user-session')
revalidateTag(`user-profile-${userId}`)
```

**3.3 Redis-Ready Architecture**
```typescript
// lib/cache/session-store.ts
interface SessionStore {
  get(key: string): Promise<Session | null>
  set(key: string, session: Session, ttl: number): Promise<void>
  delete(key: string): Promise<void>
}

// Implementations:
class MemorySessionStore implements SessionStore // MVP
class RedisSessionStore implements SessionStore // Production
```

### Phase 4: Client Optimization (Priority: MEDIUM)

**4.1 Minimize Client Privy Usage**
Only keep client-side for:
- Login UI (`usePrivy().login()`)
- Logout UI (`usePrivy().logout()`)
- Wallet connection UI
- Token refresh (automatic)

**4.2 Remove Unnecessary usePrivy() Calls**
Replace:
```typescript
// ❌ OLD: Client-side
const { user } = usePrivy()
```

With:
```typescript
// ✅ NEW: Server-side
const { user } = await getServerAuth()
```

**4.3 Optimize PrivyProvider**
```typescript
// app/providers.tsx
<PrivyProvider
  config={{
    loginMethods: ['wallet', 'email'],
    appearance: { /* ... */ }
  }}
>
  {/* Minimal client usage */}
</PrivyProvider>
```

### Phase 5: Feature Integration (Priority: MEDIUM)

**5.1 Feature Flags Integration**
```typescript
// lib/auth/features.ts
import { isFeatureEnabled } from '@/lib/features'

export async function getAuthFeatures(user: User) {
  return {
    walletLogin: isFeatureEnabled('walletLogin'),
    emailLogin: isFeatureEnabled('emailLogin'),
    googleLogin: isFeatureEnabled('googleLogin'),
    web3Features: isFeatureEnabled('web3Features'),
  }
}
```

**5.2 Notifications Integration**
```typescript
// On auth events, trigger notifications
import { useNotification } from '@/contexts/notification-context'

authEvents.on('login', () => {
  showNotification({ type: 'success', title: 'Welcome back!' })
})
```

**5.3 Audit Integration**
```typescript
// All auth operations log to audit
import { AuthAudit } from '@/lib/auth/audit'

await AuthAudit.loginSuccess(userId, ip, userAgent)
```

### Phase 6: API Routes Enhancement (Priority: LOW)

**6.1 Centralized Auth Middleware**
```typescript
// lib/auth/api-middleware.ts
export async function withAuth(handler, options?) {
  return async (req, res) => {
    const session = await getServerSession()
    if (!session) return unauthorized()
    
    return handler(req, res, session)
  }
}
```

**6.2 Protected API Pattern**
```typescript
// app/api/protected/route.ts
import { withAuth } from '@/lib/auth/api-middleware'

export const POST = withAuth(async (req, res, session) => {
  // Access session.userId
  // ...
})
```

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────┤
│  PrivyProvider (Login/Logout UI Only)                       │
│         │                                                     │
│         ├─> Login Button → usePrivy().login()               │
│         ├─> Logout Button → Server Action                   │
│         └─> Wallet Connect → usePrivy()                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP + Cookies
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS MIDDLEWARE                        │
├─────────────────────────────────────────────────────────────┤
│  • Verify Token (Privy Client)                              │
│  • Route Protection                                          │
│  • Redirect Logic                                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   SERVER COMPONENTS                          │
├─────────────────────────────────────────────────────────────┤
│  • getServerAuth() → Cached Session                         │
│  • requireServerAuth() → Throw if not authed                │
│  • getServerUser() → Cached User Profile                    │
│                                                               │
│  Cache Layer (React cache → Redis)                          │
│    ├─> Session Cache (5min TTL)                             │
│    ├─> User Profile Cache (5min TTL)                        │
│    └─> Permissions Cache (1hr TTL)                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE (Supabase)                        │
├─────────────────────────────────────────────────────────────┤
│  • profiles table                                            │
│  • identity_links table (Privy ↔ UUID)                      │
│  • JIT user creation on first login                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 New Files to Create

```
apps/web/src/
├── lib/
│   ├── auth/
│   │   ├── server-session.ts       ✨ Enhanced session with caching
│   │   ├── server-utils.ts         ✨ Server auth utilities
│   │   ├── actions.ts              ✨ Server actions
│   │   ├── config.ts               ✨ Centralized auth config
│   │   ├── cache.ts                ✨ Session caching layer
│   │   ├── features.ts             ✨ Auth feature flags
│   │   └── api-middleware.ts       ✨ API route protection
│   └── cache/
│       └── session-store.ts        ✨ Cache abstraction
└── app/
    └── api/
        └── auth/
            ├── session/
            │   └── route.ts        ✨ Get session
            ├── user/
            │   └── route.ts        ✨ Get user profile
            └── logout/
                └── route.ts        ✨ Logout with cleanup
```

---

## 🔄 Migration Steps

### Step 1: Setup (Week 1)
1. Create new server utilities
2. Add caching layer
3. Setup server actions
4. Add feature flags integration

### Step 2: Core Migration (Week 2)
1. Migrate protected layouts to server components
2. Update dashboard to use server auth
3. Update settings pages
4. Add proper error boundaries

### Step 3: Optimization (Week 3)
1. Implement session caching
2. Add prefetching where beneficial
3. Optimize DB queries
4. Add cache invalidation

### Step 4: Client Cleanup (Week 4)
1. Remove unnecessary `usePrivy()` calls
2. Simplify client auth context
3. Update components to use server data
4. Test all flows

### Step 5: Testing & Documentation (Week 5)
1. Test all auth flows
2. Performance testing
3. Security audit
4. Update documentation

---

## ✅ Success Metrics

### Performance
- [ ] Session queries < 50ms (with cache)
- [ ] Cache hit rate > 80%
- [ ] DB queries reduced by 70%
- [ ] Page load time improved by 30%

### Security
- [ ] All sensitive logic server-side
- [ ] Proper session invalidation
- [ ] Rate limiting working
- [ ] Audit logs complete

### Developer Experience
- [ ] Clear server auth patterns
- [ ] Type-safe utilities
- [ ] Easy to add protected routes
- [ ] Good error messages

### Code Quality
- [ ] < 20 client-side Privy calls
- [ ] All protected pages use server auth
- [ ] Consistent patterns throughout
- [ ] Well documented

---

## 🚀 Quick Wins (Do First)

1. **Add Session Caching** (2 hours)
   - Immediate 70% reduction in DB queries
   - Easy to implement with React `cache()`

2. **Create Server Utils** (3 hours)
   - `getServerAuth()`, `requireServerAuth()`
   - Makes protected routes trivial

3. **Migrate Dashboard** (2 hours)
   - High-traffic page
   - Good reference for other pages

4. **Add Logout API** (1 hour)
   - Proper session cleanup
   - Clear cache on logout

---

## 📚 Resources

### Next.js 14+
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [React cache()](https://react.dev/reference/react/cache)
- [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)

### Privy
- [Server-Side Auth](https://docs.privy.io/guide/server/authorization)
- [Token Verification](https://docs.privy.io/guide/server/authorization/verification)
- [User Management](https://docs.privy.io/guide/server/users)

### Architecture
- [Session Management Patterns](https://nextjs.org/docs/app/building-your-application/authentication)
- [Caching Strategies](https://nextjs.org/docs/app/building-your-application/caching)
- [Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)

---

## 🎯 Next Steps

1. **Review this plan** with team
2. **Approve architecture** decisions
3. **Start with Quick Wins** (session caching + server utils)
4. **Iterative migration** (one feature at a time)
5. **Monitor metrics** throughout

**Ready to start implementation!** 🚀
