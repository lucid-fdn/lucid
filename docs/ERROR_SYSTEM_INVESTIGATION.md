# Error Management & Sentry Investigation Report

**Date:** 2025-11-13  
**Investigator:** Cline  
**Status:** Complete

## Executive Summary

LucidMerged has a **well-designed centralized error management system** with Sentry integration. However, **widespread adoption is lacking** - the codebase still uses `console.error()` in 300+ locations instead of the centralized ErrorService.

### Key Findings

✅ **Strengths:**
- Comprehensive ErrorService with Sentry integration
- Standardized error classes (ValidationError, AuthenticationError, etc.)
- Good documentation (`docs/ERROR_MANAGEMENT_SYSTEM.md`)
- Structured error types and response formats

❌ **Issues:**
1. **Low adoption**: 300+ `console.error()` calls instead of ErrorService
2. **Security risk**: Sentry DSN hardcoded in config files (should be in env vars)
3. **Missing client config**: No `sentry.client.config.ts` file found
4. **No React error boundaries**: Client-side errors not caught
5. **No user tracking**: ErrorService.setUser() not called after auth

## System Architecture

### 1. Error Service (`src/lib/errors/error-service.ts`)

The main error management system with these capabilities:

```typescript
// Capture exceptions
ErrorService.captureException(error, {
  severity: 'error',
  context: { userId, action: 'create_workflow' },
  tags: { feature: 'workflows' }
})

// Capture messages
ErrorService.captureMessage('Threshold reached', {
  severity: 'warning',
  context: { metric: 'api_latency' }
})

// Set user context
ErrorService.setUser({ id, email, username })

// Add breadcrumbs
ErrorService.addBreadcrumb('user_action', 'Clicked save')

// Utilities
await withErrorHandling(() => fetchData(), { fallback: [] })
await withRetry(() => unstableApi(), { maxRetries: 3 })
```

### 2. Error Classes (`src/lib/errors/types.ts`)

Standardized error classes with status codes:

| Class | Status | Severity | Use Case |
|-------|--------|----------|----------|
| `ValidationError` | 400 | warning | Invalid input |
| `AuthenticationError` | 401 | warning | Not authenticated |
| `AuthorizationError` | 403 | warning | No permission |
| `NotFoundError` | 404 | info | Resource missing |
| `DatabaseError` | 500 | error | DB failure |
| `NetworkError` | 503 | error | External API failure |
| `RateLimitError` | 429 | warning | Rate limited |
| `PaymentError` | 402 | error | Payment failed |

### 3. Sentry Configuration

**Server-side:** `sentry.server.config.ts`
```typescript
Sentry.init({
  dsn: "https://40fa2a3198b794a795bedec14e392e65@o4510352079192064.ingest.us.sentry.io/4510352080044032",
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',
  tracesSampleRate: 1,
  enableLogs: true,
  sendDefaultPii: true,
})
```

**Edge runtime:** `sentry.edge.config.ts` (same config)

**Client-side:** ❌ **NOT FOUND** - Missing `sentry.client.config.ts`

### 4. Response Formats

**Server Actions:**
```typescript
type ActionResult<T> = 
  | { success: true; data?: T }
  | { success: false; error: string; code?: ErrorCode }
```

**API Routes:**
```typescript
type APIResponse<T> = 
  | { data: T; status: 'success' }
  | { error: string; code: ErrorCode; status: 'error' }
```

## Current Usage Analysis

### console.error/warn Usage

Found **300+ instances** of direct console logging:

**Top offenders:**
- `src/lib/db/index.ts` - 80+ console.error calls
- `src/lib/marketplace/` - 50+ console.error/warn calls
- `src/app/api/` routes - 100+ console.error calls
- `src/lib/search/adapters/` - 20+ console.warn calls

**Example from `src/lib/db/index.ts`:**
```typescript
// ❌ Current (BAD)
if (error) {
  console.error('[db] Failed to fetch profile:', error);
  return null;
}

// ✅ Should be (GOOD)
if (error) {
  ErrorService.captureException(error, {
    severity: 'error',
    context: { userId, operation: 'fetch_profile' },
    tags: { service: 'database' }
  });
  return null;
}
```

### ErrorService Usage

Found **ONLY 2 instances** of ErrorService usage:
1. `src/lib/errors/error-service.ts` (internal usage)
2. No actual usage in application code ❌

This confirms the centralized system **is not being used**.

## Security Issues

### 🔴 Critical: Hardcoded Sentry DSN

**Location:** `sentry.server.config.ts`, `sentry.edge.config.ts`

**Issue:** Sentry DSN is hardcoded in source code:
```typescript
dsn: "https://40fa2a3198b794a795bedec14e392e65@o4510352079192064.ingest.us.sentry.io/4510352080044032"
```

**Risk:**
- DSN is visible in public repository
- Cannot be rotated without code changes
- Exposes Sentry organization/project IDs

**Solution:**
```typescript
// Use environment variable
dsn: process.env.NEXT_PUBLIC_SENTRY_DSN
```

## Missing Components

### 1. Client-Side Sentry Config ❌

**Expected:** `sentry.client.config.ts`  
**Status:** Not found

**Impact:**
- Client-side errors not tracked in Sentry
- Browser console errors not reported
- User-facing errors invisible to developers

**Solution:** Create client config file

### 2. React Error Boundaries ❌

**Expected:** Error boundary components  
**Status:** Not found in search

**Impact:**
- Unhandled React errors crash entire app
- No graceful error fallback UI
- Poor user experience

**Solution:** Implement error boundaries

### 3. User Context Tracking ❌

**Expected:** `ErrorService.setUser()` calls after authentication  
**Status:** Not found in codebase

**Impact:**
- Errors not correlated with users
- Harder to debug user-specific issues
- No user impact analysis

**Solution:** Add to auth flow

### 4. Breadcrumbs ❌

**Expected:** `ErrorService.addBreadcrumb()` for user actions  
**Status:** Not found

**Impact:**
- No context about what led to errors
- Harder to reproduce issues
- Limited debugging information

**Solution:** Add to critical user actions

## Recommendations

### Priority 1: Security (Critical)

**1.1 Move Sentry DSN to Environment Variables**

```typescript
// sentry.server.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // ... rest of config
})
```

Add to `.env.local`:
```bash
NEXT_PUBLIC_SENTRY_DSN=https://...sentry.io/...
```

**1.2 Update `.env.local.example`**

Document the required Sentry variables.

### Priority 2: Client-Side Error Tracking (High)

**2.1 Create Client Config**

Create `sentry.client.config.ts`:
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',
  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
```

**2.2 Add Error Boundaries**

Create `src/components/error-boundary.tsx`:
```typescript
'use client'

import React from 'react'
import * as Sentry from '@sentry/nextjs'

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } }
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 text-center">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Priority 3: Adopt ErrorService (High)

**3.1 Migration Strategy**

1. **Phase 1: Critical paths** (auth, payments, workflows)
2. **Phase 2: API routes** (all `/api/*` endpoints)
3. **Phase 3: Database layer** (`src/lib/db/index.ts`)
4. **Phase 4: Everything else**

**3.2 Search & Replace Pattern**

Find:
```typescript
console.error('[context] Message:', error)
```

Replace:
```typescript
ErrorService.captureException(error, {
  severity: 'error',
  context: { component: 'context', action: 'operation' }
})
```

**3.3 ESLint Rule**

Add rule to prevent console.error:
```javascript
// eslint.config.mjs
rules: {
  'no-console': ['error', { allow: ['warn', 'info'] }],
}
```

### Priority 4: User Tracking (Medium)

**4.1 Add to Auth Flow**

In authentication success handler:
```typescript
// After Privy login
ErrorService.setUser({
  id: user.id,
  email: user.email,
  username: user.handle
})

// After logout
ErrorService.clearUser()
```

**4.2 Add to Workspace Context**

Track organization/project context:
```typescript
ErrorService.setContext('workspace', {
  organizationId: org.id,
  projectId: project.id,
  environmentId: env.id
})
```

### Priority 5: Breadcrumbs (Medium)

**5.1 Add to Critical Actions**

```typescript
// Navigation
ErrorService.addBreadcrumb('navigation', `Navigated to ${path}`)

// Workflow actions
ErrorService.addBreadcrumb('workflow', 'Saved workflow', { id })

// API calls
ErrorService.addBreadcrumb('api', `POST /api/workflows`)
```

### Priority 6: Severity Tuning (Low)

**6.1 Review Severity Levels**

Current usage is inconsistent. Standard:

- **fatal**: System crash, complete failure
- **error**: Operation failed, user affected
- **warning**: Potential issue, degraded experience
- **info**: Important information
- **debug**: Development-only

**6.2 Adjust Noise**

Reduce warning/info in production:
```typescript
if (process.env.NODE_ENV === 'production') {
  // Only capture error and fatal in production
  if (severity === 'warning' || severity === 'info') {
    console.log(`[${severity}]`, message)
    return // Don't send to Sentry
  }
}
```

## Implementation Checklist

### Security
- [ ] Move Sentry DSN to environment variables
- [ ] Update `.env.local.example` with Sentry vars
- [ ] Remove hardcoded DSN from config files
- [ ] Rotate Sentry DSN for security

### Client-Side Tracking
- [ ] Create `sentry.client.config.ts`
- [ ] Create error boundary component
- [ ] Wrap app with error boundary
- [ ] Test client-side error capture

### ErrorService Adoption
- [ ] Migrate critical paths (auth, payments)
- [ ] Migrate API routes
- [ ] Migrate database layer
- [ ] Migrate remaining codebase
- [ ] Add ESLint rule against console.error

### User Tracking
- [ ] Add ErrorService.setUser() to auth flow
- [ ] Add ErrorService.clearUser() to logout
- [ ] Test user correlation in Sentry

### Breadcrumbs
- [ ] Add breadcrumbs to navigation
- [ ] Add breadcrumbs to critical actions
- [ ] Test breadcrumb trail in Sentry

### Monitoring
- [ ] Set up Sentry alerts for error spikes
- [ ] Configure error grouping rules
- [ ] Set up performance monitoring
- [ ] Review error dashboard weekly

## Metrics & Success Criteria

### Current State (Baseline)
- ErrorService usage: ~0% (2 internal calls only)
- console.error usage: 300+ instances
- Client errors tracked: No
- User correlation: No
- Error rate visibility: Limited

### Target State (6 months)
- ErrorService usage: 90%+ of error handling
- console.error usage: <10 instances (allowed cases only)
- Client errors tracked: Yes (all React errors)
- User correlation: Yes (100% of auth'd sessions)
- Error rate visibility: Full Sentry dashboard

### KPIs
1. **Error resolution time**: <24h for critical errors
2. **Error recurrence**: <5% repeat rate
3. **User impact**: Track affected users per error
4. **Coverage**: 90%+ of error paths use ErrorService

## Cost Analysis

### Sentry Pricing
- **Free tier**: 5K errors/month
- **Current usage**: Unknown (not tracking properly)
- **Expected usage**: ~10-20K errors/month initially

**Recommendation**: Start with free tier, upgrade to Team ($26/month) if needed.

### Development Time
- Security fixes: 2 hours
- Client config: 4 hours
- Error boundaries: 8 hours
- Migration Phase 1-2: 40 hours
- Migration Phase 3-4: 80 hours
- **Total**: ~134 hours (~3-4 weeks)

## References

- **Documentation**: `docs/ERROR_MANAGEMENT_SYSTEM.md`
- **Error Service**: `src/lib/errors/error-service.ts`
- **Error Types**: `src/lib/errors/types.ts`
- **Sentry Docs**: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Next.js Error Handling**: https://nextjs.org/docs/app/building-your-application/routing/error-handling

## Conclusion

LucidMerged has excellent error management infrastructure that **is not being used**. The primary issues are:

1. ❌ **Security**: Hardcoded Sentry DSN (critical)
2. ❌ **Adoption**: 300+ console.error instead of ErrorService (critical)
3. ❌ **Client-side**: No client error tracking (high priority)
4. ❌ **User tracking**: No user correlation (high priority)

**Immediate Actions:**
1. Fix security issue (move DSN to env vars)
2. Create client-side Sentry config
3. Begin phased migration from console.error to ErrorService
4. Add user tracking to auth flow

**Expected Outcome:**
- Better visibility into production issues
- Faster error resolution
- Improved user experience
- Proactive issue detection

---

**Next Steps:** Prioritize security fixes, then begin systematic migration to ErrorService.
