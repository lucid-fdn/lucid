# Error Management System Documentation

## Overview

LucidMerged has a **comprehensive centralized error management system** located in `src/lib/errors/` with domain-specific handlers for specialized use cases.

## Architecture

```
src/lib/errors/
├── error-service.ts   # Main error service (Sentry integration)
└── types.ts          # Error classes, types, response formats
```

## Core Components

### 1. Error Service (`src/lib/errors/error-service.ts`)

The main error management system with Sentry integration for production error tracking.

#### Key Features:

- **Centralized error capture** - Replace `console.error` with `ErrorService.captureException`
- **Sentry integration** - Automatic error reporting in production
- **Severity levels** - `fatal`, `error`, `warning`, `info`, `debug`
- **Context tracking** - User actions, breadcrumbs, custom tags
- **User tracking** - Correlate errors with authenticated users
- **Performance monitoring** - Start spans for performance tracking
- **Retry logic** - Built-in retry with exponential backoff

#### Usage Examples:

**Basic Error Capture:**
```typescript
import { ErrorService } from '@/lib/errors/error-service'

try {
  await riskyOperation()
} catch (error) {
  ErrorService.captureException(error, {
    severity: 'error',
    context: {
      userId: user.id,
      organizationId: org.id,
      action: 'create_workflow'
    },
    tags: {
      feature: 'workflows',
      environment: 'production'
    }
  })
}
```

**Capture Messages (Non-Errors):**
```typescript
ErrorService.captureMessage('Critical threshold reached', {
  severity: 'warning',
  context: { metric: 'api_latency', value: 5000 },
  tags: { service: 'api' }
})
```

**Set User Context (After Auth):**
```typescript
ErrorService.setUser({
  id: user.id,
  email: user.email,
  username: user.handle
})
```

**Clear User Context (On Logout):**
```typescript
ErrorService.clearUser()
```

**Add Breadcrumbs (Track User Actions):**
```typescript
ErrorService.addBreadcrumb(
  'navigation',
  'User navigated to workflow builder',
  { workflowId: 'wf-123' },
  'info'
)
```

**With Error Handling (Utility):**
```typescript
import { withErrorHandling } from '@/lib/errors/error-service'

const result = await withErrorHandling(
  async () => await fetchData(),
  {
    context: { route: '/api/workflows' },
    fallback: [],  // Return empty array on error
    rethrow: false // Don't throw, just return fallback
  }
)
```

**With Retry Logic:**
```typescript
import { withRetry } from '@/lib/errors/error-service'

const data = await withRetry(
  async () => await unstableApiCall(),
  {
    maxRetries: 3,
    delay: 1000,      // Initial delay (ms)
    backoff: 2,       // Exponential multiplier
    context: { api: 'external-service' }
  }
)
```

### 2. Error Types (`src/lib/errors/types.ts`)

Standardized error classes for different scenarios:

#### Error Classes:

- **`APIError`** - Base error class (all others inherit from this)
- **`ValidationError`** - Invalid user input (400)
- **`AuthenticationError`** - Unauthorized access (401)
- **`AuthorizationError`** - Forbidden access (403)
- **`NotFoundError`** - Resource not found (404)
- **`DatabaseError`** - Database operation failed (500)
- **`NetworkError`** - External API failure (503)
- **`RateLimitError`** - Rate limit exceeded (429)
- **`PaymentError`** - Payment processing failed (402)

#### Usage Examples:

**Throw Custom Errors:**
```typescript
import { ValidationError, NotFoundError } from '@/lib/errors/types'

// Validation error
if (!email || !isValidEmail(email)) {
  throw new ValidationError('Invalid email format', {
    userId: user.id,
    field: 'email',
    value: email
  })
}

// Not found error
const workflow = await getWorkflow(id)
if (!workflow) {
  throw new NotFoundError(`Workflow ${id} not found`, {
    userId: user.id,
    workflowId: id
  })
}
```

**Standardized Response Formats:**
```typescript
import type { ActionResult, APIResponse } from '@/lib/errors/types'

// Server Actions
export async function updateProfile(data: unknown): Promise<ActionResult> {
  try {
    // ... validation & update
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
      code: 'VALIDATION_ERROR'
    }
  }
}

// API Routes
export async function GET(): Promise<Response> {
  try {
    const data = await fetchData()
    return Response.json({ data, status: 'success' })
  } catch (error) {
    return Response.json({
      error: 'Failed to fetch data',
      code: 'DATABASE_ERROR',
      status: 'error'
    }, { status: 500 })
  }
}
```

## Domain-Specific Handlers

### Cache Error Handler (`src/lib/cache/error-handler.ts`)

Specialized error handling for caching operations:

```typescript
import { CacheErrorHandler } from '@/lib/cache/error-handler'

try {
  await cacheOperation()
} catch (error) {
  await CacheErrorHandler.handleError('user-profile', error)
}
```

**Handles:**
- Network errors (retries, stale data)
- Quota exceeded (cache cleanup)
- Error rate tracking

### Auth Error Handler (`src/lib/auth/actions.ts`)

Utility for handling authentication action errors:

```typescript
import { handleActionError } from '@/lib/auth/actions'

export async function myAuthAction(): Promise<ActionResult> {
  try {
    // ... auth logic
    return { success: true }
  } catch (error) {
    return handleActionError(error, 'my-auth-action')
  }
}
```

## Additional Error Classes

### AI/Image Errors

**`ImagePredictionError`** (`src/lib/ai/imageModels.ts`):
```typescript
import { ImagePredictionError } from '@/lib/ai/imageModels'

throw new ImagePredictionError('Model inference failed', 503)
```

**`ApiError`** (`src/lib/ai/utils.ts`):
```typescript
import { ApiError } from '@/lib/ai/utils'

throw new ApiError('External API request failed')
```

### Lucid L2 Errors

**`LucidL2Error`** (`src/lib/lucid-l2/types.ts`):
```typescript
import { LucidL2Error } from '@/lib/lucid-l2/types'

throw new LucidL2Error('Failed to parse FlowSpec')
```

## Monitoring Integration

The system integrates with `src/lib/monitoring.ts`:

```typescript
import { captureError } from '@/lib/monitoring'

captureError(error, { context: 'workflow-execution' })
```

## Best Practices

### ✅ DO:

1. **Use ErrorService instead of console.error**
   ```typescript
   // ❌ BAD
   console.error('Operation failed:', error)
   
   // ✅ GOOD
   ErrorService.captureException(error, {
     severity: 'error',
     context: { operation: 'create_workflow' }
   })
   ```

2. **Provide context for debugging**
   ```typescript
   ErrorService.captureException(error, {
     context: {
       userId: user.id,
       organizationId: org.id,
       route: '/workflows/create',
       action: 'save_workflow'
     }
   })
   ```

3. **Use appropriate error classes**
   ```typescript
   throw new ValidationError('Invalid input')
   throw new NotFoundError('Resource not found')
   throw new AuthorizationError('Insufficient permissions')
   ```

4. **Set user context after authentication**
   ```typescript
   // After successful login
   ErrorService.setUser({
     id: user.id,
     email: user.email,
     username: user.handle
   })
   
   // On logout
   ErrorService.clearUser()
   ```

5. **Add breadcrumbs for debugging**
   ```typescript
   ErrorService.addBreadcrumb(
     'user_action',
     'Clicked save button',
     { workflowId: 'wf-123' }
   )
   ```

6. **Use standardized response formats**
   ```typescript
   // Server Actions
   return { success: false, error: 'Failed', code: 'DATABASE_ERROR' }
   
   // API Routes
   return Response.json({ error: 'Failed', code: 'DATABASE_ERROR', status: 'error' })
   ```

### ❌ DON'T:

1. **Don't use generic Error class**
   ```typescript
   // ❌ BAD
   throw new Error('Something went wrong')
   
   // ✅ GOOD
   throw new ValidationError('Invalid email format')
   ```

2. **Don't swallow errors silently**
   ```typescript
   // ❌ BAD
   try {
     await operation()
   } catch (error) {
     // Silent failure
   }
   
   // ✅ GOOD
   try {
     await operation()
   } catch (error) {
     ErrorService.captureException(error)
     return { success: false, error: 'Operation failed' }
   }
   ```

3. **Don't log sensitive data**
   ```typescript
   // ❌ BAD
   ErrorService.captureException(error, {
     context: { password: password, apiKey: apiKey }
   })
   
   // ✅ GOOD
   ErrorService.captureException(error, {
     context: { userId: userId, action: 'login_attempt' }
   })
   ```

## Configuration

### Sentry Setup

The error service integrates with Sentry when `NEXT_PUBLIC_SENTRY_DSN` is configured:

```env
# .env.local
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_ORG=your-org
SENTRY_PROJECT=lucidmerged
```

Sentry is initialized in:
- `sentry.client.config.ts` - Client-side
- `sentry.server.config.ts` - Server-side
- `sentry.edge.config.ts` - Edge runtime

## Error Severity Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `fatal` | System crash, complete failure | Database unavailable, critical service down |
| `error` | Operation failed, user affected | Failed to save workflow, payment error |
| `warning` | Potential issue, degraded experience | API timeout, cache miss |
| `info` | Important information | Feature flag toggled, user upgraded |
| `debug` | Debugging information | Development-only logs |

## Integration Points

### Forms & Server Actions

Server actions in `src/lib/forms/actions.ts` follow this pattern:

```typescript
export async function myAction(data: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const validated = schema.parse(data)
    
    // ... operation
    
    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { userId, action: 'myAction' }
    })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
      code: 'VALIDATION_ERROR'
    }
  }
}
```

### API Routes

API routes should use error classes and return standardized responses:

```typescript
export async function POST(request: Request) {
  try {
    const data = await request.json()
    // ... validation & processing
    
    return Response.json({ data, status: 'success' })
  } catch (error) {
    ErrorService.captureException(error)
    
    if (error instanceof ValidationError) {
      return Response.json(error.toJSON(), { status: error.statusCode })
    }
    
    return Response.json({
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      status: 'error'
    }, { status: 500 })
  }
}
```

## Summary

✅ **YES**, LucidMerged has a comprehensive centralized error management system:

1. **Main System**: `src/lib/errors/` (ErrorService + error classes)
2. **Sentry Integration**: Production error tracking & monitoring
3. **Domain-Specific Handlers**: Cache, Auth, AI, Lucid L2
4. **Standardized Formats**: ActionResult, APIResponse types
5. **Utilities**: withErrorHandling, withRetry helpers
6. **User Tracking**: Set user context for debugging
7. **Breadcrumbs**: Track user actions before errors
8. **Severity Levels**: fatal, error, warning, info, debug

**Use ErrorService.captureException() instead of console.error() throughout the app!**
