# Authentication System Audit & Recommendations

**Date:** 2025-10-05  
**Status:** 🔴 CRITICAL ISSUES FOUND  
**Priority:** P0 - Immediate Action Required

---

## 🚨 Critical Issue: Logout on Page Refresh

### Root Cause Identified

**File:** `apps/web/src/app/layout.tsx` (lines 42-78)

```javascript
// ❌ CRITICAL BUG - Clears auth tokens on EVERY page load
<script dangerouslySetInnerHTML={{
  __html: `
    // IMMEDIATE Solana wallet cleanup
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.toLowerCase().includes('privy')  // ❌ CLEARS ALL PRIVY TOKENS!
      )) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);  // ❌ LOGS USER OUT!
    });
  `
}}/>
```

**Impact:**
- ✅ Clears `privy-token` on every page load
- ✅ Clears `privy-id-token` on every page load  
- ✅ Clears `privy-refresh-token` on every page load
- ❌ Users logged out on refresh
- ❌ Auth state lost on navigation
- ❌ Poor user experience

**Fix Required:** Remove Privy from cleanup script or make it selective

---

## 📊 Auth Architecture Overview

### Current Stack

**Provider:** Privy (Web3 + Web2 auth)
```typescript
- Privy SDK: @privy-io/react-auth (client)
- Privy SDK: @privy-io/server-auth (server)
- Token Storage: localStorage (privy-token, privy-id-token, privy-refresh-token)
- Session Management: HTTP-only cookies + Privy tokens
- Database: Supabase (user profiles, identity_links)
```

### Auth Flow

```
1. User Login (Privy)
   ↓
2. Privy Token → localStorage
   ↓
3. Backend Verification (/api/auth/privy-login)
   ↓
4. Internal User Creation (JIT)
   ↓
5. Session Cookie Set
   ↓
6. ❌ Page Refresh → HEAD script clears tokens → User logged out
```

---

## 🔍 Detailed Analysis

### 1. Token Management

**Current Implementation:**
```typescript
// Location: apps/web/src/lib/auth/session.ts

export async function getServerSession(): Promise<ServerSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get('privy-token')?.value;
  
  const privy = getPrivyClient();
  const claims = await privy.verifyAuthToken(token);
  const privyUserId = claims.userId;
  
  // Resolve to internal user ID (JIT creates if needed)
  const internalUserId = await resolveInternalUserId(privyUserId);
  
  return { userId: internalUserId };
}
```

**Issues:**
- ✅ **JIT Creation:** Good - creates users on first login
- ✅ **Internal UUIDs:** Good - provider-agnostic
- ❌ **Token Source:** Only checks `privy-token` cookie, not localStorage
- ❌ **No Refresh:** Doesn't handle token refresh
- ❌ **No Expiry Check:** Doesn't validate token expiry
- ❌ **Cleared on Refresh:** HEAD script kills all Privy tokens

### 2. Middleware Protection

**Location:** `apps/web/src/middleware.ts`

```typescript
const privyToken = req.cookies.get("privy-token")?.value ||
                   req.cookies.get("privy-id-token")?.value ||
                   req.cookies.get("privy-refresh-token")?.value;

if (!privyToken) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
```

**Issues:**
- ✅ **Multiple Token Check:** Good - checks all token types
- ❌ **No Verification:** Doesn't verify token validity
- ❌ **Cookie Only:** Doesn't check localStorage
- ❌ **Cleared by HEAD Script:** Tokens get cleared before middleware runs

### 3. Client-Side Auth

**Location:** `apps/web/src/components/Wallet/WalletProvider.tsx`

```typescript
useEffect(() => {
  const handleAuthentication = async () => {
    if (!ready || !authenticated || !user) {
      return;
    }
    
    // Call backend login
    const response = await fetch('/api/auth/privy-login', {
      method: 'POST',
      body: JSON.stringify({
        privyId: user.id,
        walletAddress: primaryWallet.address
      })
    });
  };
  
  handleAuthentication();
}, [ready, authenticated, user, primaryWallet]);
```

**Issues:**
- ✅ **JIT Backend Sync:** Good - syncs on login
- ❌ **No Token Refresh:** Doesn't handle token expiry
- ❌ **Race Condition:** May run before Privy fully initialized
- ❌ **Multiple Calls:** Can trigger multiple times
- ❌ **Cleared Tokens:** HEAD script breaks auth state

### 4. Backend Auth API

**Location:** `apps/web/src/app/api/(studio)/auth/privy-login/route.ts`

```typescript
export async function POST(req: NextRequest) {
  const { privyId, walletAddress } = await req.json();
  
  // External API call
  const backendRes = await fetch(`${STUDIO_API_URL}/auth/privy-login`, {
    method: "POST",
    body: JSON.stringify({ privyId, walletAddress }),
  });
  
  const { access_token } = await backendRes.json();
  
  // Set cookie
  response.cookies.set('privy-id-token', access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
}
```

**Issues:**
- ✅ **HTTP-Only Cookie:** Good - secure
- ❌ **External Dependency:** Relies on external API (server.lucid.foundation)
- ❌ **No Error Handling:** Fails silently
- ❌ **No Token Validation:** Doesn't validate external token
- ❌ **Duplicate Token Names:** `privy-id-token` conflicts with Privy's own tokens

---

## 🎯 Issues Summary

### P0 - Critical (Fix Immediately)

1. **HEAD Script Clears Auth Tokens** ❌
   - **Impact:** Users logged out on every refresh
   - **File:** `apps/web/src/app/layout.tsx`
   - **Fix:** Remove Privy from localStorage cleanup

2. **External API Dependency** ❌
   - **Impact:** Auth broken if external API down
   - **File:** `apps/web/src/app/api/(studio)/auth/privy-login/route.ts`
   - **Fix:** Use Privy verification directly

3. **No Token Refresh** ❌
   - **Impact:** Users logged out when tokens expire
   - **Fix:** Implement token refresh logic

### P1 - High Priority

4. **Race Conditions** ❌
   - Multiple auth checks running simultaneously
   - WalletProvider may fire before Privy ready
   
5. **No Token Validation in Middleware** ❌
   - Middleware only checks token existence
   - Doesn't verify validity or expiry

6. **Cookie/LocalStorage Mismatch** ❌
   - Some code checks cookies, some checks localStorage
   - Inconsistent token source

### P2 - Medium Priority

7. **No Session Expiry Management** ❌
   - No automatic logout after inactivity
   - No "remember me" option

8. **Poor Error Messages** ❌
   - Generic "Unauthorized" errors
   - No user-friendly messaging

9. **No Rate Limiting** ❌
   - Auth endpoints not rate-limited
   - Vulnerable to brute force

---

## ✅ Industry Best Practices

### 1. Token Management

**Recommended Approach:**
```typescript
// Store tokens securely
- Access Token: HTTP-only cookie (short-lived, 15min)
- Refresh Token: HTTP-only cookie (long-lived, 7 days)
- Client State: localStorage (non-sensitive, UI state only)

// Token Refresh Flow
1. Access token expires
2. Client detects 401
3. Automatically calls /api/auth/refresh
4. New access token issued
5. Retry original request
```

### 2. Session Management

**Recommended Features:**
```typescript
- Automatic token refresh before expiry
- Silent refresh in background
- Activity-based session extension
- Secure logout (clear all tokens)
- Remember me option
- Session timeout warning
```

### 3. Security

**Best Practices:**
```typescript
✅ HTTP-only cookies for sensitive tokens
✅ Secure flag (HTTPS only)
✅ SameSite=Lax or Strict
✅ CSRF protection
✅ Rate limiting on auth endpoints
✅ Token rotation on refresh
✅ Revoke tokens on logout
✅ Monitor failed auth attempts
```

### 4. Performance

**Optimizations:**
```typescript
✅ Cache auth state in React Context
✅ Minimize auth checks
✅ Preflight middleware checks
✅ Parallel token validation
✅ Redis for session storage
✅ CDN for auth endpoints
```

### 5. Scalability

**Architecture:**
```typescript
✅ Stateless authentication (JWT)
✅ Distributed session store (Redis)
✅ Load-balanced auth servers
✅ Separate auth microservice
✅ OAuth2/OIDC standards
✅ Multi-region support
```

---

## 🚀 Recommended Solution

### Phase 1: Fix Critical Issues (1-2 hours)

**1. Remove Privy from HEAD Script**
```typescript
// apps/web/src/app/layout.tsx

// ✅ FIXED VERSION
if (key && (
  key.toLowerCase().includes('phantom') || 
  key.toLowerCase().includes('solana') || 
  key.toLowerCase().includes('wallet')
  // ❌ Removed: key.toLowerCase().includes('privy')
)) {
  keysToRemove.push(key);
}
```

**2. Implement Token Refresh**
```typescript
// apps/web/src/lib/auth/refresh.ts

export async function refreshAuthToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });
    
    return response.ok;
  } catch {
    return false;
  }
}
```

**3. Add Axios Interceptor**
```typescript
// apps/web/src/lib/api/interceptors.ts

axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        return axios.request(error.config);
      }
    }
    return Promise.reject(error);
  }
);
```

### Phase 2: Improve Architecture (1 day)

**1. Unified Auth Context**
```typescript
// apps/web/src/contexts/auth-context.tsx

interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  refreshToken: () => Promise<void>;
  logout: () => Promise<void>;
}

export function AuthProvider({ children }) {
  // Centralized auth state
  // Token refresh logic
  // Logout logic
  // Error handling
}
```

**2. Improved Middleware**
```typescript
// apps/web/src/middleware.ts

export async function middleware(req: NextRequest) {
  const token = getAuthToken(req);
  
  // Verify token validity
  const isValid = await verifyToken(token);
  
  if (!isValid) {
    // Try refresh
    const refreshed = await tryRefreshToken(req);
    if (!refreshed) {
      return redirectToLogin(req);
    }
  }
  
  return NextResponse.next();
}
```

**3. Session Monitoring**
```typescript
// apps/web/src/hooks/useAuthSession.ts

export function useAuthSession() {
  useEffect(() => {
    // Check token expiry every 5 minutes
    const interval = setInterval(async () => {
      const expiresIn = getTokenExpiryTime();
      
      if (expiresIn < 5 * 60 * 1000) { // Less than 5 min
        await refreshToken();
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);
}
```

### Phase 3: Production Hardening (2-3 days)

**1. Rate Limiting**
```typescript
// apps/web/src/middleware.ts
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});

// Apply to auth endpoints
if (pathname.startsWith('/api/auth/')) {
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response("Too Many Requests", { status: 429 });
  }
}
```

**2. Session Store (Redis)**
```typescript
// apps/web/src/lib/auth/session-store.ts

export class SessionStore {
  async create(userId: string, token: string): Promise<void> {
    await redis.setex(`session:${token}`, 3600, userId);
  }
  
  async validate(token: string): Promise<string | null> {
    return await redis.get(`session:${token}`);
  }
  
  async revoke(token: string): Promise<void> {
    await redis.del(`session:${token}`);
  }
}
```

**3. Monitoring & Alerts**
```typescript
// apps/web/src/lib/auth/monitoring.ts

export function trackAuthEvent(event: string, data: any) {
  // Track metrics
  analytics.track(event, data);
  
  // Alert on anomalies
  if (event === 'failed_login' && data.attempts > 5) {
    sendAlert('Multiple failed login attempts', data);
  }
}
```

---

## 📋 Implementation Checklist

### Immediate (P0)
- [ ] Remove Privy from HEAD script localStorage cleanup
- [ ] Test login/refresh flow
- [ ] Verify tokens persist across refreshes
- [ ] Add error logging

### Short Term (P1)
- [ ] Implement token refresh endpoint
- [ ] Add Axios interceptor for 401 handling
- [ ] Improve middleware token validation
- [ ] Create unified Auth Context
- [ ] Add session monitoring hook

### Medium Term (P2)
- [ ] Implement rate limiting
- [ ] Add Redis session store
- [ ] Create session timeout warnings
- [ ] Add "remember me" feature
- [ ] Implement CSRF protection

### Long Term (P3)
- [ ] Set up monitoring & alerts
- [ ] Add audit logging
- [ ] Implement OAuth2/OIDC
- [ ] Multi-region session replication
- [ ] Zero-downtime auth updates

---

## 🎯 Success Metrics

**Performance:**
- Auth check latency < 50ms
- Token refresh latency < 200ms
- Session validation cache hit rate > 90%

**Reliability:**
- Auth uptime > 99.9%
- Failed login rate < 1%
- Token refresh success rate > 99%

**Security:**
- Zero token leaks in logs
- All tokens in HTTP-only cookies
- Rate limiting on all auth endpoints
- CSRF protection enabled

**User Experience:**
- Users stay logged in across refreshes ✅
- Automatic token refresh (no interruptions)
- Clear error messages
- Fast login/logout (<1s)

---

## 📚 Related Documentation

- [USER_MANAGEMENT_ARCHITECTURE.md](./USER_MANAGEMENT_ARCHITECTURE.md) - User management system
- [Privy Docs](https://docs.privy.io/) - Official Privy documentation
- [OWASP Auth Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) - Security best practices

---

**Next Steps:** 
1. Fix HEAD script (remove Privy cleanup) - **URGENT**
2. Test login persistence
3. Implement token refresh
4. Review and approve Phase 2/3 plans
