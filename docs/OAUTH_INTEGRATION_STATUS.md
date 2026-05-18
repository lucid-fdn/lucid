# OAuth Integration Status

> Historical note
>
> This document reflects the earlier foundation-stage OAuth adapter work.
> For the current production tool-manifest and runtime contract, use:
>
> - `docs/platform/plugins/tool-manifests.md`
> - `packages/plugin-policy/README.md`
>
> Current-state differences:
>
> - OAuth/Nango integrations now flow through the shared manifest-preparation layer
> - `oauth_action_catalog.parameter_schema` is canonical for OAuth actions
> - `org_plugin_installations.manifest_snapshot` is treated as a derived cache
> - shared, dedicated, and BYO runtimes consume the same prepared manifest contract
> - OpenClaw and Hermes should adapt from the same canonical manifest layer

**Date:** November 28, 2025  
**Status:** Foundation Complete (50% Overall)  
**Architecture:** Vendor-Agnostic (Nango Adapter)

---

## ✅ Completed: Foundation Layer

### 1. OAuth Abstraction Layer
**File:** `src/lib/oauth/types.ts`

**Purpose:** Vendor-agnostic interface for OAuth providers

**Key Components:**
- `IOAuthProvider` interface - Abstract OAuth operations
- `OAuthProviderInfo` - Provider metadata
- `OAuthConnection` - Active connection data
- `OAuthError` - Standardized error handling
- Complete TypeScript types for all OAuth operations

**Benefits:**
- ✅ Zero vendor lock-in
- ✅ Swap Nango for Supabase Auth/Custom in minutes
- ✅ Type-safe throughout

### 2. Nango OAuth Adapter
**File:** `src/lib/oauth/providers/nango-adapter.ts`

**Purpose:** Nango-specific implementation (isolated)

**Features:**
- Implements `IOAuthProvider` interface
- ALL Nango code contained in this ONE file
- Maps Nango responses to standard format
- Handles authentication, connections, disconnection
- Automatic provider categorization

**Key Methods:**
```typescript
getProviders() // Fetch available OAuth providers
initiateAuth() // Start OAuth flow
getConnections() // Get user's connections
disconnect() // Revoke access
isSupported() // Check provider availability
```

**Backend Integration:**
- Calls Nango backend at `http://localhost:3001/api/oauth`
- Handles JWT authentication (Privy)
- Includes credentials in all requests

### 3. OAuth Service Factory
**File:** `src/lib/oauth/index.ts`

**Purpose:** Single entry point for OAuth operations

**Usage:**
```typescript
import { getOAuthService } from '@/lib/oauth'

const oauth = getOAuthService()
const providers = await oauth.getProviders()
```

**Features:**
- Singleton pattern (one instance)
- Factory method for provider selection
- Environment-based configuration
- Configuration helpers (`isOAuthConfigured()`, etc.)

**To Swap Providers:**
```typescript
// In createOAuthProvider(), change return:
case 'supabase':
  return createSupabaseAdapter(config) // Just implement this
```

### 4. Automatic Node Detection
**File:** `src/lib/oauth/node-detection.ts`

**Purpose:** Auto-detect OAuth nodes from n8n metadata

**Features:**
- Analyzes all 847 n8n nodes
- Detects OAuth credential types
- Maps to OAuth providers (google, slack, etc.)
- Handles multiple nodes per provider (Gmail, Sheets, Drive → google)
- Request-level caching with React cache()

**Key Functions:**
```typescript
getOAuthEnabledNodes()      // Get all OAuth nodes
nodeRequiresOAuth()          // Check if node needs OAuth
getNodeOAuthProvider()       // Get provider for specific node
getAllOAuthProviders()       // Get unique provider list
getOAuthStats()              // Debug/monitoring stats
```

**Provider Mapping:**
- Google ecosystem: All use 'google' provider
- 20+ providers pre-mapped
- Automatic heuristic for unknown types
- Easy to extend

### 5. React Hooks
**File:** `src/hooks/use-oauth.ts`

**Purpose:** React integration following project patterns

**Hooks:**

**`useOAuth()`** - Main OAuth management
```typescript
const {
  providers,        // Available OAuth providers
  connections,      // User's active connections
  loading,          // Loading state
  error,            // Error messages
  connectProvider,  // Initiate OAuth flow
  disconnectProvider, // Revoke access
  isConnected,      // Check if connected
  getConnection     // Get specific connection
} = useOAuth()
```

**`useNodeOAuth(nodeType)`** - Node-specific OAuth
```typescript
const {
  requiresOAuth,    // Does this node need OAuth?
  provider,         // OAuth provider info
  connection,       // Active connection
  isConnected,      // Boolean status
  loading           // Loading state
} = useNodeOAuth('gmail')
```

**Patterns Used:**
- ✅ `useMemo` for context values (prevent re-renders)
- ✅ `useCallback` for stable function references
- ✅ Proper dependency arrays (no infinite loops)
- ✅ Following project's React Context patterns

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│         Application Code (UI, Workflows, etc.)          │
│  • No knowledge of Nango                                │
│  • Uses IOAuthProvider interface only                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│            OAuth Service (Factory Pattern)               │
│  src/lib/oauth/index.ts                                 │
│  • getOAuthService() returns IOAuthProvider             │
│  • Environment-based provider selection                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│     Nango Adapter (ONE file knows about Nango)          │
│  src/lib/oauth/providers/nango-adapter.ts               │
│  • Implements IOAuthProvider                            │
│  • All Nango code isolated here                         │
│  • Easy to replace with Supabase/Custom                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│          Nango Backend (Port 3001)                      │
│  • Running separately (Express service)                 │
│  • Handles OAuth flows                                  │
│  • Manages tokens                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Environment Variables Required

Add to `.env.local`:

```bash
# OAuth Backend API
NEXT_PUBLIC_OAUTH_API_URL=http://localhost:3001

# OAuth Callback URL
NEXT_PUBLIC_OAUTH_CALLBACK_URL=http://localhost:3000/oauth/callback

# OAuth Provider (optional, defaults to 'nango')
NEXT_PUBLIC_OAUTH_PROVIDER=nango
```

---

## 🚧 TODO: UI Components (50% Remaining)

### High Priority

#### 1. OAuth Callback Page
**Location:** `src/app/oauth/callback/page.tsx`
**Status:** Not Started
**Purpose:** Handle OAuth redirect after authorization

**Requirements:**
- Parse URL params (success/error)
- Retrieve context from sessionStorage
- Display success/error message
- Redirect back to origin (workflow or management page)

#### 2. Per-Node Credential Selector
**Location:** `src/components/workflow/oauth/oauth-credential-selector.tsx`
**Status:** Not Started
**Purpose:** OAuth integration in node configuration panel

**Requirements:**
- Show existing connections for provider
- "+ Connect [Provider] Account" button
- Fallback for unsupported providers (manual input)
- Link to management page

**Integration Point:**
```typescript
// In node-config-panel.tsx, SetupStep:
import { OAuthCredentialSelector } from '@/components/workflow/oauth/oauth-credential-selector'

{oauthProvider && (
  <OAuthCredentialSelector
    nodeType={selectedNode.type}
    value={selectedCredentialId}
    onChange={setSelectedCredentialId}
  />
)}
```

#### 3. Global Management Page
**Location:** `src/app/(app)/settings/oauth/page.tsx`
**Status:** Not Started
**Purpose:** View/manage all OAuth connections

**Requirements:**
- List all available providers
- Show connected accounts
- Disconnect/reconnect functionality
- Usage statistics per connection
- Search/filter providers

**Reference:** Use documentation from `docs/FRONTEND-OAUTH-INTEGRATION-GUIDE.md`

### Medium Priority

#### 4. Provider Cards Component
**Location:** `src/components/oauth/provider-card.tsx`
**Status:** Not Started
**Purpose:** Display individual OAuth provider

**Requirements:**
- Provider icon, name, description
- Connection status (connected/disconnected)
- Connect/disconnect buttons
- Required scopes display

#### 5. Integration with Node Config Panel
**Location:** `src/components/workflow/config/node-config-panel.tsx`
**Status:** Planned
**Changes:**
- Import `useNodeOAuth(selectedNode.type)`
- Replace Account placeholder with OAuth selector
- Handle credential selection
- Store credential ID with node

### Low Priority

#### 6. OAuth Statistics Dashboard
**Status:** Nice to Have
**Purpose:** Analytics for OAuth usage

**Features:**
- Most-used providers
- Connection success rates
- OAuth trends over time

---

## 🎯 Integration Strategy

### Phase 1: Testing Foundation (Current)
```bash
# Test OAuth service
import { getOAuthService } from '@/lib/oauth'
const oauth = getOAuthService()
console.log('Providers:', await oauth.getProviders())
```

### Phase 2: UI Components (Next)
1. Create OAuth callback page
2. Build credential selector component
3. Create provider cards
4. Build management page

### Phase 3: Workflow Integration
1. Integrate selector into node config panel
2. Test OAuth flow in workflow builder
3. Handle credential storage/retrieval
4. Test with multiple providers

### Phase 4: Production
1. Environment variables setup
2. Backend deployment
3. Provider configuration in Nango
4. Security review
5. User documentation

---

## 📋 Code Quality Checklist

### Architecture ✅
- ✅ Vendor-agnostic (zero Nango lock-in)
- ✅ Interface-based design
- ✅ Factory pattern for providers
- ✅ Single responsibility principle
- ✅ Proper error handling

### Integration ✅
- ✅ Uses existing patterns (service layer)
- ✅ Follows React hook patterns
- ✅ Request-level caching (React cache)
- ✅ No cross-dependencies
- ✅ Isolated modules

### TypeScript ✅
- ✅ Full type coverage
- ✅ No `any` types (except necessary)
- ✅ Proper TypeScript errors fixed
- ✅ Interface-first design
- ✅ Generic types where appropriate

### Performance ✅
- ✅ Request-level deduplication
- ✅ Singleton pattern (service)
- ✅ Memoized hooks
- ✅ Lazy loading (dynamic imports)
- ✅ Minimal re-renders

### Documentation ✅
- ✅ JSDoc comments
- ✅ Usage examples
- ✅ Architecture diagrams
- ✅ Integration guides
- ✅ This status document

---

## 🔄 Swapping OAuth Providers

To replace Nango with another provider (e.g., Supabase Auth):

### Step 1: Create New Adapter
```typescript
// src/lib/oauth/providers/supabase-adapter.ts
export class SupabaseOAuthAdapter implements IOAuthProvider {
  // Implement all IOAuthProvider methods
  // using Supabase Auth SDK
}
```

### Step 2: Update Factory
```typescript
// src/lib/oauth/index.ts
case 'supabase':
  return createSupabaseAdapter(config)
```

### Step 3: Change Environment Variable
```bash
NEXT_PUBLIC_OAUTH_PROVIDER=supabase
```

**That's it!** No changes to any consuming code.

---

## 🐛 Known Limitations

1. **Callback Handling:** Currently expects backend to handle OAuth callback exchange
2. **Token Refresh:** Relies on backend to handle token refresh automatically
3. **Provider Configuration:** Providers must be configured in Nango dashboard first
4. **Multi-Account:** One connection per provider per user (can be extended)

---

## 📚 Key Files Reference

| File | Purpose | Lines | Vendor-Specific? |
|------|---------|-------|------------------|
| `src/lib/oauth/types.ts` | Type definitions | 150 | ❌ No |
| `src/lib/oauth/index.ts` | Service factory | 100 | ❌ No |
| `src/lib/oauth/providers/nango-adapter.ts` | Nango adapter | 350 | ✅ **YES** |
| `src/lib/oauth/node-detection.ts` | Auto-detection | 400 | ❌ No |
| `src/hooks/use-oauth.ts` | React hooks | 300 | ❌ No |

**Total Vendor-Specific Code:** ~350 lines (isolated in ONE file)  
**Total Vendor-Agnostic Code:** ~950 lines

**Vendor Lock-in Risk:** ✅ Minimal (only 1 file to replace)

---

## 🎯 Success Metrics

- ✅ **Architecture:** Vendor-agnostic design achieved
- ✅ **Code Organization:** Isolated, modular, clean
- ✅ **Type Safety:** 100% TypeScript coverage
- ✅ **Performance:** Request-level caching implemented
- ✅ **Patterns:** Following project conventions
- ⏳ **UI:** 0% (not started yet)
- ⏳ **Testing:** 0% (not started yet)

**Overall Progress:** 50% Complete

---

## 🚀 Next Steps

1. **Immediate:** Create OAuth callback page
2. **Next:** Build OAuth credential selector component
3. **Then:** Integrate into node config panel
4. **Finally:** Global management page + testing

**Estimated Time to 100%:**
- UI Components: 2-3 days
- Integration: 1-2 days
- Testing: 1 day
- Documentation: 1 day

**Total:** 5-7 days to production-ready

---

## 💡 Implementation Notes

### Why This Architecture?

1. **Vendor Independence:** Learned from projects that got locked into providers
2. **Easy Testing:** Can mock IOAuthProvider for tests
3. **Gradual Migration:** Can run multiple providers side-by-side
4. **Future-Proof:** Adding new providers requires minimal code
5. **Industry Standard:** Similar to how Stripe, Auth0, etc. do adapters

### Design Decisions

- **Factory Pattern:** Industry standard for provider selection
- **Singleton Service:** Prevents multiple instances, ensures consistency
- **Interface First:** Contract-based design, implementation flexible
- **No Global State:** React hooks manage local state properly
- **Automatic Detection:** Less manual maintenance, scales with n8n updates

---

## 📞 Support

For questions about this OAuth system:

1. Check this document first
2. Review code comments in source files
3. Reference frontend documentation in `docs/FRONTEND-OAUTH-INTEGRATION-GUIDE.md`
4. Check memory bank: `memory-bank/activeContext.md`

---

**Status:** Foundation Complete ✅  
**Ready For:** UI component development  
**Blocked By:** None  
**Risk Level:** Low (solid foundation, vendor-agnostic)
