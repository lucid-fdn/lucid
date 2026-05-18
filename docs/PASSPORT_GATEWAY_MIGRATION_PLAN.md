# Passport-Aware TrustGate — Full Migration Plan

> **Status**: ✅ Phases 1–6 CODE COMPLETE + GitHub Packages infra ready — only deployment items remain  
> **Author**: Architecture Review  
> **Date**: 2025-02-19  
> **Repos**: `lucid-cloud`, `Lucid-L2`, `LucidMerged`  
> **Last Verified**: 2026-02-19 — tsc clean, 7/7 tests pass, all integration files confirmed  
> **Last Updated**: 2026-02-20 — Package renamed `@raijinlabs/passport`, GitHub Packages CI + `.npmrc` created, Lucid-L2 `file:` ref replaced with `^0.1.0`

---

## Executive Summary

Extract the passport matching engine, policy engine, and passport store from `Lucid-L2/offchain/src/` into a shared `packages/passport/` package within `lucid-cloud`. Wire it into TrustGate's model router so passport-aware routing happens in-process (no network hop). LiteLLM continues to handle actual provider routing/failover. Lucid-L2 retains ownership of blockchain anchoring, receipt creation, and passport CRUD APIs. The SDK (`api.lucid.foundation`) is preserved via a reverse proxy that routes inference to TrustGate and everything else to Lucid-L2.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Phase 1: Extract `packages/passport/`](#3-phase-1-extract-packagespassport-1-2-days)
4. [Phase 2: Postgres Storage Backend](#4-phase-2-postgres-storage-backend-1-day)
5. [Phase 3: Wire into TrustGate Model Router](#5-phase-3-wire-into-trustgate-model-router-1-day)
6. [Phase 4: Enriched Responses + Receipt Sidecar](#6-phase-4-enriched-responses--receipt-sidecar-1-day)
7. [Phase 5: Reverse Proxy + SDK Compatibility](#7-phase-5-reverse-proxy--sdk-compatibility-half-day)
8. [Phase 6: Deprecate Lucid-L2 Inference Endpoints](#8-phase-6-deprecate-lucid-l2-inference-endpoints-half-day)
9. [Migration Checklist](#9-migration-checklist)
10. [Risk Register](#10-risk-register)
11. [Rollback Plan](#11-rollback-plan)

---

## 1. Current State Analysis

### Lucid-L2 Offchain — Source Files to Extract

| File | Path in Lucid-L2 | Lines | Dependencies | Action |
|------|-------------------|-------|-------------|--------|
| `PassportStore` | `offchain/src/storage/passportStore.ts` | ~370 | `fs`, `path`, `uuid` | **Extract** → swap file I/O for Postgres |
| `matchComputeForModel` | `offchain/src/services/matchingEngine.ts` | ~200 | `policyEngine`, `computeRegistry`, `schemaValidator` | **Extract verbatim** |
| `evaluatePolicy` | `offchain/src/services/policyEngine.ts` | ~100 | `hash`, `schemaValidator` | **Extract verbatim** |
| `ComputeRegistry` | `offchain/src/services/computeRegistry.ts` | ~150 | None (in-memory Map) | **Extract verbatim** |
| Types | `offchain/src/types/lucid_passports.ts` | ~50 | None | **Extract verbatim** |
| `canonicalSha256Hex` | `offchain/src/utils/hash.ts` | ~20 | `crypto` (Node built-in) | **Extract** |
| `schemaValidator` | `offchain/src/utils/schemaValidator.ts` | ~60 | `ajv` | **Extract** |
| JSON schemas | `offchain/schemas/` | ~100 | AJV | **Copy** |

**NOT extracted (replaced by TrustGate + LiteLLM):**
- `executionGateway.ts` — bare Express inference handler, no auth
- `computeClient.ts` — direct vLLM/TGI calls (LiteLLM replaces)
- `receiptService.ts` / `anchoringService.ts` — blockchain-specific, stays in Lucid-L2
- `MODEL_ALIASES` — replaced by LiteLLM model config

### TrustGate v1.ts — Current Pipeline

```
v1.ts: POST /v1/chat/completions
  1. resolveTenantId(request)     → verifyApiKey(Bearer token)
  2. assertRequestAllowed(tenantId, endpoint)
  3. assertWithinQuota(tenantId)
  4. chatCompletionsSchema.parse(body)
  5. litellmChatCompletion(body)   ← body.model passed directly to LiteLLM
  6. recordUsage(tenantId, tokens, cost)
  7. trackLlmUsage(db, {...})      → OpenMeter outbox
  8. reply.send(response)
```

**Gap**: Step 5 passes `body.model` directly — no passport resolution. The `model-router.ts` stub returns `"litellm"` and is never called.

---

## 2. Target Architecture

```
api.lucid.foundation (nginx/Cloudflare reverse proxy)
    │
    ├── /v1/chat/completions  ──→  TrustGate (:4010) + embedded @lucid/passport
    ├── /v1/embeddings        ──→  TrustGate (:4010)
    │
    ├── /v1/passports/*       ──→  Lucid-L2 (:5100) — CRUD, on-chain sync
    ├── /v1/receipts/*        ──→  Lucid-L2 (:5100) — receipt creation, verify
    ├── /v1/epochs/*          ──→  Lucid-L2 (:5100) — blockchain anchoring
    ├── /v1/match/*           ──→  Lucid-L2 (:5100) — can also call matching engine
    ├── /v1/agents/*          ──→  Lucid-L2 (:5100)
    └── everything else       ──→  Lucid-L2 (:5100)

TrustGate pipeline (updated):
  1. verifyApiKey(raw) → tenantId
  2. assertRequestAllowed(tenantId, endpoint)
  3. assertWithinQuota(tenantId)
  4. chatCompletionsSchema.parse(body)
  5. ★ resolveModel(body.model, X-Lucid-Passport, X-Lucid-Policy)  ← NEW
  6. litellmChatCompletion({ ...body, model: route.litellm_model })
  7. recordUsage() → metering outbox → OpenMeter
  8. ★ emitReceiptEvent() (async, fire-and-forget)                  ← NEW
  9. reply.send({ ...response, lucid: { passport_id, ... } })      ← NEW
```

**Key principle**: TrustGate imports `@lucid/passport` as a local package (in-process, <1ms). No network hop. Lucid-L2 also imports `@lucid/passport` for its own passport CRUD and receipt endpoints. Both share the same Postgres `passports` table.

---

## 3. Phase 1: Extract `packages/passport/` (1-2 days)

### 3.1 Create Package Structure

```
lucid-cloud/
└── packages/
    └── passport/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts              # Re-exports everything
            ├── types.ts              # Passport, PassportType, PassportStatus, PassportFilters, PaginatedResult
            ├── store.ts              # PassportStore class (Postgres backend)
            ├── matching-engine.ts    # matchComputeForModel (from Lucid-L2, verbatim logic)
            ├── policy-engine.ts      # evaluatePolicy (from Lucid-L2, verbatim logic)
            ├── compute-registry.ts   # ComputeRegistry (from Lucid-L2, verbatim)
            ├── hash.ts               # canonicalSha256Hex (from Lucid-L2 utils/hash.ts)
            ├── schema-validator.ts   # validateWithSchema (from Lucid-L2 utils/schemaValidator.ts)
            └── schemas/              # AJV schemas (ModelMeta.json, ComputeMeta.json, Policy.json)
```

### 3.2 package.json

```json
{
  "name": "@lucid/passport",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "ajv": "^8.12.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/uuid": "^9.0.0"
  }
}
```

### 3.3 Extraction Rules

For each file extracted from Lucid-L2:

1. **Copy the logic verbatim** — do NOT refactor during extraction
2. **Fix imports** — change `'../utils/hash'` → `'./hash'`, etc.
3. **Remove `fs`/`path` imports** from PassportStore — replace with Postgres calls (Phase 2)
4. **Keep the same function signatures** — `matchComputeForModel(input)`, `evaluatePolicy(input)`, etc.
5. **Add unit tests** that match the existing tests in `Lucid-L2/offchain/src/__tests__/`

### 3.4 Types to Export (from passportStore.ts)

```typescript
// types.ts — extracted from passportStore.ts interface definitions
export type PassportType = 'model' | 'compute' | 'tool' | 'dataset' | 'agent'
export type PassportStatus = 'active' | 'deprecated' | 'revoked'

export interface Passport {
  passport_id: string
  type: PassportType
  owner: string
  metadata: any
  created_at: number
  updated_at: number
  status: PassportStatus
  tags?: string[]
  name?: string
  description?: string
  version?: string
  on_chain_pda?: string
  on_chain_tx?: string
  last_sync_at?: number
}

export interface PassportFilters {
  type?: PassportType | PassportType[]
  owner?: string
  status?: PassportStatus | PassportStatus[]
  tags?: string[]
  tag_match?: 'all' | 'any'
  search?: string
  page?: number
  per_page?: number
  sort_by?: 'created_at' | 'updated_at' | 'name'
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}
```

---

## 4. Phase 2: Postgres Storage Backend (1 day)

### 4.1 Migration SQL

Create in `lucid-cloud/migrations/`:

```sql
-- 002_passport_store.sql
CREATE TABLE IF NOT EXISTS passports (
  passport_id    TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('model','compute','tool','dataset','agent')),
  owner          TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated','revoked')),
  name           TEXT,
  description    TEXT,
  version        TEXT,
  tags           TEXT[] DEFAULT '{}',
  on_chain_pda   TEXT,
  on_chain_tx    TEXT,
  last_sync_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_passports_type_status ON passports(type, status);
CREATE INDEX idx_passports_owner ON passports(owner);
CREATE INDEX idx_passports_tags ON passports USING GIN(tags);
CREATE INDEX idx_passports_name_search ON passports USING GIN(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
```

### 4.2 PassportStore Postgres Implementation

Replace the file-based `PassportStore` with a Postgres-backed implementation. **Keep the exact same interface** so `matchingEngine.ts` and `policyEngine.ts` don't change at all.

```typescript
// packages/passport/src/store.ts
import { v4 as uuidv4 } from 'uuid'
import type { Passport, PassportType, PassportStatus, PassportFilters, PaginatedResult } from './types'

// Accept a query function — injected by the consuming app (TrustGate or Lucid-L2)
type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[] }>

let queryFn: QueryFn | null = null

export function initPassportStore(query: QueryFn): void {
  queryFn = query
}

function getQuery(): QueryFn {
  if (!queryFn) throw new Error('PassportStore not initialized. Call initPassportStore(query) first.')
  return queryFn
}

export class PassportStore {
  generateId(): string {
    return `passport_${uuidv4().replace(/-/g, '')}`
  }

  async create(input: {
    type: PassportType
    owner: string
    metadata: any
    name?: string
    description?: string
    version?: string
    tags?: string[]
  }): Promise<Passport> {
    const q = getQuery()
    const id = this.generateId()
    const now = new Date().toISOString()
    const result = await q(
      `INSERT INTO passports (passport_id, type, owner, metadata, name, description, version, tags, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)
       RETURNING *`,
      [id, input.type, input.owner, JSON.stringify(input.metadata), input.name, input.description, input.version, input.tags || [], now]
    )
    return this.rowToPassport(result.rows[0])
  }

  async get(passportId: string): Promise<Passport | null> {
    const q = getQuery()
    const result = await q('SELECT * FROM passports WHERE passport_id = $1', [passportId])
    return result.rows[0] ? this.rowToPassport(result.rows[0]) : null
  }

  async update(passportId: string, patch: Partial<Omit<Passport, 'passport_id' | 'created_at'>>): Promise<Passport | null> {
    // Build dynamic SET clause from patch
    const q = getQuery()
    const sets: string[] = ['updated_at = now()']
    const values: any[] = []
    let paramIdx = 1

    for (const [key, value] of Object.entries(patch)) {
      if (key === 'passport_id' || key === 'created_at') continue
      if (key === 'metadata') {
        sets.push(`${key} = $${paramIdx}`)
        values.push(JSON.stringify(value))
      } else {
        sets.push(`${key} = $${paramIdx}`)
        values.push(value)
      }
      paramIdx++
    }

    values.push(passportId)
    const result = await q(
      `UPDATE passports SET ${sets.join(', ')} WHERE passport_id = $${paramIdx} RETURNING *`,
      values
    )
    return result.rows[0] ? this.rowToPassport(result.rows[0]) : null
  }

  async delete(passportId: string): Promise<boolean> {
    const q = getQuery()
    const result = await q(
      `UPDATE passports SET status = 'revoked', updated_at = now() WHERE passport_id = $1 RETURNING passport_id`,
      [passportId]
    )
    return result.rows.length > 0
  }

  async list(filters: PassportFilters = {}): Promise<PaginatedResult<Passport>> {
    const q = getQuery()
    const conditions: string[] = []
    const values: any[] = []
    let paramIdx = 1

    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type]
      conditions.push(`type = ANY($${paramIdx})`)
      values.push(types)
      paramIdx++
    }
    if (filters.owner) {
      conditions.push(`owner = $${paramIdx}`)
      values.push(filters.owner)
      paramIdx++
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      conditions.push(`status = ANY($${paramIdx})`)
      values.push(statuses)
      paramIdx++
    }
    if (filters.tags && filters.tags.length > 0) {
      if (filters.tag_match === 'any') {
        conditions.push(`tags && $${paramIdx}`)
      } else {
        conditions.push(`tags @> $${paramIdx}`)
      }
      values.push(filters.tags)
      paramIdx++
    }
    if (filters.search) {
      conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`)
      values.push(`%${filters.search}%`)
      paramIdx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortBy = filters.sort_by || 'created_at'
    const sortOrder = filters.sort_order || 'desc'
    const page = Math.max(1, filters.page || 1)
    const perPage = Math.min(100, Math.max(1, filters.per_page || 20))
    const offset = (page - 1) * perPage

    // Count total
    const countResult = await q(`SELECT COUNT(*) as total FROM passports ${where}`, values)
    const total = parseInt(countResult.rows[0].total, 10)

    // Fetch page
    const dataResult = await q(
      `SELECT * FROM passports ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, perPage, offset]
    )

    const totalPages = Math.ceil(total / perPage)
    return {
      items: dataResult.rows.map(r => this.rowToPassport(r)),
      pagination: { page, per_page: perPage, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
    }
  }

  private rowToPassport(row: any): Passport {
    return {
      passport_id: row.passport_id,
      type: row.type,
      owner: row.owner,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      status: row.status,
      name: row.name,
      description: row.description,
      version: row.version,
      tags: row.tags || [],
      on_chain_pda: row.on_chain_pda,
      on_chain_tx: row.on_chain_tx,
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at).getTime() : undefined,
      created_at: new Date(row.created_at).getTime(),
      updated_at: new Date(row.updated_at).getTime(),
    }
  }
}

// Singleton
let storeInstance: PassportStore | null = null

export function getPassportStore(): PassportStore {
  if (!storeInstance) {
    storeInstance = new PassportStore()
  }
  return storeInstance
}
```

### 4.3 Data Migration Script

```bash
# Export from Lucid-L2 file store
node -e "
const data = require('./Lucid-L2/offchain/data/passports/passports.json');
const passports = Object.values(data.passports);
for (const p of passports) {
  console.log(JSON.stringify(p));
}
" > /tmp/passports-export.jsonl

# Import to Postgres (via psql or migration script)
# Each line is a passport JSON object → INSERT INTO passports
```

---

## 5. Phase 3: Wire into TrustGate Model Router (1 day)

### 5.1 New File: `modules/trustgate/src/router/model-router.ts`

```typescript
import { getPassportStore, matchComputeForModel } from '@lucid/passport'

export interface RouteResult {
  litellm_model: string
  passport_id?: string
  compute_passport_id?: string
  policy_hash?: string
  match_explain?: object
}

export async function resolveModel(
  requestModel: string,
  passportHeader?: string,
  policyHeader?: string
): Promise<RouteResult> {

  // Fast path: no passport header → pass model string directly to LiteLLM
  if (!passportHeader) {
    return { litellm_model: requestModel }
  }

  // Passport path: resolve through matching engine
  const store = getPassportStore()
  const passport = await store.get(passportHeader)

  if (!passport || passport.type !== 'model') {
    throw new Error(`Invalid model passport: ${passportHeader}`)
  }

  const policy = policyHeader
    ? JSON.parse(policyHeader)
    : { version: '1.0', constraints: {} }

  // Get active compute passports
  const computePassports = await store.list({ type: 'compute', status: 'active', per_page: 100 })
  const computeCatalog = computePassports.items.map(p => p.metadata)

  const { match, explain } = matchComputeForModel({
    model_meta: passport.metadata,
    policy,
    compute_catalog: computeCatalog,
    require_live_healthy: false // LiteLLM handles health
  })

  const litellmModel = mapPassportToLiteLLM(passport.metadata)

  return {
    litellm_model: litellmModel,
    passport_id: passport.passport_id,
    compute_passport_id: match?.compute_passport_id,
    policy_hash: explain.policy_hash,
    match_explain: explain
  }
}

function mapPassportToLiteLLM(modelMeta: any): string {
  // Bridge between passport model identifiers and LiteLLM model strings
  // LiteLLM format: "provider/model-name"
  const passportId = modelMeta.model_passport_id || ''

  const PASSPORT_TO_LITELLM: Record<string, string> = {
    'openai-gpt4': 'openai/gpt-4',
    'openai-gpt4o': 'openai/gpt-4o',
    'openai-gpt4o-mini': 'openai/gpt-4o-mini',
    'anthropic-claude-3-sonnet': 'anthropic/claude-3-sonnet-20240229',
    'anthropic-claude-3-opus': 'anthropic/claude-3-opus-20240229',
    'anthropic-claude-3.5-sonnet': 'anthropic/claude-3-5-sonnet-20241022',
    'google-gemini-pro': 'gemini/gemini-pro',
    'google-gemini-1.5-pro': 'gemini/gemini-1.5-pro',
    'mistral-large': 'mistral/mistral-large-latest',
    'meta-llama-3.1-70b': 'together_ai/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    // Extensible — add mappings as new models are registered
  }

  return PASSPORT_TO_LITELLM[passportId] || passportId
}
```

### 5.2 Update TrustGate v1.ts

**File**: `lucid-cloud/apps/trustgate-api/src/routes/v1.ts`

Changes to the chat completions handler:

```diff
+ import { resolveModel } from '../../../../modules/trustgate/src/router/model-router'

  app.post("/v1/chat/completions", async (request, reply) => {
    const tenantId = resolveTenantId(request)
    let statusBucket = "success"

    try {
      assertRequestAllowed(tenantId, "/v1/chat/completions")
      assertWithinQuota(tenantId)

      const body = chatCompletionsSchema.parse(request.body)

+     // Passport-aware model resolution
+     const passportHeader = request.headers['x-lucid-passport'] as string | undefined
+     const policyHeader = request.headers['x-lucid-policy'] as string | undefined
+     const route = await resolveModel(body.model, passportHeader, policyHeader)

-     const response = await litellmChatCompletion(body)
+     const response = await litellmChatCompletion({ ...body, model: route.litellm_model })

      recordUsage({ tenantId, endpoint: "/v1/chat/completions", ... })

      if (db) {
-       trackLlmUsage(db, { tenantId, model: body.model ?? "unknown", ... })
+       trackLlmUsage(db, { tenantId, model: route.litellm_model ?? body.model ?? "unknown", ... })
      }

+     // Enrich response with Lucid metadata (backward compatible)
+     const enrichedResponse = {
+       ...response,
+       ...(route.passport_id && {
+         lucid: {
+           passport_id: route.passport_id,
+           compute_passport_id: route.compute_passport_id,
+           policy_hash: route.policy_hash,
+           match_explain: route.match_explain
+         }
+       })
+     }

-     return reply.send(response)
+     return reply.send(enrichedResponse)
    } catch (error) { ... }
  })
```

### 5.3 Initialize PassportStore in TrustGate Server

**File**: `lucid-cloud/apps/trustgate-api/src/server.ts`

```diff
+ import { initPassportStore } from '@lucid/passport'

  // After DB pool creation:
+ initPassportStore(async (sql, params) => {
+   const result = await pool.query(sql, params)
+   return { rows: result.rows }
+ })
```

---

## 6. Phase 4: Enriched Responses + Receipt Sidecar (1 day)

### 6.1 Receipt Event Emitter

**New file**: `modules/trustgate/src/receipt-events.ts`

```typescript
// Fire-and-forget receipt event for Lucid-L2 to consume
// Options: shared Postgres table, Redis pub/sub, or HTTP webhook

interface ReceiptEvent {
  model_passport_id: string
  compute_passport_id?: string
  policy_hash: string
  tokens_in?: number
  tokens_out?: number
  tenant_id: string
  timestamp: number
}

// Option A: Postgres outbox (simplest, reuses existing DB)
export async function emitReceiptEvent(db: any, event: ReceiptEvent): Promise<void> {
  try {
    await db.query(
      `INSERT INTO receipt_events (model_passport_id, compute_passport_id, policy_hash, tokens_in, tokens_out, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [event.model_passport_id, event.compute_passport_id, event.policy_hash, event.tokens_in, event.tokens_out, event.tenant_id]
    )
  } catch (err) {
    // Non-blocking: log and continue
    console.error('Failed to emit receipt event:', err)
  }
}
```

### 6.2 Receipt Events Migration

```sql
-- 003_receipt_events.sql
CREATE TABLE IF NOT EXISTS receipt_events (
  id                    BIGSERIAL PRIMARY KEY,
  model_passport_id     TEXT NOT NULL,
  compute_passport_id   TEXT,
  policy_hash           TEXT NOT NULL,
  tokens_in             INTEGER,
  tokens_out            INTEGER,
  tenant_id             TEXT NOT NULL,
  model                 TEXT,
  endpoint              TEXT,
  processed             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_events_unprocessed
  ON receipt_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_receipt_events_tenant
  ON receipt_events(tenant_id, created_at DESC);
```

### 6.3 Lucid-L2 Receipt Consumer

Lucid-L2 polls `receipt_events` table (or subscribes via LISTEN/NOTIFY):

```typescript
// In Lucid-L2: jobs/receiptConsumer.ts
// Polls receipt_events WHERE processed = false
// For each: createReceipt() → anchorToSolana() → mark processed = true
```

This keeps TrustGate **completely blockchain-free**. Lucid-L2 handles Solana independently.

---

## 7. Phase 5: Reverse Proxy + SDK Compatibility (half day)

### 7.1 Nginx Config for `api.lucid.foundation`

```nginx
upstream trustgate {
  server trustgate-api:4010;
}

upstream lucid_l2 {
  server lucid-l2-offchain:5100;
}

server {
  listen 443 ssl;
  server_name api.lucid.foundation;

  # Inference endpoints → TrustGate (has auth, billing, passport resolution)
  location ~ ^/v1/(chat/completions|embeddings) {
    proxy_pass http://trustgate;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
  }

  # Everything else → Lucid-L2 (passports, receipts, epochs, agents, etc.)
  location / {
    proxy_pass http://lucid_l2;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 7.2 SDK Impact

The Lucid-L2 SDK (`sdk/` directory, Speakeasy-generated) uses configurable `serverURL`:

- **`sdk.run.inference()`** → hits `/v1/chat/completions` → routed to TrustGate ✅
- **`sdk.passports.create()`** → hits `/v1/passports` → routed to Lucid-L2 ✅
- **`sdk.receipts.list()`** → hits `/v1/receipts` → routed to Lucid-L2 ✅
- **`sdk.match.compute()`** → hits `/v1/match` → routed to Lucid-L2 ✅

**Zero SDK code changes required.** The reverse proxy is transparent.

---

## 8. Phase 6: Deprecate Lucid-L2 Inference Endpoints (half day)

### 8.1 Endpoints to Deprecate in Lucid-L2

From `offchain/src/routes/lucidLayerRoutes.ts`:
- `POST /v1/run/inference` — replaced by TrustGate `/v1/chat/completions`
- `POST /v1/chat/completions` — replaced by TrustGate

### 8.2 Deprecation Strategy

1. Add deprecation header: `Deprecation: true` + `Sunset: 2026-06-01`
2. Log warning on each call: `⚠️ /v1/run/inference is deprecated. Use TrustGate endpoint.`
3. After sunset date: return `410 Gone` with migration instructions
4. Eventually: remove the routes entirely

### 8.3 Remove from Lucid-L2

After sunset, delete:
- `offchain/src/services/executionGateway.ts`
- `offchain/src/services/computeClient.ts`
- Related route handlers in `lucidLayerRoutes.ts`
- `MODEL_ALIASES` dictionary

**Keep** in Lucid-L2 (imported from `@lucid/passport` instead of local):
- Update Lucid-L2 to import `@lucid/passport` for its passport CRUD endpoints
- This means both TrustGate and Lucid-L2 use the same `packages/passport/` package

---

## 9. Migration Checklist

### Pre-Migration
- [x] Audit all SDK consumers — confirm none bypass `api.lucid.foundation`
- [x] Export `passports.json` from Lucid-L2 file store
- [x] Verify TrustGate Postgres connection is healthy
- [x] Document current MODEL_ALIASES → LiteLLM model name mapping (30+ entries in model-router.ts)

### Phase 1: Package Extraction ✅ COMPLETE
- [x] Create `packages/passport/` directory structure
- [x] Copy `passportStore.ts` types to `types.ts`
- [x] Copy `matchingEngine.ts` → `matching-engine.ts` (fix imports)
- [x] Copy `policyEngine.ts` → `policy-engine.ts` (fix imports)
- [x] Copy `computeRegistry.ts` → `compute-registry.ts`
- [x] Copy `hash.ts`, `canonical-json.ts`, `schemaValidator.ts`, JSON schemas
- [x] Write `index.ts` barrel export
- [x] Write `package.json` + `tsconfig.json`
- [x] Run `tsc --noEmit` — verified clean compilation ✅
- [x] Port tests — 7/7 vitest tests pass ✅
- [x] Fixed npm workspace issue (created 8 missing `package.json` files)

### Phase 2: Postgres Backend ✅ COMPLETE
- [x] Create migration `002_passport_store.sql`
- [x] Implement Postgres `PassportStore` class (with `initPassportStore(queryFn)` pattern)
- [x] Write unit tests (7/7 pass via vitest)
- [x] Data migration script created (`scripts/migrate-passports-to-postgres.ts`)
- [ ] Run data migration on production Postgres (requires deployment)
- [ ] Verify passport counts match (requires deployment)

### Phase 3: TrustGate Integration ✅ COMPLETE
- [x] Create `model-router.ts` with `resolveModel()` — fast path + passport path
- [x] Build `PASSPORT_TO_LITELLM` mapping — 30+ entries (OpenAI, Anthropic, Google, Mistral, Meta, DeepSeek)
- [x] Update `v1.ts` to call `resolveModel()` with `X-Lucid-Passport` / `X-Lucid-Policy` headers
- [x] Initialize `PassportStore` in `server.ts` via `initPassportStore(passportQuery)`
- [x] Initialize receipt events in `server.ts` via `initReceiptEvents(passportQuery)`
- [x] Enriched response includes `lucid: { passport_id, compute_passport_id, policy_hash, match_explain }`
- [ ] Live test: request WITHOUT `X-Lucid-Passport` → behaves identically (requires deployment)
- [ ] Live test: request WITH `X-Lucid-Passport` → resolves correctly (requires deployment)
- [ ] Live test: invalid passport ID → returns 400 error (requires deployment)

### Phase 4: Receipt Sidecar ✅ COMPLETE
- [x] Create `receipt_events` table migration (`003_receipt_events.sql`)
- [x] Implement `emitReceiptEvent()` in TrustGate — fire-and-forget, never throws
- [x] Wire into `v1.ts` — emits after response when passport is present
- [x] Full receipt consumer in Lucid-L2 (`offchain/src/jobs/receiptConsumer.ts`) — batch polling with `FOR UPDATE SKIP LOCKED`, configurable interval/batch size, stats tracking, start/stop lifecycle
- [x] Wire `startReceiptConsumer()` into Lucid-L2 server bootstrap — `initReceiptConsumer()` + `startReceiptConsumer()` called in `index.ts`, graceful shutdown on SIGTERM/SIGINT
- [ ] Live end-to-end test: passport request → receipt event → Lucid-L2 processes (requires deployment)

### Phase 5: Reverse Proxy ✅ CONFIG COMPLETE
- [x] Create nginx config (`infra/nginx-gateway-proxy.conf`) — SSL, rate limiting, SSE streaming
- [x] Fixed nginx: port 4010 (matches server.ts), domain `api.lucid.foundation`, catch-all → Lucid-L2, `/v1/embeddings` route added
- [ ] Deploy nginx/Cloudflare config for `api.lucid.foundation` (requires infra deployment)
- [ ] Live test: SDK `run.inference()` → TrustGate (requires deployment)
- [ ] Live test: SDK `passports.create()` → Lucid-L2 (requires deployment)
- [ ] Live test: SDK `receipts.list()` → Lucid-L2 (requires deployment)

### Phase 6: Deprecation ✅ CODE COMPLETE
- [x] Deprecation headers added to Lucid-L2 inference routes (`Deprecation: true`, `Sunset: 2026-06-01`, `Link` successor header)
  - `POST /v1/run/inference` — headers present ✅
  - `POST /v1/chat/completions` — headers present ✅
- [x] Lucid-L2 imports from `@raijinlabs/passport` instead of local services
  - Package renamed `@lucid/passport` → `@raijinlabs/passport`, `private: true` removed, `publishConfig` added
  - `Lucid-L2/offchain/package.json`: `@raijinlabs/passport: "^0.1.0"` (replaces broken `file:` cross-repo reference)
- [x] **GitHub Packages publishing infra** (2026-02-20):
  - [x] `.npmrc` in `lucid-cloud` + `Lucid-L2` (scoped `@raijinlabs` → `npm.pkg.github.com`)
  - [x] CI workflow `.github/workflows/publish-passport.yml` — auto-publishes on push to `main` when `packages/passport/**` changes
  - [ ] First publish: push passport changes to `main` or trigger workflow manually (requires deployment)
  - [ ] Verify `npm install` in Lucid-L2 resolves from GitHub Packages (requires `NODE_AUTH_TOKEN` in CI)
- [x] Receipt retention cron added — runs every 6 hours, deletes processed events older than 30 days
- [ ] Monitor for any remaining direct Lucid-L2 inference calls (requires deployment)
- [ ] After grace period (2026-06-01): return `410 Gone`, then remove deprecated routes

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `matchComputeForModel` behaves differently after extraction | High | Copy verbatim, run identical test suite |
| PassportStore Postgres queries slower than in-memory | Medium | Add connection pooling, cache hot passports in LRU |
| SDK consumers hit TrustGate without valid API key | High | Return clear 401 error, document migration |
| Receipt events table grows unbounded | Low | Add retention policy: DELETE WHERE processed = true AND created_at < now() - interval '30d' |
| LiteLLM model mapping incomplete | Medium | Fallback: if not in PASSPORT_TO_LITELLM, pass passport ID as-is to LiteLLM |
| Reverse proxy adds latency | Low | <1ms for nginx local proxy; Cloudflare Workers for edge |

---

## 11. Rollback Plan

Each phase is independently rollbackable:

1. **Phase 1-2**: Package exists but nothing depends on it → just don't deploy
2. **Phase 3**: Remove `resolveModel()` call from v1.ts → revert to `body.model` directly
3. **Phase 4**: Stop receipt event emission → Lucid-L2 continues using its own receipt flow
4. **Phase 5**: Remove nginx routing rules → everything goes to Lucid-L2 as before
5. **Phase 6**: Re-enable deprecated routes in Lucid-L2

**Nuclear rollback**: Point `api.lucid.foundation` back to Lucid-L2 directly. Zero data loss — the Postgres passports table is additive, not destructive.

---

## Summary

| Day | What Ships | Repo |
|-----|-----------|------|
| 1-2 | `packages/passport/` with all extracted logic + tests | lucid-cloud |
| 3 | Postgres backend for PassportStore + data migration | lucid-cloud |
| 4 | TrustGate `model-router.ts` + v1.ts integration | lucid-cloud |
| 5 | Receipt event sidecar + reverse proxy config | lucid-cloud + infra |
| 6+ | Deprecate Lucid-L2 inference endpoints | Lucid-L2 |

**Total effort**: ~5-6 days. Zero breaking changes to LucidMerged. Zero breaking changes to SDK.