# Adding a New OAuth Integration

Step-by-step guide for adding a new provider (e.g., Monday.com, Freshdesk, Pipedrive) to the Lucid OAuth integration layer.

## Architecture Overview

```
Nango (auth + API proxy)          Lucid (policy + compaction)
─────────────────────────         ────────────────────────────
OAuth token management            Rate limiting (per-run, Redis)
API key injection                 Confirmation gating
Token refresh                     Audit logging (DB + structured log)
Retry + backoff                   Response shaping (LLM compaction)
SSRF protection                   Error normalization (retryable flag)
                                  OTel tracing
                                  Usage tracking
```

**Ownership rule:** Nango owns auth + API translation. Lucid owns policy + observability + compaction.

### Execution Flow

```
Agent calls nango_newprovider__list_items
  → PluginBridge detects transport='nango'
  → executeNangoAction(actionName, args, ctx)
    → GATE 1: Rate limit check (maxCallsPerRun, default 50)
    → GATE 2: Confirmation gating (requiresConfirmationActions[])
    → GATE 3: Nango client availability
    → applyDefaultPageSize(provider, actionName, args)
    → loadActionScript(integrationId, actionName)
      → Found? In-process execution via NangoProxyAdapter (~5ms)
      → Not found? Remote via nango.triggerAction() (~200ms)
    → shapeActionResponse(provider, actionName, result)
    → emitOAuthToolAudit(...)
    → return JSON.stringify(shaped)
```

### File Map

```
worker/src/agent/oauth-tools/
├── INTEGRATION-GUIDE.md           # This file
├── nango-client.ts                # Nango SDK singleton
├── nango-action-bridge.ts         # Execution orchestrator (3 gates + tracing)
├── nango-proxy-adapter.ts         # HTTP adapter for in-process action scripts
├── action-script-loader.ts        # Loads compiled .cjs scripts from disk
├── connection-resolver.ts         # Maps provider → connectionId
├── rate-limiter.ts                # Redis + in-memory fallback
├── audit.ts                       # Fire-and-forget audit with secret redaction
├── types.ts                       # OAuthBinding, NangoToolDefinition
├── response-shaper.ts             # Router + shared helpers (pagination, page sizes)
├── shaper-contract.ts             # Contract types (ListActionResult, NormalizedError)
├── shapers/                       # Per-provider compaction logic
│   ├── generic.ts                 # 25 small providers (depth-limited, bloat stripping)
│   ├── slack.ts                   # Channels, users, messages
│   ├── hubspot.ts                 # CRM entities with property allowlists
│   ├── twitter.ts                 # Tweets, users (v2 API)
│   ├── google.ts                  # Calendar, Drive, Gmail, Sheets
│   ├── salesforce.ts              # Records with attributes stripping
│   ├── zendesk.ts                 # Tickets, articles
│   └── github.ts                  # Repos, issues, PRs
└── __tests__/
    ├── response-shaper.test.ts    # 127 tests (shaper unit + contract)
    ├── all-providers-simulation.test.ts  # 512 tests (full provider coverage)
    ├── nango-action-bridge.test.ts      # Bridge policy tests
    ├── action-e2e.test.ts               # Live Nango API tests
    └── ...                              # 12 test files total
```

---

## Step-by-Step: Adding a New Provider

### Tier 1: Zero-Code (Generic Shaper)

For providers with 1-5 simple actions and standard REST responses, you may not need any code changes at all. If the provider is already configured in Nango and the generic shaper handles its responses well enough, you only need DB seeds.

**Check first:** Does the generic shaper already cover your provider? It handles any response with a standard array key (`results`, `records`, `items`, `data`, etc.) and strips bloat keys (`_links`, `_embedded`, `metadata`). If yes, just register it in the SHAPERS map.

### Tier 2: Full Integration (Dedicated Shaper)

For providers with 10+ actions, complex response structures, or specific compaction needs, follow the full process below.

---

### Step 1: Action Scripts

Action scripts define **what** the provider can do. They are TypeScript files compiled to `.cjs` by Nango's build toolchain.

**Location:** `nango-integrations/` (source) → `nango-integrations/build/` (compiled `.cjs`)

**Naming convention:** `{providerConfigKey}_actions_{action-name}.cjs`

**Contract:**

```typescript
// Every action script exports this shape:
export default {
  exec: async (nango: NangoProxyAdapter, input: InputSchema) => {
    // nango provides: .get(), .post(), .put(), .patch(), .delete(), .proxy()
    // All methods auto-inject OAuth tokens via Nango's proxy layer
    const response = await nango.get({
      endpoint: '/api/v2/items',
      params: { limit: input.page_size ?? 25 },
      retries: 3,
    })
    return {
      items: response.data.items,
      total: response.data.total,
      next_cursor: response.data.next_page ?? null,
    }
  }
}
```

**Key rules:**
- **Pure functions:** `(nango, input) → output`. No side effects, no imports.
- **Never throw on API errors** — let Nango's retry handle transient failures. Only throw on business logic errors.
- **Return flat, serializable objects.** No circular refs, no class instances.
- **Use `retries: 3`** for all HTTP calls (Nango handles exponential backoff with jitter).
- **Pagination:** Accept `page_size` and `cursor`/`page_token` in input. Return `next_cursor` in output.

**Build:**

```bash
cd nango-integrations && npx nango build <provider-name>
```

Output: `nango-integrations/build/{provider}_actions_{action}.cjs`

The worker loads these at runtime via `action-script-loader.ts` using `createRequire()`.

---

### Step 2: DB Seeds

Two tables need rows for a new provider.

#### 2a. `plugin_catalog` — Provider Registration

```sql
-- Migration: supabase/migrations/20260329XXXXXX_add_newprovider.sql

INSERT INTO plugin_catalog (
  slug, name, description, kind, transport, auth_type, auth_provider,
  trust_level, execution_mode, is_published, verified,
  tool_manifest
) VALUES (
  'nango-newprovider',
  'NewProvider',
  'NewProvider integration for ...',
  'integration',    -- MUST be 'integration' for OAuth
  'nango',          -- MUST be 'nango'
  'oauth2',         -- or 'api-key' for API key auth
  'newprovider',    -- Nango provider config key
  'internal',
  'in_process',
  true,
  true,
  -- Tool manifest: JSON array of tool definitions
  '[
    {
      "name": "list-items",
      "description": "List items from NewProvider",
      "parameters": {
        "type": "object",
        "properties": {
          "page_size": { "type": "number", "description": "Max results per page" },
          "cursor": { "type": "string", "description": "Pagination cursor" }
        }
      }
    },
    {
      "name": "create-item",
      "description": "Create a new item in NewProvider",
      "parameters": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Item name" },
          "description": { "type": "string", "description": "Item description" }
        },
        "required": ["name"]
      }
    }
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;
```

#### 2b. `oauth_action_catalog` — Action Definitions

```sql
INSERT INTO oauth_action_catalog (provider, action_name, description, endpoint, method, parameter_schema, danger_level, read_only, is_active)
VALUES
  ('newprovider', 'list-items', 'List items', '/api/v2/items', 'GET',
   '{"type":"object","properties":{"page_size":{"type":"number"},"cursor":{"type":"string"}}}'::jsonb,
   'read', true, true),
  ('newprovider', 'create-item', 'Create a new item', '/api/v2/items', 'POST',
   '{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"}},"required":["name"]}'::jsonb,
   'write', false, true)
ON CONFLICT (provider, action_name) DO NOTHING;
```

**Danger levels:**
- `read` — Read-only queries (list, get, search)
- `write` — Creates or updates (create, update, send)
- `destructive` — Deletes or irreversible mutations (delete, archive, revoke)

---

### Step 3: Response Shaper

Decide whether to use the **generic shaper** or write a **dedicated shaper**.

#### Option A: Generic Shaper (recommended for 1-10 actions)

Register the provider in the SHAPERS map in `response-shaper.ts`:

```typescript
// In response-shaper.ts, add to SHAPERS map:
import { shapeGenericResponse } from './shapers/generic.js'

const SHAPERS: Record<string, ...> = {
  // ... existing entries ...
  newprovider: shapeGenericResponse,
}
```

The generic shaper automatically:
- Finds the main array in the response (`results`, `items`, `data`, `records`, etc.)
- Strips bloat keys (`_links`, `_embedded`, `metadata`, `request_id`, `_rawJSON`)
- Limits arrays to 25 items, nested arrays to 10 items
- Caps object depth at 2 levels (deeper objects become `'[object]'`)
- Detects pagination via `detectPagination()`

#### Option B: Dedicated Shaper (recommended for 10+ actions or complex responses)

Create `worker/src/agent/oauth-tools/shapers/newprovider.ts`:

```typescript
/**
 * NewProvider Response Shaper — compacts items, users, etc.
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

// ── Compactors ──────────────────────────────────────────

function compactItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    status: item.status ?? null,
    created_at: item.created_at ?? null,
    // Keep only essential fields — agent can call get-item for full details
  }
}

// ── Action Sets ─────────────────────────────────────────

const ITEM_LIST_ACTIONS = new Set(['list-items', 'search-items'])
const ITEM_GET_ACTIONS = new Set(['get-item'])

// ── Router ──────────────────────────────────────────────

export function shapeNewProviderResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)

  const data = result as Record<string, unknown>

  // List responses — compact array items
  if (ITEM_LIST_ACTIONS.has(actionName) && Array.isArray(data.items)) {
    const items = (data.items as Record<string, unknown>[]).map(compactItem)
    const pagination = detectPagination(data)
    const shaped = {
      results: items,
      ...pagination,
      _compact: true as const,
      _hint: 'Use get-item with a specific item ID for full details.',
    }
    return compacted(result, shaped, items.length)
  }

  // Single item responses
  if (ITEM_GET_ACTIONS.has(actionName) && data.id) {
    return compacted(result, compactItem(data), 1)
  }

  // Unknown actions — passthrough (fail-open)
  return passthrough(result)
}
```

Then register in `response-shaper.ts`:

```typescript
import { shapeNewProviderResponse } from './shapers/newprovider.js'

const SHAPERS = {
  // ... existing ...
  newprovider: shapeNewProviderResponse,
}
```

**Shaper rules:**
- **Always passthrough for unknown actions.** Shapers must never block execution for unrecognized actions.
- **Use `compacted()` and `passthrough()` helpers** — they handle serialization and telemetry.
- **Use `detectPagination()`** for list responses — it handles 7 different provider patterns.
- **Include `_compact: true` and `_hint`** in shaped list responses so the agent knows it can fetch full details.
- **Fail-open:** The router in `response-shaper.ts` wraps every shaper call in try/catch. If your shaper throws on malformed data, the raw result is returned unchanged.

---

### Step 4: Default Page Sizes

If the provider has list/search actions, add default page sizes in `response-shaper.ts`:

```typescript
const DEFAULT_PAGE_SIZES: Record<string, Record<string, number>> = {
  // ... existing ...
  newprovider: {
    'list-items': 15,
    'search-items': 10,
  },
}
```

**Why:** Many APIs default to 100+ results. LLMs don't need 100 items to decide what to do next. We inject a smaller `page_size` when the agent doesn't specify one. The agent can always request more via `page_size` or pagination.

---

### Step 5: Tests

Add tests in `worker/src/agent/oauth-tools/__tests__/response-shaper.test.ts`:

```typescript
describe('shapeActionResponse — NewProvider', () => {
  it('compacts list-items response', () => {
    const raw = {
      items: [
        { id: '1', name: 'Item 1', status: 'active', description: 'long text...', metadata: {} },
      ],
      total: 1,
    }
    const result = shapeActionResponse('newprovider', 'list-items', raw)
    expect(result.compacted).toBe(true)
    const shaped = result.shaped as Record<string, unknown>
    expect(shaped._compact).toBe(true)
    expect(shaped.results).toHaveLength(1)
    // Verify only essential fields are kept
    const item = (shaped.results as Record<string, unknown>[])[0]
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
    expect(item).not.toHaveProperty('description')  // stripped
    expect(item).not.toHaveProperty('metadata')      // stripped
  })

  it('passthroughs for unknown actions', () => {
    const data = { foo: 'bar' }
    const result = shapeActionResponse('newprovider', 'unknown-action', data)
    expect(result.compacted).toBe(false)
    expect(result.shaped).toBe(data)
  })
})
```

Also update `all-providers-simulation.test.ts` if your provider was previously in the passthrough list.

---

### Step 6: Nango Configuration

Configure the provider in Nango (self-hosted at lucid.foundation/Nango):

1. Add the OAuth app credentials (client ID + secret)
2. Set the integration ID (must match `auth_provider` in `plugin_catalog`)
3. Configure required OAuth scopes
4. Test the connection flow

**Env vars** (already set on Railway for existing providers):
- `NANGO_SECRET_KEY` — Nango SDK API key
- `NANGO_HOST` — Nango server URL (defaults to cloud)
- `NANGO_ACTIONS_DIR` — Path to compiled `.cjs` scripts

---

## Contract Types

All shapers and error paths must conform to these types defined in `shaper-contract.ts`:

```typescript
/** Shaped list response — every list shaper must return this shape */
export interface ListActionResult {
  results: unknown[]
  has_more: boolean
  next_cursor: string | null
  _compact?: true
  _hint?: string
}

/** Error response — every error path returns this shape */
export interface NormalizedError {
  error: string
  provider: string
  action: string
  retryable: boolean
  status_code?: number
}
```

**Error normalization** (in `nango-action-bridge.ts`):
- `retryable: true` for: HTTP 429, 5xx, `timed out`, `ECONNRESET`
- `retryable: false` for: 4xx client errors, rate limit exceeded, not configured
- `status_code` included when extractable from Axios/Nango error shapes

---

## Pagination Detection

`detectPagination()` in `response-shaper.ts` handles all known patterns:

| Provider Pattern | Detection | Extraction |
|:---:|:---:|:---:|
| HubSpot | `paging.next.after` | `has_more=true, next_cursor=after` |
| Slack | `response_metadata.next_cursor` | `has_more=true, next_cursor=cursor` |
| Google | `nextPageToken` | `has_more=true, next_cursor=token` |
| Twitter | `meta.next_token` | `has_more=true, next_cursor=token` |
| Salesforce | `done=false, nextRecordsUrl` | `has_more=true, next_cursor=url` |
| Notion | `has_more=true` | `has_more=true, next_cursor=cursor` |
| Generic | none of above | `has_more=false, next_cursor=null` |

If your provider uses a different pagination pattern, add it to `detectPagination()`.

---

## Confirmation Gating

For write/destructive actions that should require user approval before execution:

```typescript
// In assistant_plugin_activations.config:
{
  "requiresConfirmationActions": ["delete-item", "send-message"],
  "maxCallsPerRun": 30
}
```

These are set per-assistant via the activation config. The bridge checks before execution and returns a `{ gated: true }` response instead of executing.

---

## Checklist

Before merging a new integration:

- [ ] Action scripts compile to `.cjs` and export `exec(nango, input)`
- [ ] `plugin_catalog` seed with `kind='integration'`, `transport='nango'`
- [ ] `oauth_action_catalog` seed with all actions, correct `danger_level`
- [ ] Shaper registered in SHAPERS map (generic or dedicated)
- [ ] Default page sizes added for list/search actions
- [ ] Tests added to `response-shaper.test.ts`
- [ ] `all-providers-simulation.test.ts` updated if needed
- [ ] Nango provider configured with OAuth credentials
- [ ] Run: `cd worker && npx vitest run src/agent/oauth-tools/__tests__/`
- [ ] Run: `cd worker && npm run typecheck`

---

## Current Provider Coverage (36 Providers)

| Provider | Actions | Shaper | Page Sizes |
|:---:|:---:|:---:|:---:|
| Notion | 14 | Built-in (response-shaper.ts) | 5 actions |
| Slack | 26 | Dedicated (slack.ts) | 2 actions |
| HubSpot | 49 | Dedicated (hubspot.ts) | 10 actions |
| Twitter/X | 29 | Dedicated (twitter.ts) | 10 actions |
| Google | 93 | Dedicated (google.ts) | 3 keys, 5 actions |
| Salesforce | 14 | Dedicated (salesforce.ts) | 1 action |
| Zendesk | 8 | Dedicated (zendesk.ts) | 2 actions |
| GitHub | 5 | Dedicated (github.ts) | 3 actions |
| Asana | 5 | Generic | 1 action |
| Linear | 3 | Generic | 1 action |
| Intercom | 3 | Generic | - |
| Airtable | 4 | Generic | - |
| Calendly | 3 | Generic | - |
| Aircall | 2 | Generic | - |
| Jira | 3 | Generic | - |
| Gong | 2 | Generic | 1 action |
| Fireflies | 2 | Generic | - |
| LinkedIn | 2 | Generic | - |
| AWS IAM | 2 | Generic | - |
| Zoom | 5 | Passthrough | - |
| Discord | 5 | Generic | 3 actions |
| Trello | 5 | Generic | 3 actions |
| Reddit | 4 | Generic | 1 action |
| PayPal | 4 | Generic | 1 action |
| Whoop | 4 | Generic | 3 actions |
| Instagram | 3 | Generic | 1 action |
| Facebook | 3 | Generic | 1 action |
| Typeform | 3 | Generic | 2 actions |
| Bitly | 3 | Generic | 1 action |
| Canva | 3 | Generic | 1 action |
| Lemlist | 3 | Generic | 2 actions |
| HeyGen | 3 | Generic | - |
| TikTok | 2 | Generic | - |
| Amazon SES | 2 | Generic | 1 action |

**Total: 282 action scripts, 1375 tests**
