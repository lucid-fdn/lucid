# Error Management Audit - LucidMerged 2025

**Audit Date:** January 14, 2025  
**Status:** ⚠️ **NEEDS IMPROVEMENT** - System exists but underutilized

---

## Executive Summary

LucidMerged has a **comprehensive centralized error management system** with Sentry integration, custom error classes, and proper utilities. However, **the system is significantly underutilized** across the codebase. Most error handling still uses `console.error` instead of the centralized `ErrorService`.

### Key Findings

✅ **GOOD:**
- Centralized error service exists (`src/lib/errors/`)
- Sentry integration configured
- Custom error classes defined
- Error boundary component implemented
- Comprehensive documentation exists
- Utility functions (withErrorHandling, withRetry) available

⚠️ **NEEDS IMPROVEMENT:**
- **Database layer** (`src/lib/db/index.ts`): Uses `console.error` everywhere
- **API routes** (288 instances): Mostly use `console.error`
- **Server actions** (`src/lib/forms/actions.ts`): All use `console.error`
- Only **3 instances** of `ErrorService.captureException` found in actual code
- Error documentation not being followed

---

## Current Architecture

### 1. Error Service (`src/lib/errors/error-service.ts`)

**Purpose:** Centralized error capture with Sentry integration

**Features:**
- ✅ `captureException()` - Capture errors with context
- ✅ `captureMessage()` - Capture non-error messages
- ✅ `setUser()` / `clearUser()` - User tracking
- ✅ `addBreadcrumb()` - Track user actions
- ✅ `startSpan()` - Performance monitoring
- ✅ Severity levels: fatal, error, warning, info, debug
- ✅ Local logging + Sentry in production

**Current Usage:** ❌ **Barely used** (only 3 instances in codebase)

### 2. Error Types (`src/lib/errors/types.ts`)

**Custom Error Classes:**
```typescript
APIError              // Base class (500)
ValidationError       // Invalid input (400)
AuthenticationError   // Unauthorized (401)
AuthorizationError    // Forbidden (403)
NotFoundError         // Not found (404)
DatabaseError         // DB failures (500)
NetworkError          // External API failures (503)
RateLimitError        // Rate limits (429)
PaymentError          // Payment failures (402)
```

**Response Types:**
```typescript
ActionResult<T>   // For Server Actions
APIResponse<T>    // For API Routes
```

**Current Usage:** ❌ **Not consistently used**

### 3. Error Boundary (`src/components/error-boundary.tsx`)

**Status:** ✅ **CORRECTLY IMPLEMENTED**
- Catches React errors
- Uses `ErrorService.captureException()` 
- Displays user-friendly fallback UI
- Development vs production modes

---

## Detailed Analysis by Layer

### Database Layer (`src/lib/db/index.ts`)

**Issue:** All 30+ functions use `console.error` instead of `ErrorService`

**Current Pattern:**
```typescript
// ❌ CURRENT (BAD)
export async function getProfile(userId: string) {
  const { data, error } = await supabase.from('profiles')...
  
  if (error) {
    console.error('[db] Failed to fetch profile:', error)
    return null
  }
  
  return data
}
```

**Should Be:**
```typescript
// ✅ SHOULD BE (GOOD)
import { ErrorService } from '@/lib/errors/error-service'
import { DatabaseError } from '@/lib/errors/types'

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from('profiles')...
  
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'profiles',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    })
    return null
  }
  
  return data
}
```

**Impact:**
- ❌ Database errors NOT tracked in Sentry
- ❌ No context about which user experienced the error
- ❌ No tags for filtering/grouping
- ❌ Cannot correlate errors with user sessions

---

### API Routes (`src/app/api/**/route.ts`)

**Issue:** 288 try/catch blocks found, almost all use `console.error`

**Current Pattern:**
```typescript
// ❌ CURRENT (BAD)
export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[api/endpoint] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**Should Be:**
```typescript
// ✅ SHOULD BE (GOOD)
import { ErrorService } from '@/lib/errors/error-service'
import { APIError, ValidationError } from '@/lib/errors/types'

export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ data })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        route: '/api/endpoint',
        method: 'GET'
      },
      tags: {
        layer: 'api',
        endpoint: '/api/endpoint'
      }
    })
    
    // Return appropriate error response
    if (error instanceof ValidationError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
```

**Impact:**
- ❌ API errors NOT tracked in production
- ❌ Cannot identify problematic endpoints
- ❌ No performance tracking
- ❌ Cannot correlate with user sessions

---

### Server Actions (`src/lib/forms/actions.ts`)

**Issue:** 57 try/catch blocks found, all use `console.error`

**Current Pattern:**
```typescript
// ❌ CURRENT (BAD)
export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = profileSchema.parse(data)
    await updateProfile(userId, validated)
    return { success: true }
  } catch (error) {
    console.error('[actions] Update profile error:', error)
    return {
      success: false,
      error: 'Failed to update profile'
    }
  }
}
```

**Should Be:**
```typescript
// ✅ SHOULD BE (GOOD)
import { ErrorService } from '@/lib/errors/error-service'
import { ValidationError } from '@/lib/errors/types'

export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = profileSchema.parse(data)
    await updateProfile(userId, validated)
    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        action: 'updateProfile',
        hasData: !!data
      },
      tags: {
        layer: 'server-action',
        action: 'profile-update'
      }
    })
    
    if (error instanceof ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        code: 'VALIDATION_ERROR'
      }
    }
    
    return {
      success: false,
      error: 'Failed to update profile',
      code: 'INTERNAL_SERVER_ERROR'
    }
  }
}
```

**Impact:**
- ❌ Server action errors NOT tracked
- ❌ Cannot identify which forms are failing
- ❌ No user context in errors
- ❌ Cannot measure error rates

---

## What IS Working

### 1. Error Boundary ✅

**Location:** `src/components/error-boundary.tsx`

**Status:** ✅ Correctly implemented and using ErrorService

```typescript
componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  // ✅ CORRECT: Reports to Sentry
  ErrorService.captureException(error, {
    severity: 'error',
    context: {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    },
  })
  
  this.props.onError?.(error, errorInfo)
}
```

### 2. Error Documentation ✅

**Location:** `docs/ERROR_MANAGEMENT_SYSTEM.md`

**Status:** ✅ Comprehensive documentation exists
- Covers all features
- Provides examples
- Lists best practices
- Explains integration points

**Issue:** Documentation not being followed by developers

---

## Impact Analysis

### Current State Problems

1. **Missed Errors in Production**
   - Most errors never reach Sentry
   - Cannot proactively monitor application health
   - Users report bugs that were never logged

2. **Lack of Context**
   - No user tracking on errors
   - Cannot reproduce user-specific issues
   - No breadcrumbs to understand user journey

3. **No Performance Insights**
   - Cannot identify slow endpoints
   - No distributed tracing
   - Cannot optimize based on data

4. **Difficult Debugging**
   - Console logs don't persist
   - Cannot filter/search errors
   - No aggregation or trends

5. **Inconsistent Error Handling**
   - Different patterns across codebase
   - Some errors caught, some not
   - Varied error messages

---

## Recommended Actions

### Phase 1: Quick Wins (1-2 days)

#### 1.1 Update Database Layer
**File:** `src/lib/db/index.ts`
**Impact:** High (central to all operations)

```typescript
// Replace all console.error calls with ErrorService
import { ErrorService } from '@/lib/errors/error-service'

// Before every return null or throw:
ErrorService.captureException(error, {
  severity: 'error',
  context: { /* relevant context */ },
  tags: { layer: 'database', table: 'table_name' }
})
```

#### 1.2 Create Wrapper Utilities
**New File:** `src/lib/errors/wrappers.ts`

```typescript
import { ErrorService } from './error-service'

/**
 * Wrap database operations with error handling
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context: { table: string; operation: string; [key: string]: unknown }
): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context,
      tags: { layer: 'database', table: context.table }
    })
    return null
  }
}

/**
 * Wrap API routes with error handling
 */
export async function withAPIErrorHandling<T>(
  operation: () => Promise<T>,
  context: { route: string; method: string }
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context,
      tags: { layer: 'api', route: context.route }
    })
    throw error
  }
}
```

#### 1.3 Update Auth Session
**File:** `src/lib/auth/session.ts`

After successful authentication:
```typescript
ErrorService.setUser({
  id: user.id,
  email: user.email,
  username: user.handle
})
```

On logout:
```typescript
ErrorService.clearUser()
```

### Phase 2: Systematic Migration (3-5 days)

#### 2.1 API Routes Migration
**Priority:** High
**Files:** `src/app/api/**/route.ts` (288 instances)

**Strategy:**
1. Create migration script to find all console.error
2. Replace with ErrorService.captureException
3. Add proper context and tags
4. Test each endpoint

#### 2.2 Server Actions Migration  
**Priority:** High
**Files:** `src/lib/forms/actions.ts` (57 instances)

**Strategy:**
1. Replace all console.error calls
2. Add user context (from requireUserId)
3. Add action tags
4. Return proper error codes

#### 2.3 Add Breadcrumbs
**Priority:** Medium
**Locations:** User interactions, navigation, important actions

```typescript
// On navigation
ErrorService.addBreadcrumb(
  'navigation',
  'User navigated to workflow builder',
  { workflowId: 'wf-123' }
)

// On user action
ErrorService.addBreadcrumb(
  'user_action',
  'User clicked save button',
  { form: 'profile-settings' }
)
```

### Phase 3: Advanced Features (1 week)

#### 3.1 Performance Monitoring
Add spans for critical operations:

```typescript
ErrorService.startSpan(
  'database-query',
  'db.query',
  async () => {
    return await complexQuery()
  }
)
```

#### 3.2 Custom Error Classes Usage
Replace generic `Error` with custom classes:

```typescript
throw new ValidationError('Invalid email format', {
  field: 'email',
  value: email
})

throw new NotFoundError(`Workflow ${id} not found`, {
  workflowId: id
})
```

#### 3.3 Retry Logic
Use built-in retry for unstable operations:

```typescript
const data = await withRetry(
  async () => await externalAPICall(),
  {
    maxRetries: 3,
    delay: 1000,
    backoff: 2,
    context: { api: 'external-service' }
  }
)
```

---

## Success Metrics

### Before Migration
- ❌ 3 ErrorService.captureException calls
- ❌ 0 errors tracked in Sentry from database layer
- ❌ 0 errors tracked from API routes
- ❌ 0 errors tracked from server actions
- ❌ No user context on errors
- ❌ No breadcrumbs

### After Migration (Target)
- ✅ 300+ ErrorService.captureException calls
- ✅ 100% of database errors tracked
- ✅ 100% of API errors tracked
- ✅ 100% of server action errors tracked
- ✅ User context on all errors
- ✅ Breadcrumbs on critical paths
- ✅ Performance monitoring on slow operations

---

## Testing Strategy

### 1. Unit Tests
```typescript
describe('ErrorService Integration', () => {
  it('should capture database errors', async () => {
    // Mock Sentry
    const captureSpy = jest.spyOn(Sentry, 'captureException')
    
    // Trigger error
    await getProfile('invalid-id')
    
    // Verify
    expect(captureSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ layer: 'database' })
      })
    )
  })
})
```

### 2. Integration Tests
- Test error flows end-to-end
- Verify errors reach Sentry
- Confirm user context is attached
- Check breadcrumbs are recorded

### 3. Manual Testing
- Trigger known errors
- Check Sentry dashboard
- Verify context is useful
- Confirm no sensitive data leaked

---

## Migration Checklist

### Pre-Migration
- [ ] Review current error patterns
- [ ] Set up Sentry properly (verify DSN works)
- [ ] Create migration plan
- [ ] Set up monitoring dashboard
- [ ] Document new patterns

### Database Layer
- [ ] Update `src/lib/db/index.ts`
- [ ] Replace all console.error calls
- [ ] Add proper context to each operation
- [ ] Test database error scenarios
- [ ] Verify errors appear in Sentry

### API Routes
- [ ] Audit all route files
- [ ] Create migration script
- [ ] Replace console.error systematically
- [ ] Add route/method context
- [ ] Test error responses
- [ ] Verify Sentry tracking

### Server Actions
- [ ] Update `src/lib/forms/actions.ts`
- [ ] Replace all console.error calls
- [ ] Add user context
- [ ] Add action-specific tags
- [ ] Test form error handling
- [ ] Verify Sentry events

### User Tracking
- [ ] Add setUser() after authentication
- [ ] Add clearUser() on logout
- [ ] Test user correlation
- [ ] Verify privacy compliance

### Breadcrumbs
- [ ] Identify critical user paths
- [ ] Add navigation breadcrumbs
- [ ] Add action breadcrumbs
- [ ] Test breadcrumb trail
- [ ] Verify useful context

### Advanced Features
- [ ] Add performance spans
- [ ] Implement retry logic
- [ ] Use custom error classes
- [ ] Add error fingerprinting
- [ ] Set up alerting

### Post-Migration
- [ ] Monitor Sentry dashboard
- [ ] Review error patterns
- [ ] Optimize error messages
- [ ] Update documentation
- [ ] Train team on new patterns

---

## Code Examples

### Database Operation

```typescript
// src/lib/db/index.ts
import { ErrorService } from '@/lib/errors/error-service'

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'profiles',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'profiles'
      }
    })
    return null
  }
  
  return data
}
```

### API Route

```typescript
// src/app/api/workflows/route.ts
import { ErrorService } from '@/lib/errors/error-service'
import { ValidationError } from '@/lib/errors/types'

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId()
    const workflows = await getWorkflows(userId)
    return NextResponse.json({ workflows })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        route: '/api/workflows',
        method: 'GET'
      },
      tags: {
        layer: 'api',
        resource: 'workflows'
      }
    })
    
    return NextResponse.json(
      { error: 'Failed to fetch workflows', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
```

### Server Action

```typescript
// src/lib/forms/actions.ts
import { ErrorService } from '@/lib/errors/error-service'

export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = profileSchema.parse(data)
    
    ErrorService.addBreadcrumb(
      'user_action',
      'Updating profile',
      { userId }
    )
    
    await updateProfile(userId, validated)
    
    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId: await getUserId(),
        action: 'updateProfile'
      },
      tags: {
        layer: 'server-action',
        form: 'profile'
      }
    })
    
    if (error instanceof ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        code: 'VALIDATION_ERROR'
      }
    }
    
    return {
      success: false,
      error: 'Failed to update profile',
      code: 'INTERNAL_SERVER_ERROR'
    }
  }
}
```

---

## Conclusion

LucidMerged has a **solid error management foundation** but it's currently **underutilized**. The centralized error service exists and is properly designed, but most of the codebase still uses basic `console.error` calls.

### Priority Actions

1. **IMMEDIATE (This Week)**
   - Update database layer (`src/lib/db/index.ts`)
   - Add user tracking in auth flow
   - Update most critical API routes

2. **SHORT TERM (Next 2 Weeks)**
   - Migrate all remaining API routes
   - Migrate all server actions
   - Add breadcrumbs to critical paths

3. **MEDIUM TERM (Next Month)**
   - Add performance monitoring
   - Implement retry logic
   - Use custom error classes
   - Set up alerting

### Expected Benefits

- 📊 **Visibility:** Track all errors in production
- 🎯 **Context:** Know which user experienced each error
- 🔍 **Debugging:** Breadcrumbs show user journey
- 📈 **Metrics:** Error rates, trends, patterns
- ⚡ **Performance:** Identify slow operations
- 🚀 **Quality:** Proactive bug fixing

---

**Next Steps:** Start with Phase 1 (Quick Wins) to see immediate value, then systematically migrate the rest of the codebase.
