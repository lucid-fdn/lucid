# Redirect Loop Root Cause Analysis

**Date**: 2025-10-16
**Issue**: "This page isn't working - localhost redirected you too many times"
**Status**: ✅ IDENTIFIED - Ready to fix

## 🔴 Root Cause

The redirect loop is caused by **conflicting route patterns in middleware.ts** that catch workspace-specific URLs and attempt to redirect them, creating an infinite loop.

### The Problem Chain

1. User navigates to `/{workspace-slug}/dashboard` (e.g., `/my-workspace/dashboard`)
2. **Middleware intercepts** due to matcher pattern `"/:workspace/dashboard"`
3. Middleware checks auth → user is authenticated
4. Since the path doesn't match `/` or `/login`, middleware lets it through
5. **BUT** - if there's any re-navigation or the route changes slightly, the middleware intercepts again
6. This creates a redirect loop: workspace route → middleware → check → back to route → middleware → infinite loop

### Critical Code Issue

**File**: `src/middleware.ts`

```typescript
export const config = { 
  matcher: [
    "/",
    "/login",
    "/dashboard",
    "/settings/:path*",
    "/:workspace/dashboard",          // ❌ PROBLEM: Catches workspace dashboards
    "/:workspace/settings/:path*",    // ❌ PROBLEM: Catches workspace settings
  ]
};
```

**The Issue**: 
- The patterns `"/:workspace/dashboard"` and `"/:workspace/settings/:path*"` match workspace-specific routes
- These routes should be protected by their **own layouts** (`src/app/(studio)/[workspace-slug]/layout.tsx`)
- The middleware should **NOT** intercept workspace-specific routes
- Having both middleware AND layout authentication creates a double-check that can cause redirect loops

## 📊 Current Flow (Problematic)

```
User → /{workspace}/dashboard
  ↓
Middleware intercepts (/:workspace/dashboard matches)
  ↓
Auth check → authenticated → NextResponse.next()
  ↓
Layout checks auth again
  ↓
If any condition causes a re-navigation, back to middleware
  ↓
LOOP! 🔄
```

## ✅ Correct Flow (Solution)

```
User → /{workspace}/dashboard
  ↓
Middleware IGNORES (pattern not in matcher)
  ↓
Goes directly to workspace layout
  ↓
Layout handles auth check once
  ↓
Redirects to /login if needed OR allows access
  ↓
No loop! ✅
```

## 🔧 The Solution

### 1. Remove Workspace Patterns from Middleware

The middleware should ONLY protect:
- Root path `/`
- Login page `/login`
- Top-level dashboard `/dashboard`
- Top-level settings `/settings/:path*`

It should NOT protect:
- Workspace-specific routes `/{workspace-slug}/*`
- These are already protected by the workspace layout

### 2. Updated Middleware Config

```typescript
export const config = { 
  matcher: [
    "/",
    "/login",
    "/dashboard",
    "/settings/:path*",
    // ✅ Removed: "/:workspace/dashboard"
    // ✅ Removed: "/:workspace/settings/:path*"
    // These are protected by workspace layout instead
  ]
};
```

### 3. Why This Works

**Separation of Concerns**:
- **Middleware**: Protects global/top-level routes only
- **Workspace Layout**: Protects all workspace-specific routes (`/{workspace-slug}/*`)
- No overlap = No redirect loops

**Single Source of Truth**:
- Each route is protected by ONE mechanism only
- Middleware → global routes
- Layout → workspace routes

## 📝 Additional Findings

### Auth Check Consistency

The codebase has consistent auth patterns:

1. **Middleware** uses `getAuthToken()` to check for Privy tokens
2. **Layouts** use `getUserId()` from server-utils
3. **Both redirect to `/login` if not authenticated**

This consistency is good, but having both check the same routes causes the loop.

### Workspace Layout Auth

**File**: `src/app/(studio)/[workspace-slug]/layout.tsx`

```typescript
const userId = await getUserId()

if (!userId) {
  console.log('[workspace-layout] ❌ No user, redirecting to login')
  redirect('/login')
}
```

This layout **already handles** authentication for all workspace routes. The middleware doesn't need to duplicate this.

## 🎯 Implementation Plan

1. ✅ **Update middleware.ts** - Remove workspace patterns
2. ✅ **Test** - Verify no redirect loops on:
   - `/dashboard` → should redirect to `/{workspace}/dashboard`
   - `/{workspace}/dashboard` → should load directly
   - `/{workspace}/settings` → should load directly
   - `/settings` → should load directly (if this route exists)
3. ✅ **Verify** - Unauthenticated users still redirected to `/login`

## 🚀 Expected Behavior After Fix

### Authenticated User

- `/` → middleware redirects to `/dashboard`
- `/dashboard` → page redirects to `/{first-workspace}/dashboard`
- `/{workspace}/dashboard` → loads directly (no middleware, layout allows)
- `/{workspace}/settings` → loads directly (no middleware, layout allows)

### Unauthenticated User

- `/` → middleware allows (can show landing page)
- `/login` → middleware allows
- `/dashboard` → middleware redirects to `/login`
- `/{workspace}/dashboard` → layout redirects to `/login`

## 📊 Route Protection Summary

| Route Pattern | Protected By | Redirect Destination |
|--------------|-------------|---------------------|
| `/` | Middleware | `/dashboard` (if auth) |
| `/login` | Middleware | `/dashboard` (if auth) |
| `/dashboard` | Middleware | `/login` (if not auth) |
| `/settings/*` | Middleware | `/login` (if not auth) |
| `/{workspace}/*` | **Layout** | `/login` (if not auth) |

## ⚠️ Prevention Guidelines

**To prevent redirect loops in the future:**

1. **Never overlap middleware and layout protection** on the same routes
2. **Use middleware for global routes only** (`/`, `/login`, `/dashboard`)
3. **Use layouts for nested routes** (`/{workspace}/*`)
4. **Always test both authenticated and unauthenticated flows**
5. **Add logging to track redirect chains** (already present)

## 🔍 Next Steps

1. Apply the fix to middleware.ts
2. Clear browser cache/cookies
3. Test all routes:
   - Authenticated flows
   - Unauthenticated flows
   - Direct navigation
   - Link navigation
4. Monitor console logs for any remaining issues

---

**Status**: Ready to implement fix
**Priority**: 🔴 Critical - Blocking user access
**Complexity**: 🟢 Simple - Two-line change in middleware config
