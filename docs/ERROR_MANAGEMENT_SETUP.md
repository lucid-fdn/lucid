# Error Management System - Quick Setup Guide

## What We Built

✅ **Complete error management infrastructure:**
- Centralized error service with Sentry integration
- Standardized error types (APIError, ValidationError, etc.)
- React Error Boundaries for graceful UI fallbacks
- Error utilities (retry logic, error wrapping)
- Full TypeScript support

## Next Steps (Setup Sentry - 10 minutes)

### Step 1: Create Sentry Account (3 min)

1. Go to https://sentry.io/signup/
2. Sign up (free - 5,000 errors/month)
3. Click "Create Project"
4. Select **"Next.js"** as the platform
5. Name your project (e.g., "lucidmerged")
6. Click "Create Project"

### Step 2: Get Your DSN (1 min)

After creating the project, you'll see:
```
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

Copy this value!

### Step 3: Initialize Sentry in Your Project (3 min)

Run the Sentry wizard:
```bash
npx @sentry/wizard@latest -i nextjs
```

This will:
- Create `sentry.client.config.ts`
- Create `sentry.server.config.ts` 
- Create `sentry.edge.config.ts`
- Update `next.config.mjs`
- Create `.sentryclirc` (for source maps)

**Important:** When prompted:
- ✅ Accept all defaults
- ✅ Say YES to source maps
- ✅ Say YES to performance monitoring

### Step 4: Add Environment Variables (1 min)

Add to your `.env.local`:
```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn-here
SENTRY_AUTH_TOKEN=your-token-here
SENTRY_ORG=your-org-name
SENTRY_PROJECT=your-project-name
NEXT_PUBLIC_ENVIRONMENT=development
```

**Where to find these:**
- **DSN:** Project Settings > Client Keys (DSN)
- **Auth Token:** Settings > Auth Tokens > Create New Token
  - Scopes needed: `project:read`, `project:releases`, `org:read`
- **Org:** Your organization name (in URL)
- **Project:** Your project name

### Step 5: Test Integration (2 min)

Create a test error:

```typescript
// src/app/test-error/page.tsx
'use client'

import { ErrorService } from '@/lib/errors/error-service'

export default function TestErrorPage() {
  const handleTest = () => {
    ErrorService.captureException(new Error('Test error - Sentry integration working! 🎉'), {
      severity: 'info',
      context: { test: true }
    })
    alert('Error sent to Sentry! Check your dashboard.')
  }

  return (
    <div className="p-8">
      <button onClick={handleTest} className="px-4 py-2 bg-blue-500 text-white rounded">
        Test Sentry Integration
      </button>
    </div>
  )
}
```

Then:
1. Visit http://localhost:3000/test-error
2. Click the button
3. Check Sentry dashboard (Issues tab)
4. You should see the test error! 🎉

## How to Use

### 1. Capture Errors in Server Actions

```typescript
import { ErrorService } from '@/lib/errors/error-service'

export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = profileSchema.parse(data)
    await updateProfile(userId, validated)
    return { success: true }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { action: 'updateProfile', userId }
    })
    return { success: false, error: 'Failed to update profile' }
  }
}
```

### 2. Add Error Boundaries to Layouts

```typescript
// src/app/dashboard/layout.tsx
import { ErrorBoundary } from '@/components/error-boundary'

export default function DashboardLayout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}
```

### 3. Use Custom Error Types

```typescript
import { ValidationError, AuthenticationError } from '@/lib/errors/types'

// Throw specific errors
if (!user) {
  throw new AuthenticationError('User not authenticated')
}

if (!isValid(data)) {
  throw new ValidationError('Invalid input', { field: 'email' })
}
```

### 4. Set User Context After Auth

```typescript
// After successful login
import { ErrorService } from '@/lib/errors/error-service'

const { userId, email } = await getServerAuth()
ErrorService.setUser({
  id: userId,
  email: email,
})
```

### 5. Add Breadcrumbs for Debugging

```typescript
// Track user actions before errors
ErrorService.addBreadcrumb(
  'navigation',
  'User clicked "Create Workflow"',
  { workflowName: 'My Workflow' }
)
```

## What Happens Now

### Development Mode
- Errors logged to console
- Full error details visible
- NOT sent to Sentry (unless DSN configured)

### Production Mode
- Errors sent to Sentry
- User sees friendly error UI
- You get notified of issues
- Full context for debugging

## Sentry Dashboard Features

### Issues Tab
- All errors grouped by type
- Stack traces with source maps
- User context (who experienced the error)
- Breadcrumbs (what led to the error)

### Performance Tab
- Slow transactions
- API response times
- Database query performance

### Releases Tab
- Track errors by deployment
- See when new errors were introduced
- Compare error rates between releases

## Configuring Alerts

1. Go to **Alerts** > **Create Alert**
2. **Recommended Alerts:**

**Critical Errors:**
```
When: Any error with severity = 'fatal'
Then: Send Slack message OR Email
Frequency: Immediately
```

**High Error Rate:**
```
When: >10 errors in 1 minute
Then: Send Slack message
Frequency: Once per 5 minutes
```

**New Error Type:**
```
When: First time error seen
Then: Send Email
Frequency: For each new issue
```

## Best Practices

### ✅ DO

1. **Use ErrorService everywhere**
   ```typescript
   ErrorService.captureException(error)
   ```

2. **Set user context after auth**
   ```typescript
   ErrorService.setUser({ id, email })
   ```

3. **Add context for debugging**
   ```typescript
   ErrorService.captureException(error, {
     context: { userId, action: 'checkout' }
   })
   ```

4. **Use appropriate severity**
   ```typescript
   // fatal = app crashes
   // error = feature broken
   // warning = unexpected but handled
   ```

5. **Wrap root layouts with ErrorBoundary**

### ❌ DON'T

1. **Don't log sensitive data**
   ```typescript
   // ❌ BAD
   ErrorService.captureException(error, {
     context: { password, creditCard }
   })
   ```

2. **Don't ignore errors**
   ```typescript
   // ❌ BAD
   try { ... } catch { /* silent */ }
   
   // ✅ GOOD
   try { ... } catch (e) { 
     ErrorService.captureException(e)
   }
   ```

3. **Don't use console.error in production**
   ```typescript
   // ❌ BAD
   console.error('Error:', error)
   
   // ✅ GOOD
   ErrorService.captureException(error)
   ```

## Monitoring

### Free Tier Limits
- **5,000 errors/month**
- **7-day data retention**
- **1 project**
- **Unlimited team members**

### Staying Within Limits
- Filter development errors (only send in production)
- Use sample rates for high-volume errors
- Set up alert budgets

## Troubleshooting

### Errors Not Showing in Sentry?

1. **Check DSN is set**
   ```bash
   echo $NEXT_PUBLIC_SENTRY_DSN
   ```

2. **Check environment**
   - Sentry only sends errors when DSN is configured
   - Development errors only sent if DSN exists

3. **Check source maps**
   ```bash
   # Make sure build includes source maps
   npm run build
   ```

### Source Maps Not Working?

1. **Check auth token has correct scopes:**
   - `project:read`
   - `project:releases`
   - `org:read`

2. **Check `.sentryclirc` file exists**

3. **Rebuild project:**
   ```bash
   rm -rf .next
   npm run build
   ```

## Support Resources

- **Sentry Docs:** https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Our Docs:** `docs/ERROR_MANAGEMENT_SYSTEM.md` (comprehensive guide)
- **Sentry Status:** https://status.sentry.io/

## Summary

🎉 **You now have:**
- ✅ Industry-standard error tracking (Sentry)
- ✅ Centralized error management
- ✅ User-friendly error UI
- ✅ Full TypeScript support
- ✅ Production-ready infrastructure

**Next:** Follow the 5 setup steps above (10 minutes) to activate Sentry!
