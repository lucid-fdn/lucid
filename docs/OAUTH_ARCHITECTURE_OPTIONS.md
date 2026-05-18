# OAuth Architecture Options (Self-Hosted Nango)

Since you have a **self-hosted Nango backend**, you have two implementation options:

---

## Option 1: Without Nango Frontend SDK (✅ RECOMMENDED for custom UI)

### Architecture
```
Your Frontend → Your Next.js API Routes → Self-Hosted Nango Backend
```

### What You Have
- ✅ Self-hosted Nango backend at `http://54.204.114.86:3001`
- ✅ Your own custom OAuth management UI
- ✅ Next.js API routes that proxy to Nango backend

### Implementation (NO FRONTEND SDK NEEDED)

**1. Your Current Flow Can Work With These Changes:**

```typescript
// In oauth-management.tsx
const handleConnect = async (providerId: string) => {
  try {
    // Step 1: Get session token from YOUR backend
    const { sessionToken } = await connectProvider(providerId)
    
    // Step 2: Call YOUR API to start OAuth with session token
    const response = await fetch(`/api/oauth/${providerId}/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionToken })
    })
    
    const { authUrl } = await response.json()
    
    // Step 3: Redirect to OAuth provider
    window.location.href = authUrl
    
  } catch (error) {
    console.error('Failed to connect:', error)
  }
}
```

**2. Update Your Initiate Route to Accept Session Token:**

```typescript
// src/app/api/oauth/[provider]/initiate/route.ts
export async function POST(request: NextRequest, { params }) {
  const { provider } = await params
  const userId = await requireUserId()
  const body = await request.json()
  const { sessionToken } = body
  
  // Forward to self-hosted Nango with session token
  const response = await fetch(
    `${NANGO_API_URL}/api/oauth/${provider}/initiate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nango-Session-Token': sessionToken, // Use session token
      },
      body: JSON.stringify({
        userId,
        redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/oauth/callback`
      })
    }
  )
  
  // Return auth URL for redirect
  const data = await response.json()
  return NextResponse.json(data)
}
```

**3. Your OAuth Callback Handles Success:**

```typescript
// src/app/oauth/callback/page.tsx (already exists)
// This receives the callback from provider and confirms with Nango
```

### Pros
- ✅ Full control over UI/UX
- ✅ No extra frontend dependencies
- ✅ Consistent with your existing design system
- ✅ Works with your self-hosted Nango

### Cons
- ⚠️ You handle all OAuth edge cases
- ⚠️ More code to maintain

---

## Option 2: With Nango Frontend SDK (Easier but less control)

### Architecture
```
Nango Frontend SDK → Self-Hosted Nango Backend
     (modal UI)          (OAuth handling)
```

### Implementation

**1. Install SDK:**
```bash
npm install @nangohq/frontend
```

**2. Configure SDK to Point to Your Backend:**
```typescript
import Nango from '@nangohq/frontend'

// Point to YOUR self-hosted instance
const nango = new Nango({ 
  host: 'http://54.204.114.86:3001'  // Your self-hosted Nango
})

const connect = nango.openConnectUI({
  onEvent: (event) => {
    if (event.type === 'connect') {
      refreshConnections()
    }
  }
})

connect.setSessionToken(sessionToken)
```

### Pros
- ✅ Pre-built OAuth UI modal
- ✅ Handles edge cases automatically
- ✅ Less code to maintain

### Cons
- ⚠️ Extra dependency (212 KB)
- ⚠️ Less UI control
- ⚠️ Might not match your design system

---

## 🎯 RECOMMENDATION: Option 1 (No Frontend SDK)

**Why?**
1. You already have a beautiful custom OAuth UI
2. You have self-hosted Nango backend (so backend SDK is all you need)
3. You maintain full control over UX
4. One less dependency to manage

**What You Need:**
1. ✅ Session token endpoint (DONE)
2. ✅ Update initiate route to use session token
3. ✅ Webhook handler for connection IDs
4. Database storage for connection mappings

---

## Architecture Diagram (Option 1 - Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                      YOUR FRONTEND                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OAuth Management Component                          │  │
│  │  • Click "Connect Google"                            │  │
│  │  • Shows YOUR custom loading state                   │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                            │
└─────────────────┼────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              YOUR NEXT.JS API ROUTES                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ POST /api/oauth/session                              │  │
│  │ → Create Nango session token                         │  │
│  │ → Return: { sessionToken }                           │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│  ┌────────────▼─────────────────────────────────────────┐  │
│  │ POST /api/oauth/{provider}/initiate                  │  │
│  │ → Use session token                                  │  │
│  │ → Get auth URL from Nango                            │  │
│  │ → Return: { authUrl }                                │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│  ┌────────────▼─────────────────────────────────────────┐  │
│  │ POST /api/oauth/webhooks                             │  │
│  │ → Receive connection ID from Nango                   │  │
│  │ → Store in database                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────┼┼────────────────────────────────────────────┘
                ││
                ││ HTTP Requests
                ▼▼
┌─────────────────────────────────────────────────────────────┐
│         SELF-HOSTED NANGO BACKEND                           │
│         (http://54.204.114.86:3001)                         │
│  • Manages OAuth credentials                                │
│  • Handles OAuth flow with providers                        │
│  • Sends webhooks on connection success                     │
└─────────────────────────────────────────────────────────────┘
                  │
                  │ OAuth Flow
                  ▼
         ┌─────────────────┐
         │  OAuth Provider │
         │ (Google, etc.)  │
         └─────────────────┘
```

---

## Summary

**You DON'T need the Nango Frontend SDK** because:
1. ✅ You have self-hosted Nango backend
2. ✅ You have custom UI already built
3. ✅ Your Next.js API routes can talk directly to Nango backend
4. ✅ You maintain full UI/UX control

**What you DO need:**
1. Session token flow (✅ partially done)
2. Webhook handler (❌ not done yet)
3. Connection ID storage (❌ not done yet)
