# Plan: LiteLLM Replaces llm-proxy in Lucid-L2

## Current State (As-Is)

```
LucidMerged (chat/agents)
  → LUCID_API_BASE_URL → Lucid-L2 Execution Gateway
    → resolves model (passport or proxy alias)
    → for proxy models → LLM_PROXY_URL (port 8001)
      → Lucid's own Express llm-proxy-server.ts
        → reads OPENAI_API_KEY, ANTHROPIC_API_KEY, etc. from env
        → transforms for non-OpenAI providers (Anthropic Messages API, Google Gemini API)
        → forwards to provider

LucidMerged (BYOK)
  → byok-provider.ts detects provider from model name
  → if OpenAI-compatible + org has key → createOpenAI({ baseURL: provider, apiKey: decrypted })
  → if non-compatible (Anthropic/Google/Cohere) → IGNORED, falls back to Lucid-L2 → llm-proxy
  → BYOK keys stored encrypted in Supabase but never reach LiteLLM

LucidMerged (external API consumers)
  → LucidGateway Keys → LiteLLM Admin API (/key/generate, /key/delete)
  → External apps hit LUCIDGATEWAY_PROXY_URL directly with virtual keys
  → LiteLLM handles rate limits, budgets, model restrictions

TrustGate (lucid-cloud)
  → Scaffolded Fastify wrapper around LiteLLM
  → Has: tenant resolution, quota checks, OpenMeter metering, guardrails
  → NOT connected to any live request path
```

**Problems:**
1. Two separate LLM proxy services (llm-proxy + LiteLLM) doing similar work
2. BYOK keys for Anthropic/Google/Cohere are stored but never used
3. No unified metering — llm-proxy has zero metering, LiteLLM has its own
4. No unified key/quota management for internal traffic
5. TrustGate investment is wasted (metering, guardrails scaffolded but unused)

---

## Target State (To-Be)

```
LucidMerged (all AI traffic)
  → LUCID_API_BASE_URL → Lucid-L2 Execution Gateway
    → resolves model (passport or proxy alias)
    → for proxy models → LLM_PROXY_URL → TrustGate
      → tenant resolution (from passport or org context in headers)
      → quota/rate-limit enforcement
      → OpenMeter metering (fire-and-forget)
      → guardrails (request-policy)
      → forwards to LiteLLM (LITELLM_BASE_URL)
        → LiteLLM routes to provider using:
          a) Shared platform keys (default)
          b) Org's BYOK key (via LiteLLM virtual key per org)
        → Returns OpenAI-compat response

LucidMerged (BYOK)
  → When org saves a BYOK key:
    1. Encrypt + store in Supabase (existing)
    2. Create/update LiteLLM virtual key for that org+provider
       with the BYOK key as the credential
  → byok-provider.ts simplified:
    - ALL models route through Lucid-L2 (no direct provider connections)
    - Org context passed in headers → TrustGate resolves → uses org's LiteLLM key

LucidMerged (external API consumers)
  → Same as today: LiteLLM virtual keys
  → But now metered through TrustGate too
```

---

## Migration Phases

### Phase 0: Pre-requisites / Validation

**Goal:** Confirm LiteLLM can handle everything llm-proxy does today.

| Task | Details |
|------|---------|
| Verify LiteLLM model support | Confirm all models in llm-proxy's PASSPORT_MODEL_MAP + WELL_KNOWN_MODELS are available in LiteLLM's model list. LiteLLM supports 100+ providers natively. |
| Verify Anthropic/Google routing | LiteLLM handles Anthropic Messages API and Google Gemini natively — no custom transforms needed (unlike llm-proxy). Confirm with test calls. |
| Verify streaming | LiteLLM supports SSE streaming in OpenAI format. Confirm streaming works through `/v1/chat/completions?stream=true`. |
| Deploy LiteLLM with all provider keys | Ensure LiteLLM instance has `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc. configured. |

**Deliverable:** Smoke test script that sends chat completion to LiteLLM for each provider and confirms response.

---

### Phase 1: TrustGate as Middleware (Activate Existing Scaffolding)

**Goal:** Make TrustGate the entry point, forwarding to LiteLLM.

#### 1a. Fix TrustGate `model-router.ts`

Currently a stub. Replace with proper routing:

```typescript
// modules/trustgate/src/router/model-router.ts
export function chooseProvider(model: string): "litellm" {
  // All models route through LiteLLM now
  // LiteLLM handles provider detection internally
  return "litellm"
}
```

This stays as-is — LiteLLM IS the universal backend. The router's role is to decide if a request should go to LiteLLM or a custom backend (future: self-hosted models).

#### 1b. Add Streaming Support to `litellm-client.ts`

Current `litellm-client.ts` has no streaming. Add:

```typescript
// modules/trustgate/src/providers/litellm-client.ts
export async function litellmChatCompletionStream(
  input: ChatCompletionInput & { stream: true }
): AsyncGenerator<SSEChunk> {
  // POST to LITELLM_BASE_URL/v1/chat/completions with stream: true
  // Parse SSE and yield chunks
}
```

#### 1c. Add Org Context Header Forwarding

TrustGate needs to pass org/tenant info to LiteLLM so it can select the right virtual key:

```typescript
// In v1.ts route handler:
const orgId = extractOrgFromRequest(request) // from JWT or API key
const litellmApiKey = await getOrgLiteLLMKey(orgId) // org's virtual key
// Forward to LiteLLM with org's virtual key in Authorization header
```

#### 1d. Deploy TrustGate

- Set `LITELLM_BASE_URL` to point to the running LiteLLM instance
- Set up health checks
- Expose on a stable URL (e.g., `trustgate.internal.lucid.foundation`)

**Deliverable:** TrustGate running, forwarding `/v1/chat/completions` to LiteLLM, with metering active.

---

### Phase 2: Point Lucid-L2 at TrustGate Instead of llm-proxy

**Goal:** Swap the `LLM_PROXY_URL` to point at TrustGate.

#### 2a. Update Lucid-L2 Environment

```bash
# Before:
LLM_PROXY_URL=http://localhost:8001  # llm-proxy Express server

# After:
LLM_PROXY_URL=https://trustgate.internal.lucid.foundation  # TrustGate → LiteLLM
```

#### 2b. Update `computeClient.ts` llmproxy Runtime

The current `llmproxy` runtime in `computeClient.ts` uses a non-standard format (`/invoke/model/{model_id}` with `{ prompt, parameters }` body). LiteLLM uses standard OpenAI format.

**Option A (Recommended):** Reuse the `openai` runtime for LiteLLM traffic:

```typescript
// In executionGateway.ts, change LLM_PROXY_COMPUTE_META:
const LLM_PROXY_COMPUTE_META = {
  // ...
  runtimes: [
    { name: 'openai', version: '1.0' },  // was 'llmproxy'
  ],
  // ...
};
```

Since LiteLLM exposes `/v1/chat/completions` in standard OpenAI format, the existing `openai` runtime handler works perfectly.

**Option B:** Update `toLLMProxyFormat()` and `parseLLMProxyResponse()` to use OpenAI format (more code changes, less clean).

#### 2c. Pass Model + Passport Context to TrustGate

The `executionGateway.ts` currently sends bare requests. Add headers for TrustGate:

```typescript
// When building inference request for proxy models:
config.headers = {
  'X-Lucid-Org-Id': request.org_id,
  'X-Lucid-Passport-Id': model_passport_id,
  'X-Lucid-Trace-Id': trace_id,
};
```

TrustGate reads these for tenant resolution and metering attribution.

**Deliverable:** Internal chat traffic flows: Lucid-L2 → TrustGate → LiteLLM → Provider.

---

### Phase 3: BYOK Through LiteLLM Virtual Keys

**Goal:** BYOK keys route through LiteLLM instead of direct provider connections.

#### 3a. BYOK Key Sync to LiteLLM

When a user saves/updates/deletes a BYOK key in LucidMerged:

```typescript
// src/app/api/orgs/[id]/provider-keys/route.ts (POST handler)
// After saving encrypted key to Supabase:
await syncBYOKToLiteLLM(orgId, provider, decryptedKey)

async function syncBYOKToLiteLLM(orgId: string, provider: string, apiKey: string) {
  // Create or update a LiteLLM virtual key for this org+provider
  const response = await fetch(`${LUCIDGATEWAY_PROXY_URL}/key/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LUCIDGATEWAY_MASTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key_alias: `byok-${orgId}-${provider}`,
      // LiteLLM supports per-key provider credentials:
      litellm_params: {
        api_key: apiKey,
      },
      models: getModelsForProvider(provider), // ['gpt-4o', 'gpt-4', ...] for openai
      metadata: {
        org_id: orgId,
        is_byok: true,
        provider: provider,
      },
    }),
  })
  // Store the generated virtual key hash linked to org+provider
}
```

#### 3b. Simplify `byok-provider.ts`

Remove all direct provider connections. All traffic goes through Lucid-L2:

```typescript
// src/lib/ai/byok-provider.ts (simplified)
export async function getBYOKModel(
  orgId: string,
  modelId: string,
): Promise<BYOKResult> {
  // ALL models route through Lucid-L2
  // BYOK is handled at the LiteLLM layer via virtual keys
  // The org context is passed in headers, TrustGate resolves the right key
  return {
    isBYOK: await hasBYOKKeyForModel(orgId, modelId),
    provider: 'lucid',
    model: getLucidModel(modelId),
  }
}
```

#### 3c. Pass Org Context from LucidMerged → Lucid-L2

The chat route needs to pass `orgId` so Lucid-L2 can forward it to TrustGate:

```typescript
// src/app/api/ai/chat/route.ts
// When calling getLucidModel, pass org context:
const model = getLucidModel(selectedModel, {
  orgId: session.orgId,  // New field
})
```

This requires updating `providers.ts` custom fetch to add `X-Lucid-Org-Id` header.

**Deliverable:** BYOK keys for ALL providers (including Anthropic, Google, Cohere) work through LiteLLM. No more direct provider connections from LucidMerged.

---

### Phase 4: Decommission llm-proxy

**Goal:** Remove the old Lucid-L2 llm-proxy Express server.

| Task | Details |
|------|---------|
| Verify zero traffic | Monitor llm-proxy access logs for 1 week after Phase 2 |
| Remove `llm-proxy-server.ts` | Delete from Lucid-L2 |
| Clean up `computeClient.ts` | Remove `toLLMProxyFormat()`, `parseLLMProxyResponse()`, and the `llmproxy` runtime case (or keep as alias for `openai`) |
| Update Lucid-L2 docs | Remove references to llm-proxy, document TrustGate/LiteLLM as the proxy layer |
| Remove provider API keys from L2 env | `OPENAI_API_KEY`, etc. should only be in LiteLLM's config now |

---

### Phase 5: Unified Metering & Observability

**Goal:** Single source of truth for all AI usage.

| Task | Details |
|------|---------|
| TrustGate meters ALL traffic | Internal (via Lucid-L2) and external (via LucidGateway keys) |
| OpenMeter aggregation | Both paths write to the same OpenMeter event stream |
| Spend analytics in UI | `spend-analytics.tsx` reads from OpenMeter instead of LiteLLM `/spend/` |
| Cost attribution | Per-org, per-model, BYOK vs platform key breakdown |

---

## Architecture: Before vs After

### Before (Current)
```
                    ┌─────────────────┐
LucidMerged ──────→│ Lucid-L2 Gateway │
(chat/agents)       │                  │
                    │ resolves model   │
                    │                  │
                    │ proxy models ────┼──→ llm-proxy (Express:8001)
                    │                  │     ├ PROVIDER_MAP (10 providers)
                    │                  │     ├ PASSPORT_MODEL_MAP
                    │                  │     ├ WELL_KNOWN_MODELS
                    │ passport models ─┼──→ vLLM / TGI / TensorRT
                    └─────────────────┘     └ env: OPENAI_API_KEY, etc.

                                               (NO metering)
                                               (NO BYOK support)
                                               (NO quota enforcement)

LucidMerged ──────→ Provider API directly (BYOK, OpenAI-compat only)
(BYOK)              └ Anthropic/Google BYOK keys: UNUSED

LucidMerged ──────→ LiteLLM Admin API (key management only)
(gateway keys)
External Apps ────→ LiteLLM Proxy (virtual keys, rate limits)

TrustGate ────────→ LiteLLM (scaffolded, NOT connected)
```

### After (Target)
```
                    ┌─────────────────┐
LucidMerged ──────→│ Lucid-L2 Gateway │
(ALL AI traffic)    │                  │
                    │ resolves model   │
                    │                  │
                    │ proxy models ────┼──→ TrustGate (Fastify)
                    │                  │     ├ tenant resolution (X-Lucid-Org-Id)
                    │                  │     ├ quota enforcement
                    │                  │     ├ OpenMeter metering
                    │ passport models ─┼──→ vLLM / TGI / TensorRT
                    └─────────────────┘     ├ guardrails
                                            └──→ LiteLLM Proxy
                                                  ├ Platform keys (default)
                                                  ├ BYOK virtual keys (per org)
                                                  ├ Rate limits & budgets
                                                  └──→ Provider APIs

LucidMerged ──────→ LiteLLM Admin API (key management + BYOK sync)
(gateway keys)
External Apps ────→ TrustGate → LiteLLM (virtual keys)

                    llm-proxy: DECOMMISSIONED
                    byok-provider.ts direct routing: REMOVED
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LiteLLM doesn't support a model that llm-proxy handles | Phase 0 validation. LiteLLM supports 100+ providers — unlikely. |
| Latency increase (extra hop through TrustGate) | TrustGate is lightweight Fastify. Same-datacenter deployment. Measure p95 before/after. |
| BYOK key sync failure | Keep encrypted keys in Supabase as source of truth. Re-sync on demand. |
| TrustGate goes down | Health checks + auto-restart. Fallback: point LLM_PROXY_URL directly at LiteLLM (skip TrustGate). |
| Streaming breaks through TrustGate | Phase 1b specifically adds streaming. Test with long-context models. |

---

## Files Changed Per Phase

### Phase 1 (TrustGate Activation)
- `lucid-cloud/modules/trustgate/src/providers/litellm-client.ts` — Add streaming
- `lucid-cloud/apps/trustgate-api/src/routes/v1.ts` — Add streaming route, org header extraction
- `lucid-cloud/apps/trustgate-api/src/server.ts` — Deploy config

### Phase 2 (Swap LLM_PROXY_URL)
- `Lucid-L2/.env` — `LLM_PROXY_URL` → TrustGate URL
- `Lucid-L2/offchain/src/services/executionGateway.ts` — Change runtime to `openai`, add headers
- `Lucid-L2/offchain/src/services/computeClient.ts` — Optional: alias `llmproxy` → `openai`

### Phase 3 (BYOK via LiteLLM)
- `LucidMerged/src/app/api/orgs/[id]/provider-keys/route.ts` — Add LiteLLM key sync
- `LucidMerged/src/lib/ai/byok-provider.ts` — Simplify to always route through Lucid-L2
- `LucidMerged/src/lib/ai/providers.ts` — Add `X-Lucid-Org-Id` header to custom fetch
- `LucidMerged/src/app/api/ai/chat/route.ts` — Pass orgId to model constructor

### Phase 4 (Decommission)
- `Lucid-L2/offchain/src/services/llm-proxy/` — Delete
- `Lucid-L2/offchain/src/services/computeClient.ts` — Remove `llmproxy` cases
- `Lucid-L2/offchain/src/services/executionGateway.ts` — Remove MODEL_ALIASES proxy type

### Phase 5 (Metering)
- `LucidMerged/src/app/api/orgs/[id]/lucidgateway-keys/spend/route.ts` — Read from OpenMeter
- `LucidMerged/src/components/gateway/spend-analytics.tsx` — Update data source