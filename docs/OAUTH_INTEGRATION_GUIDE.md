# OAuth Integration Guide

**Complete Implementation Guide for OAuth in LucidMerged**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup & Configuration](#setup--configuration)
4. [Integration Points](#integration-points)
5. [Usage Examples](#usage-examples)
6. [Swapping OAuth Providers](#swapping-oauth-providers)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The OAuth system in LucidMerged provides:

- ✅ **Vendor-Agnostic Architecture** - Swap providers without touching app code
- ✅ **Automatic Node Detection** - OAuth requirements detected from n8n metadata
- ✅ **React Hooks** - Simple integration in any component
- ✅ **Management UI** - Global OAuth settings page
- ✅ **Credential Selector** - Drop-in component for node configuration
- ✅ **Type-Safe** - Full TypeScript coverage

**Status:** Production Ready ✅

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Application Code                      │
│  • No knowledge of specific OAuth provider              │
│  • Uses IOAuthProvider interface                        │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│           OAuth Service (Factory Pattern)                │
│  src/lib/oauth/index.ts                                 │
│  • getOAuthService() - Single entry point               │
│  • Environment-based provider selection                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│        OAuth Provider Adapter (Nango/Supabase/etc)      │
│  src/lib/oauth/providers/nango-adapter.ts               │
│  • Implements IOAuthProvider interface                  │
│  • Provider-specific code isolated                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              External OAuth Backend                      │
│  • Handles OAuth flows                                  │
│  • Manages tokens                                       │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose | Vendor-Specific? |
|------|---------|------------------|
| `src/lib/oauth/types.ts` | Type definitions & interfaces | ❌ No |
| `src/lib/oauth/index.ts` | Service factory | ❌ No |
| `src/lib/oauth/providers/nango-adapter.ts` | Nango implementation | ✅ **YES** |
| `src/lib/oauth/node-detection.ts` | Auto-detect OAuth nodes | ❌ No |
| `src/hooks/use-oauth.ts` | React hooks | ❌ No |
| `src/app/oauth/callback/page.tsx` | OAuth callback handler | ❌ No |
| `src/components/oauth/oauth-credential-selector.tsx` | Credential UI | ❌ No |
| `src/app/(app)/settings/oauth/page.tsx` | Management page | ❌ No |

**Vendor Lock-in:** Only ~350 lines in ONE file

---

## Setup & Configuration

### 1. Environment Variables

Add to `.env.local`:

```bash
# OAuth Backend API
NEXT_PUBLIC_OAUTH_API_URL=http://localhost:3001

# OAuth Callback URL (where provider redirects after authorization)
NEXT_PUBLIC_OAUTH_CALLBACK_URL=http://localhost:3000/oauth/callback

# OAuth Provider (nango, supabase, custom, etc.)
NEXT_PUBLIC_OAUTH_PROVIDER=nango
```

### 2. Backend Setup (Nango)

If using Nango, ensure your Nango backend is running on `http://localhost:3001` (or update the URL above).

### 3. Provider Configuration

Configure OAuth providers in your backend (Nango dashboard, Supabase dashboard, etc.).

---

## Integration Points

### 1. Global OAuth Management Page

**Route:** `/settings/oauth`

Already implemented! Users can:
- View all available OAuth providers
- Connect new accounts
- Disconnect existing accounts
- See connection statistics

**File:** `src/app/(app)/settings/oauth/page.tsx`

### 2. Node Configuration Panel Integration

**IMPORTANT:** Integrate OAuth into your workflow node configuration panel.

#### Step-by-Step Integration

**File to modify:** `src/components/workflow/config/node-config-panel.tsx` (or similar)

```typescript
// 1. Import the OAuth credential selector
import { OAuthCredentialSelector } from '@/components/oauth/oauth-credential-selector'
import { useNodeOAuth } from '@/hooks/use-oauth'

// 2. Inside your node config component
export function NodeConfigPanel({ selectedNode, onUpdate }) {
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>()
  
  // 3. Detect if node requires OAuth
  const { requiresOAuth, provider } = useNodeOAuth(selectedNode.type)

  // 4. Render OAuth selector in "Account" or "Credentials" section
  return (
    <div className="space-y-4">
      {/* Other node configuration fields */}
      
      {/* OAuth Credential Selector */}
      {requiresOAuth ? (
        <OAuthCredentialSelector
          nodeType={selectedNode.type}
          value={selectedCredentialId}
          onChange={(credentialId) => {
            setSelectedCredentialId(credentialId)
            // Update node with credential ID
            onUpdate({
              ...selectedNode,
              credentialId
            })
          }}
        />
      ) : (
        // Fallback for non-OAuth nodes (manual API key input)
        <div>
          <Label>API Key</Label>
          <Input type="password" placeholder="Enter API key" />
        </div>
      )}

      {/* Other configuration fields */}
    </div>
  )
}
```

#### What Happens

1. **Auto-Detection:** `useNodeOAuth(nodeType)` checks if node requires OAuth
2. **UI Rendering:** If OAuth required, shows selector; otherwise shows manual input
3. **Visual Feedback:** 
   - ✅ Shows "Connected" if account linked
   - ⚠️ Shows "Not Connected" if no account
   - 🔗 Provides "Connect Account" button
4. **Context Preservation:** After OAuth, user returns to same page/node

---

## Usage Examples

### Example 1: Using OAuth Service Directly

```typescript
import { getOAuthService } from '@/lib/oauth'

// Get OAuth service instance
const oauth = getOAuthService()

// Get available providers
const providers = await oauth.getProviders()

// Check if provider is supported
const isGoogleSupported = await oauth.isSupported('google')

// Get user's connections
const connections = await oauth.getConnections(userId)

// Initiate OAuth flow
const authUrl = await oauth.initiateAuth('google', userId, callbackUrl)
// Redirect user to authUrl

// Disconnect
await oauth.disconnect('google', userId)
```

### Example 2: Using React Hooks (Recommended)

```typescript
'use client'

import { useOAuth, useNodeOAuth } from '@/hooks/use-oauth'

function MyComponent() {
  // Global OAuth hook
  const {
    providers,        // All available providers
    connections,      // User's active connections
    loading,
    error,
    connectProvider,  // Connect new provider
    disconnectProvider,
    isConnected,      // Check if provider connected
    getConnection     // Get specific connection
  } = useOAuth()

  // Node-specific OAuth hook
  const {
    requiresOAuth,    // Does this node need OAuth?
    provider,         // Provider info
    connection,       // Active connection for this provider
    isConnected,      // Boolean
    loading
  } = useNodeOAuth('gmail')

  return (
    <div>
      {isConnected ? (
        <p>Connected to {provider?.providerName}</p>
      ) : (
        <button onClick={() => connectProvider('google')}>
          Connect Google
        </button>
      )}
    </div>
  )
}
```

### Example 3: Checking OAuth in Workflow Execution

```typescript
import { getOAuthService } from '@/lib/oauth'
import { nodeRequiresOAuth, getNodeOAuthProvider } from '@/lib/oauth/node-detection'

async function executeWorkflowNode(node: WorkflowNode, userId: string) {
  // Check if node requires OAuth
  if (await nodeRequiresOAuth(node.type)) {
    const providerInfo = await getNodeOAuthProvider(node.type)
    
    if (!providerInfo) {
      throw new Error(`OAuth provider not configured for ${node.type}`)
    }

    // Get user's connection
    const oauth = getOAuthService()
    const connections = await oauth.getConnections(userId)
    const connection = connections.find(c => c.provider === providerInfo.provider)

    if (!connection) {
      throw new Error(`Please connect your ${providerInfo.providerName} account`)
    }

    // Use connection.accessToken for API calls
    console.log('Using OAuth token:', connection.accessToken)
  }

  // Execute node...
}
```

---

## Swapping OAuth Providers

One of the key benefits: **swap providers with minimal code changes**.

### Example: Replace Nango with Supabase Auth

#### Step 1: Create Supabase Adapter

```typescript
// src/lib/oauth/providers/supabase-adapter.ts
import { createClient } from '@supabase/supabase-js'
import { IOAuthProvider, OAuthProviderInfo, OAuthConnection } from '../types'

export class SupabaseOAuthAdapter implements IOAuthProvider {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async getProviders(): Promise<OAuthProviderInfo[]> {
    // Implement: Fetch providers from Supabase
    // Supabase supports google, github, gitlab, etc.
    return [
      {
        id: 'google',
        provider: 'google',
        name: 'Google',
        // ...
      }
    ]
  }

  async initiateAuth(providerId: string, userId: string): Promise<string> {
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: providerId as any,
      options: {
        redirectTo: process.env.NEXT_PUBLIC_OAUTH_CALLBACK_URL
      }
    })
    
    if (error) throw new Error(error.message)
    return data.url
  }

  async getConnections(userId: string): Promise<OAuthConnection[]> {
    // Implement: Get user's linked accounts
    // Supabase stores this in auth.identities
  }

  async disconnect(providerId: string, userId: string): Promise<void> {
    // Implement: Unlink provider
  }

  async isSupported(providerId: string): Promise<boolean> {
    const supported = ['google', 'github', 'gitlab', 'bitbucket', 'discord']
    return supported.includes(providerId)
  }
}
```

#### Step 2: Update Factory

```typescript
// src/lib/oauth/index.ts
import { SupabaseOAuthAdapter } from './providers/supabase-adapter'

function createOAuthProvider(config: OAuthConfig): IOAuthProvider {
  const provider = config.provider || 'nango'

  switch (provider) {
    case 'nango':
      return createNangoAdapter(config)
    
    case 'supabase':  // ✅ Add this
      return new SupabaseOAuthAdapter()
    
    default:
      throw new Error(`Unknown OAuth provider: ${provider}`)
  }
}
```

#### Step 3: Update Environment Variable

```bash
# Change from nango to supabase
NEXT_PUBLIC_OAUTH_PROVIDER=supabase
```

**That's it!** No changes to components, hooks, or pages. All existing code works.

---

## Testing

### 1. Unit Tests

```typescript
// Example test
import { getOAuthService } from '@/lib/oauth'

describe('OAuth Service', () => {
  it('should return OAuth service instance', () => {
    const service = getOAuthService()
    expect(service).toBeDefined()
  })

  it('should detect OAuth nodes correctly', async () => {
    const requiresOAuth = await nodeRequiresOAuth('gmail')
    expect(requiresOAuth).toBe(true)
  })

  it('should map credential types to providers', async () => {
    const provider = await getNodeOAuthProvider('gmail')
    expect(provider?.provider).toBe('google')
  })
})
```

### 2. Integration Tests

**Test OAuth Flow:**

1. Visit `/settings/oauth`
2. Click "Connect Google"
3. Redirected to OAuth provider
4. Authorize application
5. Redirected back to `/oauth/callback?oauth_success=google`
6. See success message
7. Redirected back to `/settings/oauth`
8. See "Connected" badge on Google card

**Test Node Configuration:**

1. Open workflow builder
2. Add Gmail node
3. Open node configuration
4. See OAuth credential selector
5. If not connected: Click "Connect Google Account"
6. Complete OAuth flow
7. Return to node configuration
8. See "Connected" status

---

## Troubleshooting

### Common Issues

#### 1. "No OAuth providers available"

**Cause:** Backend not running or wrong URL

**Fix:**
```bash
# Check environment variable
echo $NEXT_PUBLIC_OAUTH_API_URL

# Should be: http://localhost:3001
# If Nango backend is on different port, update .env.local
```

#### 2. "OAuth callback failed"

**Cause:** Callback URL mismatch

**Fix:**
1. Check `NEXT_PUBLIC_OAUTH_CALLBACK_URL` in `.env.local`
2. Ensure it matches configured callback in Nango/provider dashboard
3. Should be: `http://localhost:3000/oauth/callback` (dev)

#### 3. "Provider not supported"

**Cause:** Provider not configured in backend

**Fix:**
- Add provider in Nango dashboard (or your OAuth backend)
- Restart backend after changes

#### 4. React Hook Errors

**Error:** "useOAuth must be used within OAuthProvider"

**Cause:** Missing provider wrapper

**Fix:** Ensure `OAuthProvider` is in your app layout (if using context pattern)

#### 5. TypeScript Errors

**Error:** Type errors with OAuth types

**Fix:**
```bash
# Regenerate types
npm run typecheck

# If needed, restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"
```

---

## Production Checklist

Before deploying to production:

- [ ] Update `NEXT_PUBLIC_OAUTH_CALLBACK_URL` to production URL
- [ ] Update `NEXT_PUBLIC_OAUTH_API_URL` to production backend
- [ ] Configure OAuth providers in production dashboard
- [ ] Test OAuth flow in production environment
- [ ] Verify callback URLs in all provider dashboards
- [ ] Set up monitoring for OAuth errors
- [ ] Document which providers are enabled
- [ ] Test token refresh (if applicable)
- [ ] Verify HTTPS is enforced
- [ ] Add rate limiting (if needed)

---

## API Reference

### Core Types

```typescript
interface IOAuthProvider {
  getProviders(): Promise<OAuthProviderInfo[]>
  initiateAuth(providerId: string, userId: string, callbackUrl?: string): Promise<string>
  getConnections(userId: string): Promise<OAuthConnection[]>
  disconnect(providerId: string, userId: string, connectionId?: string): Promise<void>
  isSupported(providerId: string): Promise<boolean>
}

interface OAuthProviderInfo {
  id: string
  provider: string
  name: string
  description: string
  icon?: string
  category?: 'productivity' | 'communication' | 'storage' | 'other'
  requiredScopes?: string[]
  credentialType?: string
}

interface OAuthConnection {
  id: string
  provider: string
  providerName: string
  userId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  username?: string
  email?: string
  isActive: boolean
  connectedAt: Date
}
```

### Hooks API

```typescript
// Global OAuth hook
const {
  providers: OAuthProviderInfo[]
  connections: OAuthConnection[]
  loading: boolean
  error: string | null
  connectProvider: (providerId: string) => Promise<void>
  disconnectProvider: (providerId: string) => Promise<void>
  refreshConnections: () => Promise<void>
  isConnected: (providerId: string) => boolean
  getConnection: (providerId: string) => OAuthConnection | undefined
} = useOAuth()

// Node-specific OAuth hook
const {
  requiresOAuth: boolean
  provider: OAuthProviderInfo | null
  connection: OAuthConnection | undefined
  isConnected: boolean
  loading: boolean
} = useNodeOAuth(nodeType: string)
```

---

## Additional Resources

- [OAuth 2.0 Specification](https://oauth.net/2/)
- [Nango Documentation](https://docs.nango.dev/)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Project Documentation: `docs/OAUTH_INTEGRATION_STATUS.md`](./OAUTH_INTEGRATION_STATUS.md)

---

**Status:** Complete ✅  
**Last Updated:** November 28, 2025  
**Maintainer:** LucidMerged Team
