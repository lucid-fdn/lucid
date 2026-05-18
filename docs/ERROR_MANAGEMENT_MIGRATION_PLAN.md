# Error Management Migration Plan

**Status:** 🚧 IN PROGRESS  
**Started:** January 14, 2025

---

## Strategy: Incremental, Safe Migration

Given the scale of the codebase (288 API routes, 57 server actions, 80+ database functions), we'll migrate incrementally in priority order to avoid breaking changes.

## Phase 1: Foundation (CURRENT)

### ✅ Completed
- [x] Created error service and types (`src/lib/errors/`)
- [x] Created wrapper utilities (`src/lib/errors/wrappers.ts`)
- [x] Documented current state (`docs/ERROR_MANAGEMENT_AUDIT_2025.md`)

### 🔄 In Progress
- [ ] Update authentication layer with user tracking
- [ ] Migrate critical database functions
- [ ] Test Sentry integration

## Phase 2: Critical Path Migration

### Priority 1: Authentication & User Management
**Impact:** High - affects all logged-in users

**Files:**
- `src/lib/auth/session.ts` - Add ErrorService.setUser/clearUser
- `src/lib/db/index.ts` - Profile functions:
  - `getProfile()`
  - `createProfile()`
  - `updateProfile()`
  - `completeOnboarding()`

### Priority 2: Core API Routes
**Impact:** High - user-facing endpoints

**Files to migrate first:**
- `src/app/api/auth/**` - Authentication endpoints
- `src/app/api/user/**` - User management
- `src/app/api/workspace/**` - Workspace operations
- `src/app/api/workflows/**` - Workflow operations

### Priority 3: Server Actions
**Impact:** High - form submissions

**Files:**
- `src/lib/forms/actions.ts` - All form actions

### Priority 4: Remaining Database Functions
**Impact:** Medium - background operations

**Files:**
- `src/lib/db/index.ts` - Remaining functions

### Priority 5: Remaining API Routes
**Impact:** Low to Medium

**Files:**
- All other routes in `src/app/api/**`

## Migration Pattern

### Database Functions

**Before:**
```typescript
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('[db] Failed to fetch profile:', error);
    return null;
  }
  
  return data;
}
```

**After:**
```typescript
import { ErrorService } from '@/lib/errors/error-service'

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
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
    });
    return null;
  }
  
  return data;
}
```

### API Routes

**Before:**
```typescript
export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[api] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

**After:**
```typescript
import { ErrorService } from '@/lib/errors/error-service'
import { ValidationError } from '@/lib/errors/types'

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
    
    if (error instanceof ValidationError) {
      return NextResponse.json(error.toJSON(), { 
        status: error.statusCode 
      })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
```

### Server Actions

**Before:**
```typescript
export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = schema.parse(data)
    await updateProfile(userId, validated)
    return { success: true }
  } catch (error) {
    console.error('[action] Error:', error)
    return {
      success: false,
      error: 'Operation failed'
    }
  }
}
```

**After:**
```typescript
import { ErrorService } from '@/lib/errors/error-service'

export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = schema.parse(data)
    
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
        userId: await getUserId().catch(() => 'unknown'),
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
      error: 'Operation failed',
      code: 'INTERNAL_SERVER_ERROR'
    }
  }
}
```

## Safety Checklist

Before migrating each file:
- [ ] Read the entire file to understand dependencies
- [ ] Check if file is imported elsewhere
- [ ] Identify critical paths that mustn't break
- [ ] Test error scenarios after migration
- [ ] Verify Sentry receives errors

## Testing Strategy

### Unit Tests
```typescript
describe('Error Service Integration', () => {
  it('should capture database errors', async () => {
    const spy = jest.spyOn(ErrorService, 'captureException')
    await getProfile('invalid-id')
    expect(spy).toHaveBeenCalled()
  })
})
```

### Integration Tests
- Trigger known errors in dev
- Check Sentry dashboard
- Verify context is useful
- Confirm no sensitive data leaked

### Manual Testing
- Test each migrated endpoint
- Verify errors still show correctly to users
- Check Sentry has proper context

## Rollback Plan

If issues arise:
1. Git revert specific commits
2. Deploy previous version
3. Review Sentry logs for issues
4. Fix and re-deploy

## Progress Tracking

### Phase 1: Foundation
- [x] Create wrappers
- [ ] Update auth layer
- [ ] Migrate 5 critical DB functions
- [ ] Test Sentry integration

### Phase 2: Critical Paths (Week 1)
- [ ] Migrate auth API routes (10 files)
- [ ] Migrate user API routes (5 files)
- [ ] Migrate workspace routes (3 files)
- [ ] Migrate critical server actions (20 functions)

### Phase 3: Remaining Code (Week 2)
- [ ] Migrate remaining DB functions (70+ functions)
- [ ] Migrate remaining API routes (250+ files)
- [ ] Migrate remaining server actions (35 functions)

### Phase 4: Polish (Week 3)
- [ ] Add breadcrumbs to critical paths
- [ ] Add performance monitoring
- [ ] Set up alerting
- [ ] Document patterns

## Success Metrics

**Target:**
- 100% of errors tracked in Sentry
- User context on all errors
- Breadcrumbs on critical paths
- <100ms overhead from error tracking

**Current:**
- ~1% of errors tracked
- No user context
- No breadcrumbs

---

**Next Action:** Start with Phase 1 - Update auth layer and migrate critical database functions.
