# OAuth Testing Guide - LucidMerged

**Date:** January 12, 2025  
**Status:** Ready for Testing  
**Compliance:** 100% Complete with JWT Forwarding

> Current-state note:
> This guide is historical/local-dev oriented. For the current production validation bar and connect-flow behavior, use `docs/architecture/oauth-integration-validation.md` as the authoritative reference.

---

## Overview

This guide helps you test the complete OAuth implementation with comprehensive logging. All major operations now have detailed console logs to verify the authentication flow works correctly.

---

## Prerequisites

### 1. Environment Setup

Ensure these environment variables are set in `.env.local`:

```bash
# OAuth Configuration
NEXT_PUBLIC_OAUTH_API_URL=http://localhost:3001
NEXT_PUBLIC_OAUTH_CALLBACK_URL=http://localhost:3000/oauth/callback
NEXT_PUBLIC_OAUTH_PROVIDER=nango

# Privy Authentication (already configured)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-secret
```

### 2. Nango Backend Running

The Nango OAuth backend must be running at `http://localhost:3001`:

```bash
# Check if Nango is running
curl http://localhost:3001/api/oauth/providers

# Should return list of providers
```

### 3. Next.js Dev Server

Start your development server:

```bash
npm run dev
# Server running at http://localhost:3000
```

---

## Log Legend

All logs use consistent emoji prefixes for easy filtering:

| Emoji | Meaning | Example |
|-------|---------|---------|
| 🔵 | START operation | `[useOAuth] 🔵 START loadProviders` |
| ✅ | SUCCESS | `[NangoAdapter] ✅ Successfully fetched providers` |
| ❌ | ERROR | `[OAuth API] ❌ Failed to initiate OAuth` |
| ⚠️ | WARNING | `[useOAuth] ⚠️ Not authenticated` |
| 🔄 | LOADING/REFRESH | `[OAuth Callback] 🔄 Refreshing connections` |
| 📋 | DATA/INFO | `[OAuth Callback] 📋 URL parameters` |
| 📦 | CONTEXT | `[OAuth Callback] 📦 Retrieved context` |
| 🔀 | REDIRECT | `[useOAuth] 🔀 Redirecting to provider` |
| ⏱️ | TIMING | `[OAuth Callback] ⏱️ Redirecting in 2s` |
| 🧹 | CLEANUP | `[OAuth Callback] 🧹 Cleaning up` |
| 🏁 | COMPLETE | `[OAuth Callback] 🏁 COMPLETE` |

---

## Test Scenarios

### Test 1: Load OAuth Providers (Public)

**Test:** View available OAuth providers without authentication

**Steps:**
1. Open browser console (F12)
2. Navigate to `/settings/oauth` (can be unauthenticated)
3. Watch for these logs:

**Expected Console Output:**
```
[useOAuth] 🔵 START loadProviders
[NangoAdapter] 🔵 START getProviders
[OAuth Providers API] Fetching from: http://localhost:3001/api/oauth/providers
[NangoAdapter] ✅ Successfully fetched providers {
  count: 3,
  duration_ms: 45,
  providers: ['google', 'slack', 'github']
}
[useOAuth] ✅ Loaded providers {
  count: 3,
  duration_ms: 48,
  providers: ['google', 'slack', 'github']
}
```

**Success Criteria:**
- ✅ Providers load successfully
- ✅ Duration < 200ms
- ✅ Provider list displayed in UI
- ✅ No authentication required

---

### Test 2: Load User Connections (Authenticated)

**Test:** View user's OAuth connections

**Steps:**
1. Log in with Privy
2. Navigate to `/settings/oauth`
3. Watch console

**Expected Console Output:**
```
[useOAuth] 🔵 START loadConnections { userId: 'user-uuid-here' }
[NangoAdapter] 🔵 START getConnections { userId: 'user-uuid-here' }
[OAuth Connections API] Fetching from Nango {
  url: 'http://localhost:3001/api/oauth/connections',
  userId: 'user-uuid-here',
  hasToken: true
}
[NangoAdapter] ✅ Successfully fetched connections {
  userId: 'user-uuid-here',
  count: 2,
  duration_ms: 78,
  connections: [
    { provider: 'google', isActive: true },
    { provider: 'slack', isActive: true }
  ]
}
[useOAuth] ✅ Loaded connections {
  count: 2,
  duration_ms: 82,
  userId: 'user-uuid-here',
  connections: [...]
}
```

**Success Criteria:**
- ✅ Privy JWT forwarded (hasToken: true)
- ✅ Internal user ID used
- ✅ Active connections displayed
- ✅ Duration < 500ms

---

### Test 3: Connect Provider (Full Flow)

**Test:** Complete OAuth authorization flow

**Steps:**
1. Log in with Privy
2. Navigate to `/settings/oauth`
3. Click "Connect Google" (or any provider)
4. Watch console through entire flow

**Expected Console Output (Part 1 - Initiation):**
```
[useOAuth] 🔵 START connectProvider {
  providerId: 'google',
  userId: 'user-uuid-here'
}
[NangoAdapter] 🔵 START initiateAuth {
  provider: 'google',
  userId: 'user-uuid-here',
  scopes: undefined,
  redirectUri: 'http://localhost:3000/oauth/callback'
}
[OAuth Initiate API] Initiating OAuth flow {
  provider: 'google',
  userId: 'user-uuid-here',
  hasToken: true,
  redirectUri: 'http://localhost:3000/oauth/callback'
}
[NangoAdapter] ✅ OAuth initiation successful {
  provider: 'google',
  duration_ms: 125,
  hasAuthUrl: true,
  scopes: ['email', 'profile']
}
[useOAuth] ✅ OAuth initiation successful {
  providerId: 'google',
  duration_ms: 128,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
  scopes: ['email', 'profile'],
  context: {
    providerId: 'google',
    userId: 'user-uuid-here',
    timestamp: 1705069200000
  }
}
[useOAuth] 🔀 Redirecting to provider authorization page...
```

**Then user is redirected to Google's authorization page...**

**Expected Console Output (Part 2 - Callback):**
```
[OAuth Callback] 🔵 START processCallback
[OAuth Callback] 📋 URL parameters: {
  success: 'Google',
  error: null,
  errorMessage: null,
  allParams: { oauth_success: 'Google' }
}
[OAuth Callback] 📦 Retrieved context from sessionStorage: {
  providerId: 'google',
  userId: 'user-uuid-here',
  timestamp: 1705069200000
}
[OAuth Callback] 🔄 Refreshing connections...
[useOAuth] 🔵 START loadConnections { userId: 'user-uuid-here' }
[NangoAdapter] 🔵 START getConnections { userId: 'user-uuid-here' }
[OAuth Connections API] SUCCESS { userId: 'user-uuid-here', connectionsCount: 3 }
[NangoAdapter] ✅ Successfully fetched connections {
  userId: 'user-uuid-here',
  count: 3,
  duration_ms: 94,
  connections: [
    { provider: 'google', isActive: true },
    { provider: 'slack', isActive: true },
    { provider: 'github', isActive: true }
  ]
}
[useOAuth] ✅ Loaded connections {
  count: 3,
  duration_ms: 98,
  userId: 'user-uuid-here'
}
[OAuth Callback] ✅ Connections refreshed { duration_ms: 102 }
[OAuth Callback] ✅ SUCCESS {
  provider: 'Google',
  context: {...},
  total_duration_ms: 156
}
[OAuth Callback] ⏱️ Redirecting to /settings/oauth in 2s
[OAuth Callback] 🧹 Cleaning up sessionStorage
[OAuth Callback] 🏁 COMPLETE { total_duration_ms: 2158 }
```

**Success Criteria:**
- ✅ JWT forwarded in initiate request
- ✅ Context stored in sessionStorage
- ✅ User successfully redirected to provider
- ✅ Callback receives success parameter
- ✅ Connections automatically refreshed
- ✅ New connection appears in list
- ✅ Automatic redirect after 2s
- ✅ Total flow < 5s

---

### Test 4: Disconnect Provider

**Test:** Remove OAuth connection

**Steps:**
1. Have at least one connected provider
2. Click "Disconnect" button
3. Confirm in dialog
4. Watch console

**Expected Console Output:**
```
[useOAuth] 🔵 START disconnectProvider {
  providerId: 'google',
  userId: 'user-uuid-here'
}
[NangoAdapter] 🔵 START disconnect {
  provider: 'google',
  userId: 'user-uuid-here'
}
[OAuth Disconnect API] Disconnecting provider {
  provider: 'google',
  userId: 'user-uuid-here',
  hasToken: true
}
[NangoAdapter] ✅ Successfully disconnected {
  provider: 'google',
  userId: 'user-uuid-here',
  duration_ms: 98
}
[useOAuth] ✅ Disconnected provider {
  providerId: 'google',
  duration_ms: 102
}
[useOAuth] 🔄 Reloading connections after disconnect
[useOAuth] 🔵 START loadConnections { userId: 'user-uuid-here' }
[NangoAdapter] 🔵 START getConnections { userId: 'user-uuid-here' }
[OAuth Connections API] SUCCESS { userId: 'user-uuid-here', connectionsCount: 2 }
[useOAuth] ✅ Successfully disconnected and refreshed { providerId: 'google' }
```

**Success Criteria:**
- ✅ JWT forwarded in disconnect request
- ✅ Provider removed from Nango
- ✅ Connections list automatically refreshed
- ✅ UI updates immediately
- ✅ Total operation < 500ms

---

### Test 5: Error Handling (Network Failure)

**Test:** What happens when Nango is down

**Steps:**
1. Stop Nango backend: `Ctrl+C` on Nango process
2. Try to load OAuth settings page
3. Watch console

**Expected Console Output:**
```
[useOAuth] 🔵 START loadProviders
[NangoAdapter] 🔵 START getProviders
[OAuth Providers API] Nango error: 500 Internal Server Error
[NangoAdapter] ❌ Failed to fetch providers {
  status: 500,
  statusText: 'Internal Server Error'
}
[NangoAdapter] ❌ Error fetching providers: {
  error: 'Failed to fetch providers',
  code: 'NETWORK_ERROR'
}
[useOAuth] ❌ Error loading providers: {
  error: 'Failed to fetch OAuth providers',
  stack: '...'
}
```

**Success Criteria:**
- ✅ Error caught gracefully
- ✅ User sees mock fallback providers (google, slack, github)
- ✅ App doesn't crash
- ✅ Error message displayed in UI

---

### Test 6: Authentication Error (Not Logged In)

**Test:** What happens when trying to connect without auth

**Steps:**
1. Log out of Privy
2. Try to load connections (should show empty)
3. Watch console

**Expected Console Output:**
```
[useOAuth] ⚠️ Not authenticated, skipping connections load
```

**Success Criteria:**
- ✅ No API calls made
- ✅ Empty connections list
- ✅ No errors thrown
- ✅ Clean user experience

---

## Server-Side Logs

Check your Next.js server console (terminal) for these logs:

### Connections API Route
```
[OAuth Connections API] Fetching from Nango {
  url: 'http://localhost:3001/api/oauth/connections',
  userId: 'user-uuid-here',
  hasToken: true
}
[OAuth Connections API] Success {
  userId: 'user-uuid-here',
  connectionsCount: 2
}
```

### Initiate API Route
```
[OAuth Initiate API] Initiating OAuth flow {
  provider: 'google',
  userId: 'user-uuid-here',
  hasToken: true,
  redirectUri: 'http://localhost:3000/oauth/callback'
}
[OAuth Initiate API] Success {
  provider: 'google',
  userId: 'user-uuid-here',
  hasAuthUrl: true
}
```

### Disconnect API Route
```
[OAuth Disconnect API] Disconnecting provider {
  provider: 'google',
  userId: 'user-uuid-here',
  hasToken: true
}
[OAuth Disconnect API] Success {
  provider: 'google',
  userId: 'user-uuid-here'
}
```

---

## Performance Benchmarks

Expected timing (from logs):

| Operation | Expected Duration | Alert If > |
|-----------|------------------|------------|
| Load providers | 50-200ms | 500ms |
| Load connections | 100-300ms | 1000ms |
| Initiate OAuth | 100-400ms | 1000ms |
| Disconnect provider | 100-300ms | 1000ms |
| Callback processing | 100-500ms | 2000ms |
| Total connect flow | 2-5s | 10s |

---

## Troubleshooting

### No Logs Appearing

**Problem:** Console is empty

**Solutions:**
1. Clear browser cache
2. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
3. Check console filter settings (show all logs)
4. Verify you're on the correct page

### JWT Not Forwarded (hasToken: false)

**Problem:** `hasToken: false` in logs

**Solutions:**
1. Verify you're logged in with Privy
2. Check Privy token in cookies (Application > Cookies > privy-token)
3. Try logging out and back in
4. Check `.env.local` has correct Privy credentials

### Nango Connection Errors

**Problem:** `NETWORK_ERROR` or 500 responses

**Solutions:**
1. Verify Nango is running: `curl http://localhost:3001/api/oauth/providers`
2. Check Nango logs for errors
3. Restart Nango backend
4. Verify environment variables match

### OAuth Callback Not Working

**Problem:** Stuck on loading screen

**Solutions:**
1. Check callback URL in provider's OAuth settings
2. Verify `NEXT_PUBLIC_OAUTH_CALLBACK_URL` is correct
3. Check browser console for errors
4. Verify sessionStorage has oauth_context

---

## Success Checklist

After testing, verify these work:

**Load Operations:**
- [ ] Can load providers list (public)
- [ ] Can load connections (authenticated)
- [ ] Mock fallbacks work when Nango down

**Connect Flow:**
- [ ] Can click "Connect Provider"
- [ ] Redirects to provider's auth page
- [ ] Can authorize on provider
- [ ] Redirects back to callback page
- [ ] Shows success animation
- [ ] Refreshes connections list
- [ ] New connection appears
- [ ] Auto-redirects after 2s

**Disconnect Flow:**
- [ ] Can click "Disconnect"
- [ ] Confirmation dialog appears
- [ ] Provider removed successfully
- [ ] Connections list updates
- [ ] Toast notification shows

**Error Handling:**
- [ ] Graceful Nango downtime handling
- [ ] Clean unauthenticated state
- [ ] Network errors caught
- [ ] User-friendly error messages

**Performance:**
- [ ] All operations < 1s
- [ ] Total flow < 5s
- [ ] No memory leaks
- [ ] No console errors

---

## Advanced Testing

### Test with Multiple Providers

Connect 3+ providers and verify:
- All appear in connections list
- Each can be disconnected independently
- Stats load correctly for each
- No cross-contamination of data

### Test Error Recovery

1. Start Nango
2. Load providers (should work)
3. Stop Nango
4. Refresh page (should show fallback)
5. Start Nango again
6. Refresh (should load real data)

### Test Concurrent Operations

1. Open devtools
2. Click "Connect Google"
3. Immediately open new tab
4. Load `/settings/oauth` in new tab
5. Verify no race conditions
6. Complete Google auth in first tab
7. Verify both tabs update

---

## Production Testing

Before deploying to production:

1. **Replace Environment URLs:**
   ```bash
   NEXT_PUBLIC_OAUTH_API_URL=https://your-nango-prod.com
   NEXT_PUBLIC_OAUTH_CALLBACK_URL=https://your-app.com/oauth/callback
   ```

2. **Test with Real Providers:**
   - Google OAuth
   - Slack OAuth
   - GitHub OAuth
   - etc.

3. **Verify HTTPS:**
   - All redirects use HTTPS
   - No mixed content warnings
   - SSL certificates valid

4. **Load Testing:**
   - Test with 10+ concurrent users
   - Monitor server logs for errors
   - Check database connection count
   - Verify JWT tokens don't expire mid-flow

5. **Security Audit:**
   - JWT tokens never logged in production
   - No sensitive data in console logs
   - CORS configured correctly
   - Rate limiting active

---

## Log Retention

**Development:** All logs visible in console

**Production:** 
- Remove console.log statements or
- Use conditional logging: `if (process.env.NODE_ENV === 'development')`
- Keep ErrorService.captureException calls

---

**Your OAuth implementation is now 100% complete and ready to test! 🎉**

Follow this guide to verify every aspect works correctly before deploying to production.
