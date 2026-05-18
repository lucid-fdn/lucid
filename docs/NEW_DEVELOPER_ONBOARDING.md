# LucidMerged - New Developer Onboarding Guide

**Last Updated:** January 30, 2026  
**Version:** 1.0

Welcome to LucidMerged! This document will get you up to speed quickly on the project architecture, what's been completed, what's in progress, and what needs to be built.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Architecture Overview](#architecture-overview)
5. [Key Patterns to Follow](#key-patterns-to-follow)
6. [What's Complete (Production Ready)](#whats-complete-production-ready)
7. [What's In Progress](#whats-in-progress)
8. [What Needs to Be Built](#what-needs-to-be-built)
9. [Current Priority: AI Platform MVP](#current-priority-ai-platform-mvp)
10. [Nango OAuth Integration (Detailed)](#nango-oauth-integration-detailed)
11. [Useful Resources](#useful-resources)

---

## Project Overview

**LucidMerged** is an enterprise-grade workflow automation platform that combines:

| Feature | Description |
|---------|-------------|
| **n8n Integration** | 847+ workflow automation nodes |
| **AI-Powered UX** | Apple-inspired 3-mode workflow builder (Prompt/Story/Structure) |
| **Multi-Tenancy** | Organization → Project → Environment hierarchy |
| **Marketplace** | Share and monetize workflow templates (expanding to "Internet of AI") |
| **Subscription System** | Tiered plans with usage tracking (Stripe + Crypto) |

### Key Value Props

- **Prompt Mode**: Describe workflow in plain English → AI generates it
- **Story Mode**: Narrative view ("When X happens, If Y is true, Do Z")
- **Structure Mode**: Visual graph editor for power users
- **847 Nodes**: Full n8n node library without maintaining infrastructure

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.4.4 | App Router, Server Components |
| React | 19.0.0 | UI framework |
| TypeScript | 5+ | Type safety (strict mode) |
| Tailwind CSS | 4.1.11 | Styling |
| shadcn/ui | Latest | Component library |
| Framer Motion | 12.x | Animations |

### Backend
| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL + RLS + Storage + Real-time |
| Privy | Authentication (email, social, Web3 wallets) |
| Stripe | Payment processing |
| Coinbase Commerce | Crypto payments |
| n8n API | Workflow node library |
| Nango | OAuth token management |
| Lucid-L2 | AI model routing (100+ models) |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Vercel | Deployment & Edge Network |
| Upstash Redis | Caching & rate limiting |
| pgvector | Vector embeddings for RAG |

---

## Getting Started

### Prerequisites
- Node.js 18+ (LTS)
- npm 9+ or yarn 1.22+
- Git 2.x
- VS Code with extensions (ESLint, Prettier, Tailwind IntelliSense)

### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/daishizenSensei/LucidMerged.git
cd LucidMerged

# 2. Install dependencies
npm install

# 3. Copy environment file (get values from team lead)
cp .env.example .env.local

# 4. Run development server
npm run dev
# → http://localhost:3000

# 5. Type checking
npm run typecheck

# 6. Linting
npm run lint
```

### Validation Baseline

Use this as the default local validation stack before widening into deeper suites:

```bash
npm run typecheck
npm run test:app-smoke
SMOKE_BASE_URL=http://localhost:3001 npm run test:app-smoke
```

For browser smoke, the current reliable local harness is a local-auth app instance on `http://localhost:3001`:

```bash
NEXT_PUBLIC_AUTH_PROVIDER=local AUTH_PROVIDER=local npm run dev -- --port 3001
npm run test:e2e:smoke
```

When your change touches orchestration, mission control, or runtime-tier behavior, also run:

```bash
npx vitest run --config ./vitest.config.mts tests/integration/agent-panels-simulation.test.ts src/lib/mission-control/__tests__/canvas-topology-simulation.test.ts src/lib/mission-control/__tests__/runtime-tier-e2e.test.ts
```

### Key Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Privy (Auth)
NEXT_PUBLIC_PRIVY_APP_ID=xxx
PRIVY_APP_SECRET=xxx

# Nango (OAuth)
NANGO_SECRET_KEY=xxx
NANGO_PUBLIC_KEY=xxx

# Lucid-L2 (AI)
LUCID_API_BASE_URL=https://api.lucid.foundation/v1
LUCID_API_KEY=xxx

# Feature Flags
NEXT_PUBLIC_WORKFLOWS_ENABLED=true
NEXT_PUBLIC_NODE_LIBRARY_ENABLED=true
```

---

## Architecture Overview

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/             # Main app routes (workspace, settings, etc.)
│   ├── (workflow)/        # Workflow builder routes
│   ├── (marketing)/       # Public pages
│   └── api/               # API routes
│
├── components/            # React components
│   ├── ui/               # shadcn/ui primitives
│   ├── workflow/         # Workflow builder
│   ├── ai/               # AI chat, Lucid Flows
│   ├── oauth/            # OAuth management
│   └── navigation/       # Sidebar, navbar
│
├── lib/                   # Business logic & utilities
│   ├── db/               # ⭐ ALL database operations
│   ├── auth/             # Authentication
│   ├── oauth/            # Nango integration
│   ├── ai/               # AI providers, models
│   ├── marketplace/      # Marketplace service
│   └── errors/           # ErrorService
│
├── hooks/                 # Custom React hooks
├── contexts/              # React contexts
├── types/                 # TypeScript definitions
└── styles/                # Global styles
```

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Vercel Edge Network                     │
│     [Middleware] → [Server Components] → [API Routes]   │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Supabase   │   │   Lucid-L2   │   │    Nango     │
│  PostgreSQL  │   │   AI API     │   │    OAuth     │
│     RLS      │   │  100+ models │   │   Tokens     │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## Key Patterns to Follow

### ⭐ CRITICAL: Service Layer Pattern

**ALL database operations MUST go through `src/lib/db/index.ts`**

```typescript
// ✅ CORRECT: Use service layer
import { getProfile, updateProfile } from '@/lib/db'

const profile = await getProfile(userId)
await updateProfile(userId, { name: 'New Name' })

// ❌ WRONG: Direct Supabase query in components
const { data } = await supabase.from('profiles').select('*')
```

**Why:** Single source of truth, request-level caching, consistent error handling.

### ⭐ CRITICAL: Centralized Cache System

**ALL caching MUST use CacheService - never use raw Redis**

```typescript
// ✅ CORRECT: Use CacheService
import { nodeCache } from '@/lib/cache/service'

const cached = await nodeCache.get<NodeData>('nodes:all')
if (cached) return cached

const fresh = await fetchNodes()
await nodeCache.set('nodes:all', fresh, { ttl: 3600 })
```

**Specialized Cache Instances:**
- `authCache` - 1 hour TTL (auth tokens, session data)
- `imageCache` - 24 hours TTL (generated images)
- `rateLimitCache` - 1 minute TTL (API rate limiting)
- `chatCache` - 7 days TTL (chat history)
- `nodeCache` - 1 hour TTL (n8n node library)

**Why:** Centralized config, automatic TTL, monitoring, compression, feature flags.

### ⭐ CRITICAL: Service Layer for Business Logic

**Complex operations MUST use service classes (Netflix/Airbnb/Uber pattern)**

```typescript
// ✅ CORRECT: Use MarketplaceService
import { marketplaceService } from '@/lib/marketplace/marketplace-service'

const { assets } = await marketplaceService.getAssets({ kind: 'MODEL' })
const model = await marketplaceService.getModelById('llama-3')

// ❌ WRONG: Inline API logic in components
const response = await fetch('/api/models')
// ... 80 lines of filtering, transforming, error handling
```

**Why:** Reusable, testable, maintainable, DRY principle, encapsulated complexity.

### ⭐ CRITICAL: Error Handling with ErrorService

**ALL errors MUST use ErrorService - no console.error in production**

```typescript
import { ErrorService } from '@/lib/errors/error-service'

try {
  await someOperation()
} catch (error) {
  ErrorService.captureException(error, {
    severity: 'error',
    context: { operation: 'someOperation', userId },
    tags: { layer: 'api', route: 'my-route' }
  })
  throw error
}
```

### Server vs Client Components

```typescript
// Server Component (DEFAULT - no directive needed)
export default async function Page() {
  const data = await getData() // Direct DB access
  return <Component data={data} />
}

// Client Component (only when needed)
'use client'
export function Interactive() {
  const [state, setState] = useState()
  return <button onClick={() => setState(...)}>Click</button>
}
```

**Use 'use client' ONLY when:**
- Need interactivity (onClick, onChange)
- Need browser APIs (localStorage, window)
- Need React hooks (useState, useEffect)

### Authentication Pattern

```typescript
// In Server Components or Server Actions
import { requireUserId } from '@/lib/auth/session'

export default async function ProtectedPage() {
  const userId = await requireUserId() // Throws if not authenticated
  const profile = await getProfile(userId)
  // ...
}
```

### Form Handling Pattern

```typescript
// 1. Schema (src/lib/forms/schemas.ts)
export const profileSchema = z.object({
  name: z.string().min(1).max(100),
})

// 2. Server Action (src/lib/forms/actions.ts)
export async function updateProfileAction(data: unknown) {
  const userId = await requireUserId()
  const validated = profileSchema.parse(data)
  await updateProfile(userId, validated)
  revalidatePath('/settings')
  return { success: true }
}

// 3. Component
'use client'
const form = useForm({ resolver: zodResolver(profileSchema) })
const onSubmit = (data) => updateProfileAction(data)
```

### Search Orchestrator Pattern

**Multi-source search MUST use SearchOrchestrator**

```typescript
// ✅ CORRECT: Use orchestrator for unified search
import { SearchOrchestrator } from '@/lib/search/orchestrator'
import { AIAggregatorAdapter } from '@/lib/search/adapters/ai-aggregator'
import { LucidL2Adapter } from '@/lib/search/adapters/lucid-l2-adapter'

const orchestrator = new SearchOrchestrator([
  new AIAggregatorAdapter(),
  new LucidL2Adapter()
])

const results = await orchestrator.search({
  q: 'llama',
  types: ['MODEL'],
  limit: 24
})
```

**How it works:**
- **Parallel execution:** All adapters run simultaneously (faster!)
- **Deduplication:** Same ID from multiple sources → highest priority wins
- **3-tier sorting:** Source priority → relevance score → alphabetical
- **Graceful degradation:** One adapter fails → others continue

**Why:** Extensible (easy to add new sources), fast (parallel), reliable (fails gracefully).

---

## What's Complete (Production Ready)

### ✅ Core Platform (95%)

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Privy) | ✅ 100% | Email, social, Web3 wallets |
| User Profiles | ✅ 100% | Full CRUD + preferences |
| Organizations | ✅ 100% | Multi-tenancy working |
| Projects | ✅ 100% | Hierarchy complete |
| Environments | ✅ 100% | Dev/staging/prod |
| Team Invites | ✅ 100% | Email-based system |
| RBAC | ✅ 100% | 6 roles (Owner → Viewer) |
| Subscriptions | ✅ 100% | Stripe + Crypto |
| Usage Tracking | ✅ 100% | Per-org metrics |
| Notifications | ✅ 100% | Bell + email preferences |

### ✅ Workflow Builder (92%)

| Feature | Status | Notes |
|---------|--------|-------|
| Prompt Mode | ✅ 100% | AI workflow generation |
| Story Mode | ⚠️ 90% | Node insertion logic TODO |
| Structure Mode | ✅ 100% | Visual editor complete |
| Node Library | ✅ 100% | 847 n8n nodes |
| Node Configuration | ✅ 100% | Multi-step setup |
| Webhooks | ✅ 100% | Complete with logs |
| Schedules | ✅ 100% | Cron builder |
| Variables | ✅ 100% | 4 types |
| Credentials | ✅ 100% | AES-256-GCM |

### ✅ UI/UX System

| Feature | Status | Notes |
|---------|--------|-------|
| shadcn/ui | ✅ 100% | All components |
| Animation System | ✅ 100% | 4-library hybrid |
| Dark Mode | ✅ 100% | First-class support |
| Responsive | ✅ 100% | Mobile-first |
| Accessibility | ✅ 100% | WCAG 2.1 AA |

---

## What's In Progress

### 🔄 AI Platform MVP (60% complete)

**Current Focus:** Unified Lucid-L2 architecture for AI features

**Completed:**
- ✅ Provider configuration (single Lucid-L2 endpoint)
- ✅ Model registry (dynamic from API, 5-min cache)
- ✅ Chat API (streaming ready)
- ✅ Database schema (pgvector, conversations, messages)

**Next:**
- [ ] Chat UI with useChat() hook
- [ ] Model selector dropdown
- [ ] Conversation persistence

See: [Current Priority: AI Platform MVP](#current-priority-ai-platform-mvp)

### 🔄 Marketplace (40% complete)

| Feature | Status |
|---------|--------|
| Browse Assets | ✅ 100% |
| Asset Details | ✅ 100% |
| Ratings/Reviews | ✅ 100% |
| Bookmarks | ✅ 100% |
| Publishing | ⚠️ 40% |
| Payments | ⚠️ 50% |

### 🔄 OAuth/Nango Integration (70% complete)

**Critical for workflow nodes that need authenticated API access.**

See: [Nango OAuth Integration (Detailed)](#nango-oauth-integration-detailed)

---

## What Needs to Be Built

### High Priority (Next 2 Weeks)

| Feature | Description | Complexity |
|---------|-------------|------------|
| Chat UI | AI chat interface with streaming | Medium |
| Story Mode Logic | Node insertion in story view | Medium |
| Nango Connect UI | Official Nango flow (not proxy) | Medium |
| Error Boundaries | app/error.tsx for all routes | Low |

### Medium Priority (Next Month)

| Feature | Description | Complexity |
|---------|-------------|------------|
| RAG System | Document upload + vector search | High |
| Real-time Collab | Multi-user editing | Very High |
| Advanced Analytics | Usage trends dashboard | Medium |
| Workflow Execution | Run nodes with real APIs | High |

### Low Priority (Next Quarter)

| Feature | Description |
|---------|-------------|
| Mobile PWA | Installable, offline-capable |
| Custom Node Builder | Visual node definition |
| Version Control | Git-like workflow versioning |
| Enterprise SSO | SAML/OIDC integration |

---

## Current Priority: AI Platform MVP

### Architecture

```
LucidMerged (Frontend)
    │
    │  createOpenAI({ baseURL: 'https://api.lucid.foundation/v1' })
    │
    └──► Lucid-L2 Backend (100+ models, routing, fallback)
```

**Why single endpoint?**
- Lucid-L2 already has LLM routing infrastructure
- 100+ models via llm-proxy integration
- OpenAI-compatible API = Vercel AI SDK works perfectly
- Centralized billing and usage tracking

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/providers.ts` | Single Lucid-L2 provider config |
| `src/lib/ai/models.ts` | Dynamic model registry (5-min cache) |
| `src/lib/ai/types.ts` | TypeScript definitions |
| `src/lib/ai/service.ts` | AI service functions |
| `src/app/api/ai/chat/route.ts` | Chat API (streaming) |
| `src/app/api/ai/models/route.ts` | Models API (proxy to Lucid-L2) |
| `migrations/043_ai_platform.sql` | Database schema |

### Usage Example

```typescript
import { getLucidModel } from '@/lib/ai/providers'
import { streamText } from 'ai'

// Use ANY model through single endpoint
const model = getLucidModel('meta-llama/Llama-3.3-70B-Instruct-Turbo')
const result = await streamText({ model, messages })
```

### What's Next

1. **Chat Page** (`src/app/(app)/[workspace-slug]/chat/page.tsx`)
   - useChat() hook from Vercel AI SDK
   - Model selector from /api/ai/models
   - Message list with streaming support

2. **Conversation Sidebar**
   - History of conversations
   - Create new conversation
   - Rename/delete conversations

3. **RAG Integration** (Phase 3)
   - Document upload UI
   - Chunking service
   - Vector similarity search

---

## Nango OAuth Integration (Deep Dive)

### What is Nango?

**Nango** manages OAuth tokens for 200+ providers. It handles:
- Token refresh automatically
- Secure token storage
- OAuth flow UI (Connect popup)
- API proxy with built-in auth

### Architecture Layers (Complete Stack)

#### 1. Adapter Layer (`src/lib/oauth/providers/nango-adapter.ts`)

**Purpose:** Vendor-agnostic abstraction - all Nango code isolated here

```typescript
// Implements IOAuthProvider interface
export class NangoOAuthAdapter implements IOAuthProvider {
  getProviders(): Promise<OAuthProviderInfo[]>
  initiateAuth(provider, userId): Promise<OAuthInitResult>
  getConnections(userId): Promise<OAuthConnection[]>
  disconnect(provider, userId, connectionId?): Promise<void>
  // ...
}
```

**Key Features:**
- ✅ **Vendor isolation:** Swap Nango for another provider by changing factory
- ✅ **Type safety:** Full TypeScript with interfaces
- ✅ **Error handling:** Custom OAuthError with codes
- ✅ **Logging:** Detailed console logs with timing

#### 2. Server Layer (`src/lib/oauth/server.ts`)

**Purpose:** Server-side data fetching with React cache()

```typescript
// Cached per request - no duplicate fetches
export const getOAuthProviders = cache(async () => {
  const response = await fetch(`${NANGO_API_URL}/api/oauth/providers`)
  return response.json()
})

export const getOAuthConnections = cache(async (privyUserId?: string) => {
  const response = await fetch(`${baseUrl}/api/oauth/connections`, {
    headers: { 'Cookie': `privy-token=${privyToken}` }
  })
  return response.json()
})

// Parallel fetching for performance
export async function getOAuthData(privyUserId?: string) {
  const [providers, connections] = await Promise.all([
    getOAuthProviders(),
    getOAuthConnections(privyUserId),
  ])
  return { providers, connections }
}
```

**Key Features:**
- ✅ **React cache():** Request-level deduplication
- ✅ **Parallel fetching:** Promise.all for speed
- ✅ **Server-only:** 'server-only' import guard
- ✅ **Used in root layout:** Server-side rendering

#### 3. API Routes Layer (`src/app/api/oauth/...`)

**Complete API Surface:**

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/oauth/providers` | GET | List available providers | No |
| `/api/oauth/connections` | GET | User's connections | Yes (Privy JWT) |
| `/api/oauth/[provider]/initiate` | POST | Start OAuth flow | Yes |
| `/api/oauth/[provider]/sync` | POST | **CRITICAL:** Sync to DB | Yes |
| `/api/oauth/[provider]` | DELETE | Disconnect provider | Yes |
| `/api/oauth/session` | POST | Create session token | Yes |
| `/api/oauth/webhooks` | POST | Nango webhooks | No (webhook secret) |
| `/api/oauth/[provider]/resources/[resource]` | GET | Dynamic options (TODO) | Yes |

**Key Implementation Details:**

**Connections Route** (`/api/oauth/connections/route.ts`):
```typescript
export async function GET(request: NextRequest) {
  const externalId = await requireExternalId()
  const privyToken = cookies().get('privy-token')?.value
  
  // Forward to Nango backend
  const response = await fetch(`${NANGO_API_URL}/api/oauth/connections`, {
    headers: { 'Authorization': `Bearer ${privyToken}` }
  })
  
  // NORMALIZE: snake_case → camelCase
  const normalized = rawData.connections.map(conn => ({
    connectionId: conn.nango_connection_id, // CRITICAL
    username: conn.provider_username,
    displayName: conn.provider_display_name,
    avatarUrl: conn.provider_avatar_url,
    // ...
  }))
  
  return NextResponse.json({ connections: normalized })
}
```

**Sync Route** (`/api/oauth/[provider]/sync/route.ts`):
```typescript
export async function POST(request: NextRequest, { params }) {
  const { provider } = await params
  const { connectionId } = await request.json() // CRITICAL
  
  // Forward to backend WITH connectionId
  const response = await fetch(`${NANGO_API_URL}/api/oauth/${provider}/sync`, {
    method: 'POST',
    body: JSON.stringify({ connectionId }), // Required!
  })
  
  const data = await response.json()
  // Returns: { success, provider, privyUserId, connectionId, profile }
  
  return NextResponse.json(data)
}
```

#### 4. Context Layer (`src/contexts/oauth-context.tsx`)

**Purpose:** Provide server-fetched data to client (eliminate duplicate fetches)

```typescript
export function OAuthProvider({ children, initialOAuth }) {
  // Initialize with server data
  const [providers, setProviders] = useState(initialOAuth?.providers || [])
  const [connections, setConnections] = useState(initialOAuth?.connections || [])
  
  // INDUSTRY STANDARD: Eagerly initialize service at root
  useEffect(() => {
    const oauth = getOAuthService()
    // Service ready when modal opens - no initialization delay
  }, [])
  
  return <OAuthContext.Provider value={...}>{children}</OAuthContext.Provider>
}
```

**Key Features:**
- ✅ **Server data:** Initialized from root layout
- ✅ **Eager initialization:** OAuth service pre-warmed
- ✅ **Memoized value:** Prevent unnecessary re-renders
- ✅ **hasInitialData flag:** Skips client-side fetch

#### 5. Hook Layer (`src/hooks/use-oauth.ts`)

**Purpose:** Client-side OAuth operations

```typescript
export function useOAuth() {
  const context = useOAuthContext() // Optional
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set())
  
  // Use refs to avoid infinite loops
  const setContextConnectionsRef = useRef(context?.setConnections)
  setContextConnectionsRef.current = context?.setConnections
  
  const connectProvider = useCallback(async (providerId: string) => {
    setLoadingProviders(prev => new Set(prev).add(providerId))
    
    const result = await oauth.initiateAuth(providerId, user.id)
    // Returns: { authUrl, connectionId, sessionToken, ... }
    
    return { authUrl: result.authUrl, connectionId: result.connectionId }
  }, [user?.id, oauth])
  
  const syncConnection = useCallback(async (providerId: string, connectionId: string) => {
    if (!connectionId) throw new Error('connectionId required!')
    
    const response = await fetch(`/api/oauth/${providerId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ connectionId }) // CRITICAL
    })
    
    await loadConnections() // Refresh UI
  }, [loadConnections])
  
  return useMemo(() => ({
    providers, connections, loading, loadingProviders,
    connectProvider, disconnectProvider, syncConnection,
    isConnected, isProviderLoading
  }), [...])
}
```

**Key Features:**
- ✅ **Per-provider loading:** `Set<string>` tracks each button
- ✅ **Ref pattern:** Avoids infinite loops with context
- ✅ **Skip server data fetch:** Uses context if available
- ✅ **Memoized return:** Prevents re-renders

### Current Implementation Status

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Architecture** | ✅ 100% | 5-layer stack complete |
| **Server-side rendering** | ✅ 100% | Root layout → Context |
| **Connection flow** | ✅ 100% | initiate → redirect → sync |
| **Profile data** | ✅ 100% | avatar_url, display_name, username |
| **Multi-account** | ✅ 100% | connectionId parameter |
| **Per-provider loading** | ✅ 100% | Set<string> state |
| **Eager initialization** | ✅ 100% | Service pre-warmed at root |
| **Error handling** | ✅ 100% | ErrorService integration |
| **Nango Connect UI** | ❌ TODO | Need `@nangohq/frontend` |
| **Webhook handler** | ⚠️ 50% | Route exists, not configured |
| **Dynamic options** | ❌ TODO | Fetch lists, bases, channels |
| **Workflow execution** | ❌ TODO | Nango Proxy for API calls |

### Critical Flow (Current Working Implementation)

```
1. User clicks "Connect Google"
   └─ useOAuth.connectProvider('google')

2. Frontend → POST /api/oauth/google/initiate
   └─ Body: { userId, redirectUri, scopes }

3. API Route → Nango backend
   └─ Returns: { authUrl, connectionId }

4. Frontend redirects to authUrl
   └─ User completes OAuth in Google

5. Google redirects back to callback URL
   └─ Nango handles callback directly

6. Frontend calls syncConnection('google', connectionId)
   └─ POST /api/oauth/google/sync
   └─ Body: { connectionId } // CRITICAL

7. Sync Route → Nango backend
   └─ Backend: Fetches connection from Nango
   └─ Backend: Fetches profile (avatar, username)
   └─ Backend: Inserts into user_oauth_connections
   └─ Returns: { success, profile }

8. Hook refreshes connections
   └─ UI updates with new connection
```

### Key Implementation Files

| File | Lines | Purpose | Complexity |
|------|-------|---------|------------|
| `src/lib/oauth/providers/nango-adapter.ts` | 450 | Nango SDK wrapper | High |
| `src/lib/oauth/server.ts` | 120 | Server data fetching | Medium |
| `src/hooks/use-oauth.ts` | 550 | Client-side hook | High |
| `src/contexts/oauth-context.tsx` | 80 | Context provider | Low |
| `src/app/api/oauth/connections/route.ts` | 90 | Get connections | Medium |
| `src/app/api/oauth/[provider]/sync/route.ts` | 100 | Sync to DB | Medium |
| `src/app/api/oauth/[provider]/route.ts` | 60 | Disconnect | Low |

### Data Flow: Server → Client (Zero Duplicate Fetches)

```
┌─────────────────────────────────────────────────────────────┐
│ Root Layout (Server Component)                              │
│                                                              │
│ const privyUser = await getPrivyUser()                      │
│ const { providers, connections } = await getOAuthData(DID)  │
│   ↓                                                          │
│   ├─ getOAuthProviders() [React cache]                      │
│   └─ getOAuthConnections(DID) [React cache]                 │
│                                                              │
│ return <OAuthProvider initialOAuth={{ providers, ...}}>     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ OAuthContext (Client)                                        │
│                                                              │
│ useState(initialOAuth.providers) ← Server data!             │
│ useState(initialOAuth.connections) ← Server data!           │
│                                                              │
│ useEffect(() => {                                            │
│   getOAuthService() // Pre-warm service                     │
│ }, [])                                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ useOAuth Hook                                                │
│                                                              │
│ const context = useOAuthContext()                           │
│                                                              │
│ useEffect(() => {                                            │
│   if (context.hasInitialData) {                             │
│     SKIP CLIENT FETCH! ← Use server data                    │
│   } else {                                                   │
│     loadProviders() // Fallback                             │
│   }                                                          │
│ }, [])                                                       │
│                                                              │
│ return { providers: context.providers, ... }                │
└─────────────────────────────────────────────────────────────┘
```

**Result:** Modal opens instantly with data - zero loading skeletons!

### Critical Implementation Details

#### 1. connectionId is REQUIRED

```typescript
// ❌ WRONG: Missing connectionId
await syncConnection('google') // Backend won't know which connection

// ✅ CORRECT: Pass connectionId from initiate
const { connectionId } = await connectProvider('google')
await syncConnection('google', connectionId) // Backend knows which connection
```

#### 2. Profile Data Storage

```sql
-- user_oauth_connections table
ALTER TABLE user_oauth_connections
ADD COLUMN nango_connection_id TEXT,  -- CRITICAL for API calls
ADD COLUMN avatar_url TEXT,            -- Profile picture
ADD COLUMN display_name TEXT,          -- Full name
ADD COLUMN provider_account_name TEXT, -- Username (@handle)
ADD COLUMN provider_account_email TEXT; -- Email
```

#### 3. Per-Provider Loading States

```typescript
// ❌ WRONG: Global loading (all buttons freeze)
const [loading, setLoading] = useState(false)

// ✅ CORRECT: Per-provider loading (only clicked button)
const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set())

setLoadingProviders(prev => new Set(prev).add('google'))
// Only Google button shows loading, Twitter/Slack still clickable
```

#### 4. Infinite Loop Prevention

```typescript
// ❌ WRONG: Causes infinite loop
const loadConnections = useCallback(() => {
  context.setConnections(data) // Triggers re-render
}, [context]) // Context changes → re-render → loop!

// ✅ CORRECT: Use ref to avoid loop
const setContextConnectionsRef = useRef(context?.setConnections)
setContextConnectionsRef.current = context?.setConnections

const loadConnections = useCallback(() => {
  setContextConnectionsRef.current?.(data) // No re-render trigger
}, []) // Stable dependency array
```

### What's Already Working (Production-Ready)

✅ **Complete 5-layer architecture**
✅ **Server-side rendering** (root layout → context → hook)
✅ **Zero duplicate fetches** (initialOAuth pattern)
✅ **Eager service initialization** (modal opens instantly)
✅ **Per-provider loading states** (UX improvement)
✅ **Profile data fetching** (avatar, username, email)
✅ **Multi-account support** (connectionId parameter)
✅ **Graceful error handling** (ErrorService integration)
✅ **Type-safe** (Full TypeScript with interfaces)
✅ **Vendor-agnostic** (Easy to swap Nango)

### What's TODO (For Official Nango Flow)

❌ **Nango Connect UI** (`@nangohq/frontend` SDK)
❌ **Webhook handler** (configured in Nango dashboard)
❌ **Dynamic options API** (fetch user's lists, bases, etc.)
❌ **Workflow execution** (Nango Proxy for API calls)

### Implementation Tasks

#### 1. Install Nango Frontend SDK

```bash
npm install @nangohq/frontend
```

#### 2. Update OAuth Management Component

```typescript
// src/components/oauth/oauth-management.tsx
import Nango from '@nangohq/frontend'

const handleConnect = async (providerId: string) => {
  // Get session token from backend
  const { sessionToken } = await connectProvider(providerId)
  
  // Open Nango Connect UI
  const nango = new Nango()
  const connect = nango.openConnectUI({
    onEvent: (event) => {
      if (event.type === 'close') {
        // Remove loading state
      } else if (event.type === 'connect') {
        // Success! Refresh connections
        refreshConnections()
      }
    },
  })
  
  connect.setSessionToken(sessionToken)
}
```

#### 3. Create Webhook Handler

```typescript
// src/app/api/oauth/webhooks/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  
  if (body.type === 'auth' && body.operation === 'creation' && body.success) {
    const { connectionId, endUser } = body
    
    // Store connection in database
    await saveConnection(endUser.endUserId, connectionId, body.provider)
  }
  
  return NextResponse.json({ received: true })
}
```

#### 4. Dynamic Options (For Node Config)

When user configures a Twitter "Add to List" node, they need a dropdown of their lists:

```typescript
// /api/oauth/[provider]/resources/[resource]/route.ts
import { Nango } from '@nangohq/node'

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY })

export async function GET(req, { params }) {
  const { provider, resource } = params
  const connectionId = req.nextUrl.searchParams.get('connectionId')
  
  // Use Nango Proxy - handles auth automatically
  const response = await nango.proxy({
    providerConfigKey: provider,
    connectionId,
    endpoint: ENDPOINTS[provider][resource],
    method: 'GET',
  })
  
  return NextResponse.json({ options: transform(response.data) })
}
```

#### 5. Workflow Execution (Using Nango Proxy)

```typescript
// Execute node with real API call
async function executeNode(node) {
  const { provider, action, parameters, credentialId } = node.data
  
  return await nango.proxy({
    providerConfigKey: provider,
    connectionId: credentialId,
    endpoint: getEndpoint(provider, action),
    method: 'POST',
    data: parameters
  })
}
```

### Environment Variables

```bash
# .env.local
NANGO_SECRET_KEY=nango_secret_xxx
NANGO_PUBLIC_KEY=nango_public_xxx
NANGO_HOST=https://api.nango.dev
```

### Database Schema

```sql
-- Already exists: user_oauth_connections
-- May need to add:
ALTER TABLE user_oauth_connections
ADD COLUMN IF NOT EXISTS nango_connection_id TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS display_name TEXT;
```

### Priority Order for Nango Work

1. **HIGH:** Install `@nangohq/frontend` package
2. **HIGH:** Update OAuth component to use Nango Connect UI
3. **HIGH:** Create webhook handler (`/api/oauth/webhooks`)
4. **MEDIUM:** Configure webhook URL in Nango dashboard
5. **MEDIUM:** Implement dynamic options API
6. **MEDIUM:** Add user profile fetching (avatar, username)
7. **LOW:** Implement workflow execution with Nango Proxy

### Reference Documentation

- [Nango Implementation Guide](https://nango.dev/docs/implementation-guides/api-auth/implement-api-auth)
- [Nango Frontend SDK](https://nango.dev/docs/reference/sdks/frontend)
- [Nango Proxy](https://nango.dev/docs/guides/use-cases/proxy)
- [Nango Webhooks](https://nango.dev/docs/implementation-guides/platform/webhooks-from-nango)

---

## Useful Resources

### Documentation

| Doc | Purpose |
|-----|---------|
| `memory-bank/projectbrief.md` | Project overview |
| `memory-bank/techContext.md` | Tech stack details |
| `memory-bank/systemPatterns.md` | Architecture patterns |
| `memory-bank/activeContext.md` | Current work focus |
| `memory-bank/progress.md` | Detailed progress tracking |
| `.clinerules` | Coding standards & AI rules |

### Key Docs in `/docs`

| Doc | Purpose |
|-----|---------|
| `OAUTH_NANGO_IMPLEMENTATION_STATUS.md` | Nango TODO list |
| `NANGO_BACKEND_IMPLEMENTATION.md` | Backend implementation guide |
| `ERROR_MANAGEMENT_SYSTEM.md` | ErrorService patterns |
| `ANIMATION_STRATEGY.md` | Animation guidelines |
| `FEATURE_FLAGS_GUIDE.md` | Feature flag usage |

### Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run typecheck    # Check TypeScript
npm run lint         # Lint code
npm run test:app-smoke
npm run test:e2e:smoke
```

### Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Page load (p95) | <200ms | 180ms ✅ |
| Auth check (cached) | <10ms | 8ms ✅ |
| DB query (cached) | <50ms | 5ms ✅ |
| Bundle size | <500KB | 850KB ⚠️ |

---

## Questions?

If you have questions:
1. Check the `memory-bank/` files first
2. Search `/docs` for specific topics
3. Check `.clinerules` for coding standards
4. Ask the team lead

Welcome to the team! 🚀
