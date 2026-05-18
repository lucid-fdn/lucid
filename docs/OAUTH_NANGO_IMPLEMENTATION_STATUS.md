# OAuth Nango Implementation Status

## Summary

This document tracks the OAuth implementation status and what needs to be completed to follow Nango's official implementation guide.

## ✅ Completed

### 1. Fixed Button Loading State Bug
- **Problem:** All 7 buttons showed loading state when clicking just one
- **Solution:** Implemented per-provider loading state using `Set<string>`
- **Files Modified:**
  - `src/hooks/use-oauth.ts` - Added `loadingProviders` Set and `isProviderLoading()` helper
  - `src/components/oauth/oauth-management.tsx` - Updated all ProviderCard calls to use per-provider loading

### 2. Created Session Token Endpoint
- **File:** `src/app/api/oauth/session/route.ts`
- **Purpose:** Creates Nango session tokens following their official API
- **Documentation:** https://nango.dev/docs/implementation-guides/api-auth/implement-api-auth

### 3. Updated Hook to Request Session Tokens
- **File:** `src/hooks/use-oauth.ts`
- **Change:** `connectProvider()` now calls `/api/oauth/session` to get session token
- **Returns:** `{ sessionToken, providerId }` instead of redirecting directly

---

## ❌ Issues Identified

### Current Implementation vs. Nango's Official Flow

**Our Current (Incorrect) Flow:**
```
1. User clicks "Connect" button
2. Frontend calls /api/oauth/{provider}/initiate
3. Backend proxies to Nango backend
4. Get auth URL and redirect
```

**Nango's Official (Correct) Flow:**
```
1. User clicks "Connect" button
2. Backend creates Nango session token (✅ DONE)
3. Frontend loads Nango Connect UI with session token (❌ NOT DONE)
4. Nango handles OAuth flow in their UI (❌ NOT DONE)
5. Backend receives webhook with connection ID (❌ NOT DONE)
6. Store connection ID in database (❌ NOT DONE)
```

---

## 🚧 What Still Needs to Be Done

### 1. Install Nango Frontend SDK

```bash
npm install @nangohq/frontend
```

### 2. Update OAuth Management Component

**File:** `src/components/oauth/oauth-management.tsx`

Currently the `handleConnect` function needs to be updated to use Nango Connect UI:

```typescript
// CURRENT (WRONG)
const handleConnect = async (providerId: string) => {
  await connectProvider(providerId) // This redirects directly
}

// SHOULD BE (RIGHT)
const handleConnect = async (providerId: string) => {
  try {
    // Get session token
    const { sessionToken } = await connectProvider(providerId)
    
    // Open Nango Connect UI
    const nango = new Nango()
    const connect = nango.openConnectUI({
      onEvent: (event) => {
        if (event.type === 'close') {
          // User closed modal - remove loading state
          setLoadingProviders(prev => {
            const next = new Set(prev)
            next.delete(providerId)
            return next
          })
        } else if (event.type === 'connect') {
          // Connection successful!
          // Connection ID will arrive via webhook
          // For now, just refresh connections
          refreshConnections()
        }
      },
    })
    
    // Set the session token (shows OAuth UI)
    connect.setSessionToken(sessionToken)
    
  } catch (error) {
    console.error('Failed to connect:', error)
  }
}
```

### 3. Create Webhook Handler

**File:** `src/app/api/oauth/webhooks/route.ts` (NEW FILE)

This endpoint receives notifications from Nango when connections are created/updated:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('[OAuth Webhook] Received webhook', {
      type: body.type,
      operation: body.operation,
      success: body.success,
      connectionId: body.connectionId
    })
    
    // Verify this is an auth webhook
    if (body.type === 'auth' && body.operation === 'creation' && body.success) {
      // Connection created successfully!
      const { connectionId, endUser } = body
      
      // TODO: Store connection ID in your database
      // Map connectionId to endUser.endUserId (your user ID)
      // await saveConnectionToDatabase(endUser.endUserId, connectionId)
      
      console.log('[OAuth Webhook] Connection created', {
        connectionId,
        userId: endUser.endUserId,
        tags: endUser.tags
      })
    }
    
    return NextResponse.json({ received: true })
    
  } catch (error) {
    console.error('[OAuth Webhook] Error:', error)
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/oauth/webhooks' },
      tags: { layer: 'api' }
    })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
```

### 4. Configure Nango Webhook URL

In Nango Dashboard:
1. Go to Environment Settings
2. Set Webhook URL: `https://yourdomain.com/api/oauth/webhooks`
3. Enable "Send New Connection Creation Webhooks"

### 5. Create Connection Storage Table (Optional but Recommended)

```sql
CREATE TABLE oauth_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(id),
  nango_connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_oauth_connections_user_id ON oauth_connections(user_id);
CREATE INDEX idx_oauth_connections_nango_id ON oauth_connections(nango_connection_id);
```

### 6. Environment Variables Needed

Add to `.env.local`:

```bash
# Nango Configuration
NANGO_SECRET_KEY=your_nango_secret_key_here
NANGO_PUBLIC_KEY=your_nango_public_key_here
NEXT_PUBLIC_OAUTH_API_URL=https://api.nango.dev  # or your self-hosted instance
```

---

## 📚 Reference Documentation

- **Nango Implementation Guide:** https://nango.dev/docs/implementation-guides/api-auth/implement-api-auth
- **Nango Frontend SDK:** https://nango.dev/docs/reference/sdks/frontend
- **Nango Node SDK:** https://nango.dev/docs/reference/sdks/node
- **Webhook Reference:** https://nango.dev/docs/implementation-guides/platform/webhooks-from-nango

---

## 🎯 Priority Order

1. **HIGH:** Install `@nangohq/frontend` package
2. **HIGH:** Update `handleConnect` in `oauth-management.tsx` to use Nango Connect UI
3. **HIGH:** Create webhook handler at `/api/oauth/webhooks/route.ts`
4. **MEDIUM:** Configure webhook URL in Nango dashboard
5. **MEDIUM:** Create database table for storing connection mappings
6. **LOW:** Add reconnection flow for expired connections
7. **LOW:** Add custom callback URL (if needed for specific providers)

---

## 🐛 Current Known Issues

1. ✅ **FIXED:** All buttons show loading when clicking one button
2. ⚠️ **NOT FIXED:** OAuth flow doesn't follow Nango's official pattern
3. ⚠️ **NOT FIXED:** No webhook handler to receive connection IDs
4. ⚠️ **NOT FIXED:** Connection IDs not stored in our database
5. ⚠️ **NOT FIXED:** Using direct API calls instead of Nango Connect UI

---

## 💡 Quick Test Checklist

Once implementation is complete:

- [ ] User clicks "Connect Google" button
- [ ] Nango Connect UI modal appears
- [ ] User completes OAuth flow in modal
- [ ] Modal closes automatically on success
- [ ] Webhook is received with connection ID
- [ ] Connection shows as "Connected" in UI
- [ ] User can disconnect and reconnect
- [ ] Only the clicked button shows loading state
- [ ] Other buttons remain clickable during OAuth flow

---

## 📝 Notes

- The current `src/app/api/oauth/[provider]/initiate/route.ts` file is NOT used in the proper Nango flow
- We should keep it for backward compatibility but document it as deprecated
- The session token approach is more secure (token never exposed to frontend)
- Webhooks ensure reliable connection ID tracking even if user closes browser
