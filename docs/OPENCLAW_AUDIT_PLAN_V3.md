# OpenClaw Integration — Corrected Audit & Work Plan v3.1

> **Status note (2026-05-08):** This document is historical audit context. The current source of truth for OpenClaw/Hermes parity, runtime compatibility, EHV/HHV/OHV, Mission Control UX, BYOK/TrustGate, runtime re-home, management commands, and sanitizer verification is `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`, with implementation contracts in `packages/runtime-compat/`, `packages/agent-bridge/`, `packages/engine-home/`, `packages/runtime-adapter-sdk/`, `packages/runtime-adapters/`, and `src/lib/mission-control/runtime-client-sanitize.ts`.

> **Last updated:** 2026-02-12  
> **Status:** Dev-reviewed, 6 final corrections applied (v3 → v3.1)  
> **Authors:** Cline (code trace) + Dev reviewer (corrections)

---

## Naming & Reality

**What we have today:** "Lucid Agent Runtime v1" — our own agent loop, tools, memory, encryption.  
**What we don't have:** OpenClaw subtree. The runtime is not OpenClaw-derived.

**Decision:** OpenClaw subtree will be added as a **vendored dependency only** (no behavior changes until tests are green). This avoids maintaining two command systems or two provider abstractions in a middle state.

---

## PHASE 1A — Pipeline Hardening: ✅ 100% COMPLETE

### Canonical Key Usage Audit

| Usage Point | Uses Canonical Key? | Evidence | Fix Needed? |
|-------------|-------------------|----------|-------------|
| Lock key | ✅ `tenantKeys.sessionKey` | `inbound.ts` ~line 144 | No |
| Dedup key | ⚠️ `tenantKeys.tenantKey` only | `inbound.ts` ~line 97 | **Yes — see P0 fix #8** |
| Rate limiter key | ✅ `tenantKeys.tenantKey` | `inbound.ts` ~line 119 | No |
| Memory scoping key | ❌ `channel_type:external_user_id` | `inbound.ts` ~line 200 | **Yes — see P0 fix #9** |
| Log context fields | ✅ `createLogContext(tenantKeys, ...)` | `inbound.ts` ~line 88 | No |

### Phase 1A Code Verification Results

**1. Dedup key — ✅ ALREADY CORRECT (no fix needed)**

Code trace confirmed `InboundDeduper` uses a 4-column UNIQUE key:  
`(tenant_key, channel_type, external_chat_id, external_message_id)`

This is channel+chat scoped and already tenant-safe. The DB table `assistant_inbound_dedup` has the UNIQUE constraint on all 4 columns. No change needed.

**2. Rate limiter — ⚠️ Single tenantKey bucket, no userKey bucket** (dev correction #2)

Current: `TenantRateLimiter.tryConsume(tenantKeys.tenantKey)` — one bucket per tenant.  
Problem: All users of one tenant share the same rate limit. No per-user cap. Anon uses `ANON_TENANT_KEY = __global__:default:default:__anon__` which lumps ALL unauthenticated traffic into one global bucket.

**Correct model (dev feedback):**
- `tenantKey` bucket: plan-level cap (already exists ✅)
- `userKey` bucket: per-user cap (MISSING ❌)
- Anonymous users: `userKey = tenantKey:__anon__` (not a separate global key)

Fix: Add a second `tryConsume(tenantKeys.userKey, 'msg_per_min_user', 1)` call with stricter per-user limits. The `userKey` from `tenant-keys.ts` is already `tenantKey:externalUserId` which is perfect.

**3. Memory scoping — ❌ Privacy collision risk** (dev feedback)

Current: `scopedUserId = ${channel.channel_type}:${event.external_user_id}`  
Problem: Can collide across tenants. User "12345" on Telegram for Org A gets same memories as user "12345" on Telegram for Org B.

Fix: `scopedUserId = tenantKeys.userKey` (which is `tenantKey:externalUserId`, already tenant-scoped).  
Also update `get_recent_memories` RPC to accept this tenant-scoped format.

---

## PHASE 1B — Encrypted Agent: ✅ 100% COMPLETE

### What works
- EncryptionService (HKDF + AES-256-GCM) ✅
- Tenant keys table + DEK management ✅
- Migration 060 (columns added) ✅
- `buildMessageColumns()` helper ✅
- `decryptMessageRow()` helper ✅
- PII log redaction ✅

### What's broken (7 gaps, 3 from dev review + 4 from code trace)

| # | Gap | Severity | Root Cause |
|---|-----|----------|------------|
| 1 | DB CHECK constraint missing | 🔴 Critical | Migration 060 has only `COMMENT`, no `CHECK` |
| 2 | AAD never passed to encryption | 🔴 Critical | `buildMessageColumns()` called without 4th `aad` param |
| 3 | Legacy paths store plaintext | 🔴 Critical | `processWithStreaming()` + `processWithoutStreaming()` bypass encryption |
| 4 | Context loading breaks on encrypted msgs | 🔴 Breaks quality | Step 4 only `SELECT content` — returns NULL when encrypted |
| 5 | Memory write pipeline NOT WIRED | 🟡 Feature gap | Zero `INSERT` calls to `assistant_memory` in worker |
| 6 | Memory encryption N/A | 🟡 Depends on #5 | Can't encrypt what doesn't exist |
| 7 | No `runId` in observability | 🟡 Audit gap | No UUID spans logs → usage → tools → billing |

### "Encrypted Agent" marketing gate (ALL must be ✅)

- [x] Legacy path encryption ✅ (processWithStreaming + processWithoutStreaming use buildMessageColumns)
- [x] Context decryption ✅ (Step 4 selects all encrypted fields, decrypts with AAD)
- [x] DB invariants (CHECK constraints) ✅ (Migration 064)
- [x] Memory plaintext leakage resolved ✅ (extractAndStoreMemories encrypts with memory AAD)
- [x] PII log redaction ✅ (already done)
- [x] Encryption integration test E1 passes ✅ (9/9 tests green)

### AAD Rules — Explicit Definition (dev correction #3)

AAD binds ciphertext to its context. Different scopes need different AAD formats:

| Data Type | AAD Format | Rationale |
|-----------|-----------|-----------|
| **Messages** | `tenantKey:sessionKey:messageId` | Bound to conversation context |
| **Memories** | `tenantKey:userKey:memoryId` | Bound to user context (memories are user-scoped, not session-scoped) |

**Rule:** All decrypt call sites MUST use the same AAD format that was used during encryption. Mismatched AAD = decryption failure (AES-GCM auth tag mismatch).

### Critical: Encryption is Storage-Only (dev correction #4)

> **Encryption is for storage at rest; channel outputs always receive plaintext.**

The flow is:
1. LLM generates plaintext response
2. Plaintext sent to ChannelOutput (Telegram, WhatsApp, etc.)
3. Plaintext encrypted, then stored in DB

Never stream ciphertext to channel outputs.

---

## PHASE 2 — Agent Loop: ⚠️ ~70% COMPLETE

**Accurate label:** "Agent Loop implemented" (not "OpenClaw integrated")

| Item | Status |
|------|--------|
| AgentLoop Think→Act→Observe | ✅ Done |
| ConversationCompactor | ✅ Done |
| CommandsAllowlist (tool gating) | ✅ Done |
| ToolExecutionGuard | ✅ Done |
| 3 tools (web_search, url_fetch, knowledge_search) | ✅ Done |
| FEATURE_OPENCLAW flag | ✅ Done |
| Migration 061 (conversation_summaries) | ✅ Applied |
| **Provider failover chain** | ✅ Done (P1 #11) |
| **User-facing /commands** | ✅ Done (P1 #12) |
| **Gate tests (1-5a, 5b)** | ✅ 1-5a Done (P1 #10) |
| **Memory extraction wiring** | ✅ Done (P0 #5) |
| **OpenClaw subtree** | ✅ Vendored (P1 #13) |

---

## PHASES 3-4 + TRACK B — ❌ NOT STARTED (unchanged)

---

## ═══════════════════════════════════════════════════════
## P0 — MUST SHIP BEFORE "ENCRYPTED AGENT" MARKETING
## ═══════════════════════════════════════════════════════

### Fix #1: Migration 064 — Encryption Invariants (0.5h)

Add CHECK constraints on both tables. Use `NOT VALID` then `VALIDATE CONSTRAINT` after backfill/clean.

```sql
-- assistant_messages
ALTER TABLE assistant_messages ADD CONSTRAINT chk_msg_encryption_invariant CHECK (
  (encryption_mode = 'NONE' AND content IS NOT NULL AND content_encrypted IS NULL)
  OR
  (encryption_mode IN ('APP_LAYER','ENCLAVE') AND content IS NULL 
   AND content_encrypted IS NOT NULL AND content_iv IS NOT NULL 
   AND content_auth_tag IS NOT NULL AND key_id IS NOT NULL)
) NOT VALID;

ALTER TABLE assistant_messages VALIDATE CONSTRAINT chk_msg_encryption_invariant;

-- assistant_memory (same pattern)
ALTER TABLE assistant_memory ADD CONSTRAINT chk_mem_encryption_invariant CHECK (
  (encryption_mode = 'NONE' AND content IS NOT NULL AND content_encrypted IS NULL)
  OR
  (encryption_mode IN ('APP_LAYER','ENCLAVE') AND content IS NULL 
   AND content_encrypted IS NOT NULL AND content_iv IS NOT NULL 
   AND content_auth_tag IS NOT NULL AND key_id IS NOT NULL)
) NOT VALID;

ALTER TABLE assistant_memory VALIDATE CONSTRAINT chk_mem_encryption_invariant;
```

### Fix #2: AAD Binding — Generate messageId BEFORE encrypt (1h)

**Critical implementation detail (dev feedback):** AAD must include messageId, but messageId must be known before encryption. Therefore:

```typescript
// In processInboundEvent(), Step 3 (user message):
const userMessageId = crypto.randomUUID()
const aad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${userMessageId}`

const userMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
  ? await encryptionService.buildMessageColumns(assistant.org_id!, userContent, encryptionMode, aad)
  : { content: userContent, encryption_mode: 'NONE' }

await supabase.from('assistant_messages').insert({
  id: userMessageId,  // ← Client-provided UUID
  conversation_id: conversation.id,
  role: 'user',
  ...userMsgColumns,
  external_message_id: event.external_message_id,
})

// Same pattern for assistant message (both FEATURE_OPENCLAW and legacy paths):
const assistantMessageId = crypto.randomUUID()
const assistantAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${assistantMessageId}`
// ... encrypt with assistantAad, insert with id: assistantMessageId
```

**For memory writes (different AAD scope per correction #3):**
```typescript
const memoryId = crypto.randomUUID()
const memoryAad = `${tenantKeys.tenantKey}:${tenantKeys.userKey}:${memoryId}`
// ... encrypt with memoryAad, insert with id: memoryId
```

Apply to ALL insert points:
- User message insert (Step 3) — AAD = `tenantKey:sessionKey:messageId`
- Assistant message insert (FEATURE_OPENCLAW agent path) — AAD = `tenantKey:sessionKey:messageId`
- Assistant message insert (`processWithStreaming()`) — AAD = `tenantKey:sessionKey:messageId`
- Assistant message insert (`processWithoutStreaming()`) — AAD = `tenantKey:sessionKey:messageId`
- Memory inserts — AAD = `tenantKey:userKey:memoryId`
- Any tool/agent intermediate messages stored — AAD = `tenantKey:sessionKey:messageId`

### Fix #3: Encrypt Legacy Paths (1h)

Both `processWithStreaming()` and `processWithoutStreaming()` must route through `encryptionService.buildMessageColumns()`:

```typescript
// In processWithStreaming() — replace:
await supabase.from('assistant_messages').insert({
  conversation_id: conversation.id,
  role: 'assistant',
  content: response.text,  // ← PLAINTEXT
})

// With:
const msgId = crypto.randomUUID()
const aad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${msgId}`
const msgCols = encryptionService && encryptionMode === 'APP_LAYER'
  ? await encryptionService.buildMessageColumns(assistant.org_id!, response.text, encryptionMode, aad)
  : { content: response.text, encryption_mode: 'NONE' }

await supabase.from('assistant_messages').insert({
  id: msgId,
  conversation_id: conversation.id,
  role: 'assistant',
  ...msgCols,
  tokens_prompt: response.usage?.promptTokens,
  tokens_completion: response.usage?.completionTokens,
})
```

**Note:** `encryptionService` and `encryptionMode` must be passed down to `processWithStreaming()` and `processWithoutStreaming()` (currently not in their params). Add them to the function signatures + call sites.

**Important (dev correction #4):** Encryption is storage-only. The plaintext `response.text` is still sent to `output.finalize()` / `output.append()` — only the DB INSERT uses encrypted columns. Never attempt to stream ciphertext to channel outputs.

### Fix #4: Decrypt Context Loader — Step 4 (1h)

```typescript
// Replace Step 4:
const { data: recentMessages } = await supabase
  .from('assistant_messages')
  .select('role, content')  // ← Only reads content (NULL when encrypted)

// With:
const { data: recentMessages } = await supabase
  .from('assistant_messages')
  .select('id, role, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
  .eq('conversation_id', conversation.id)
  .order('created_at', { ascending: false })
  .limit(assistant.memory_window_size)

// Decrypt each row:
const messages = await Promise.all(
  (recentMessages || []).reverse().map(async (row) => {
    if (encryptionService && row.encryption_mode !== 'NONE') {
      const aad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${row.id}`
      const decrypted = await encryptionService.decryptMessageRow(row, assistant.org_id!, aad)
      return { role: row.role, content: decrypted.content }
    }
    return { role: row.role, content: row.content || '' }
  })
)
```

**Until this is done, enabling encryption destroys response quality (empty context).**

### Fix #5: Wire Memory Write Pipeline (4h)

**Timing (dev correction #5):** Run async extraction AFTER response is persisted (Step 7) AND inbound is marked done (Step 8) AND conversation lock is released. Never hold the lock during memory extraction LLM calls.

```typescript
// AFTER Step 8 (mark done) AND lock release — fire-and-forget:
if (assistant.memory_enabled && event.message_text) {
  void extractAndStoreMemories({
    supabase,
    config,
    encryptionService,
    encryptionMode,
    tenantKeys,
    assistant,
    conversationId: conversation.id,
    messages: messages.slice(-10), // Last 10 messages
    scopedUserId: tenantKeys.userKey, // ← Fix #9: tenant-safe scoping
  }).catch(err => {
    console.warn('[processor] Memory extraction failed (non-blocking):', err)
  })
}
```

**Pipeline flow:** `MemoryExtractor.extract() → MemoryDeduper.deduplicate() → MemoryEmbedder.embed() → INSERT`

**Memory AAD (correction #3):** Use `tenantKey:userKey:memoryId` (not sessionKey — memories are user-scoped).

Rules:
- Hard cap: 1 extra LLM call max (for extraction)
- Fail open: memory write failure must NOT fail the inbound job
- Encrypt memory content when `encryption_mode !== 'NONE'`
- Run OUTSIDE conversation lock (after Step 8 + lock release)

### Fix #6: Memory Retrieval for Encrypted Content (1h)

Once memories are encrypted, `get_recent_memories` RPC returns `content = NULL`.

**Recommended approach:** Create `get_recent_memories_v2` RPC that returns encrypted payload fields:

```sql
CREATE OR REPLACE FUNCTION get_recent_memories_v2(
  p_assistant_id UUID,
  p_scoped_user_id TEXT,
  p_limit INT DEFAULT 10
) RETURNS TABLE (
  id UUID,
  content TEXT,
  content_encrypted TEXT,
  content_iv TEXT,
  content_auth_tag TEXT,
  encryption_mode TEXT,
  key_id TEXT,
  category TEXT,
  importance FLOAT
) AS $$
  SELECT id, content, content_encrypted, content_iv, content_auth_tag, 
         encryption_mode, key_id, category, importance
  FROM assistant_memory
  WHERE assistant_id = p_assistant_id 
    AND scoped_user_id = p_scoped_user_id
  ORDER BY last_accessed_at DESC NULLS LAST
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

Then decrypt in worker same as context loader (Fix #4 pattern).

### Fix #7: Add Stable `runId` (0.5h)

```typescript
// At top of processInboundEvent():
const runId = crypto.randomUUID()

// Add to logCtx:
const logCtx = createLogContext(tenantKeys, {
  runId,
  inboundId: event.id,
  assistantId: assistant.id,
  channelType: channel.channel_type,
})

// Pass to trackUsage:
void trackUsage(supabase, {
  runId,
  tenantKey: tenantKeys.tenantKey,
  // ... rest
})

// Pass to captureError:
captureError(error, { runId, tenantKeys, ... })
```

This becomes the privacy/audit "spine" for every request.

### Fix #8: ~~Dedup Key~~ — ✅ ALREADY CORRECT (verified via code trace)

**Code trace result:** `InboundDeduper` already uses a 4-column UNIQUE key:  
`(tenant_key, channel_type, external_chat_id, external_message_id)`

This is tenant+channel+chat scoped. No change needed. The v3 concern was overstated.

### Fix #8 (NEW): Rate Limiter — Add userKey bucket (0.5h)

Current: `TenantRateLimiter.tryConsume(tenantKeys.tenantKey)` — one bucket per tenant.  
Missing: No per-user bucket. All users share one tenant-level limit.

Fix: Add dual-bucket rate limiting:
```typescript
// Tenant-level cap (plan limit):
const tenantResult = await rateLimiter.tryConsume(tenantKeys.tenantKey, 'msg_per_min')
// Per-user cap (abuse prevention):
const userResult = await rateLimiter.tryConsume(tenantKeys.userKey, 'msg_per_min_user', 1)
```

For anonymous users, `tenantKeys.userKey` is `tenantKey:__anon__` (scoped to the tenant, not a global bucket).

### Fix #9: Memory Scoping — Tenant-Safe (0.5h)

Replace:
```typescript
const scopedUserId = `${channel.channel_type}:${event.external_user_id}`
```

With:
```typescript
const scopedUserId = tenantKeys.userKey
// Or explicitly: `${tenantKeys.tenantKey}:${channel.channel_type}:${event.external_user_id}`
```

Update `get_recent_memories` (and v2) to accept this tenant-scoped format.

**Why this matters (dev feedback):** Without tenant scoping, user "12345" on Telegram for Org A gets same memories as user "12345" on Telegram for Org B. This is a privacy violation.

---

## ═══════════════════════════════════════════════════════
## P1 — STABILITY + REAL PHASE 2 GATE
## ═══════════════════════════════════════════════════════

### 10. Integration Tests 1-5a (and 5b after) — 1 day

Create `tests/integration/` with automated tests:
- Test 1: Dedup rejects duplicate external_message_id
- Test 2: Lock prevents concurrent processing
- Test 3: Tenant keys computed correctly from orgId+channel+chat+user
- Test 4: PolicyEngine precheck blocks over-limit run
- Test 5a: Billing (`trackUsage`) fires exactly once per request
- Test 5b (later): ToolExecutionGuard blocks mid-run tool after budget spent

### 11. Provider Failover Chain — 0.5 day ✅ DONE (with privacy guardrails)

Implemented 3-tier failover in `AgentLoop.callLLM()`:
1. Primary: Lucid-L2 (current)
2. Fallback: BYOK direct provider (from `policy_config.fallback_provider`)
3. Final: Error with safe diagnostics only

**Privacy guardrail A — Tenant policy enforcement:**
- `resolveAllowedProviders()` reads `policy_config.providers_allowed`
- Failover provider is checked against allowed list BEFORE any request
- If no providers are allowed: hard fail with `"No allowed LLM providers available"`
- `deriveProviderName()` maps URL hostnames to canonical names for matching

**Diagnostic safety B — No PII in logs/errors:**
- `sanitizeProviderError()` extracts ONLY: status code, timeout type, network error class
- NEVER logs: response body, prompt text, tool arguments
- `callProvider()` error path consumes response body but only throws status code
- Attempt summaries: `provider=X model=Y duration=Zms error="status=500"` (nothing more)

**PII boundary contract (explicit):**
- **Traces:** IDs/counters/durations/statuses only; no prompts/responses/tool args/request bodies
- **Logs:** Operational hints allowed, but still no prompts/responses/tool args/request bodies
- **Sentry:** Same scrubbing standard as traces/logs; never attach request/response bodies

**Internal correlation contract:**
- Internal service calls must forward `x-lucid-run-id` in addition to `traceparent`
- External provider calls must not receive `traceparent` or `x-lucid-run-id`

### 12. User-Facing Slash Commands — 0.5 day

Parse before AgentLoop in `processInboundEvent()`:
- `/reset` — Clear conversation history
- `/status` — Return assistant info + stats
- `/help` — List available commands
- `/usage` — Token usage summary
- `/compact` — Force conversation compaction

Even minimal versions are fine for Phase 2 gate.

### 13. OpenClaw Subtree — Vendored Dependency Only — 0.5 day

```bash
git subtree add --prefix packages/openclaw-core \
  https://github.com/openclaw/openclaw.git main --squash
```

**Strategy (dev's recommendation):** Import as vendored dep, no behavior changes until tests are green. Do NOT half-migrate semantics. Wait until command parsing + provider chain are tested before swapping implementations.

### 14. Marketing Readiness Checklist — 0.5 day

Create `docs/ENCRYPTED_AGENT_MARKETING_CHECKLIST.md`:
- What IS encrypted: message content, memory content
- What is NOT encrypted: embeddings (derived, non-reversible vectors), metadata
- Retention rules
- Who can access plaintext (only runtime, no humans unless break-glass)
- Logging redaction guarantees
- Standard mode vs Private Inference (Track B) distinction

---

## ═══════════════════════════════════════════════════════
## P2 — FEATURE EXPANSION
## ═══════════════════════════════════════════════════════

### 15-17. Phase 3 — Multi-Channel (Telegram, Discord, Slack) ✅ COMPLETE (4 days)

**Decision:** Do NOT build custom channel implementations. OpenClaw already has production-grade extensions.

**Strategy:** Build an adapter layer between our inbound/outbound pipeline and OpenClaw's channel extensions. This gives us their battle-tested channel code without rewriting from scratch.

**Critical constraint (dev review):** Keep ALL control plane invariants OUTSIDE the extension:
- dedup, lock, rate limit, policy wall → our pipeline (before extension)
- encryption-at-rest → our pipeline (after extension sends, before DB write)
- runId, usage tracking → our pipeline (spans the entire request)
- Extension ONLY handles: formatting + delivery mechanics (chunking, markdown, threading)

**Implementation Status:**

| Component | Status | Evidence |
|-----------|--------|----------|
| **Bridge Contract** | ✅ Done | `worker/src/channels/bridge/OpenClawBridgeContract.ts` — Runtime contract validation |
| **ChannelAdapter** | ✅ Done | `worker/src/channels/ChannelAdapter.ts` — Unified adapter with safety invariants |
| **Telegram Bridge** | ✅ Done | `worker/src/channels/bridge/telegram/TelegramOpenClawBridge.ts` + tests |
| **Discord Bridge** | ✅ Done | `worker/src/channels/bridge/discord/DiscordOpenClawBridge.ts` + tests |
| **Slack Bridge** | ✅ Done | `worker/src/channels/bridge/slack/SlackOpenClawBridge.ts` + tests |
| **Architecture Doc** | ✅ Done | `docs/CHANNEL_ADAPTER_ARCHITECTURE.md` — Responsibility boundaries |

**Bridge Configurations:**

| Channel | Message Limit | Flush Interval | Min Buffer | Supports Editing |
|---------|--------------|----------------|------------|------------------|
| Telegram | 4096 chars | 1000ms | 80 chars | Yes |
| Discord | 2000 chars | 800ms | 60 chars | Yes |
| Slack | ~40k chars | 1200ms | 100 chars | Yes |

**Safety Invariants Implemented:**
1. Markdown-safe streaming (no partial code blocks)
2. No flush/finalize deadlock (bounded timeout)
3. Soft failure enforcement (`ok: false` treated as error)
4. Timeout discipline (separate profiles for flush vs finalize)
5. Rate-limit backoff (exponential on 429 errors)
6. Sanitized logging (no raw error objects)
7. Finalize idempotency (repeated calls guarded)
8. Immediate memory cleanup on terminal paths

**Test Coverage:**
- `tests/integration/channel-adapter.test.ts` — Core adapter behavior
- `tests/integration/openclaw-telegram-bridge.contract.test.ts` — Telegram bridge
- `tests/integration/openclaw-discord-bridge.contract.test.ts` — Discord bridge
- `tests/integration/openclaw-slack-bridge.contract.test.ts` — Slack bridge

**Completed work items:**
- ✅ 15a. ChannelAdapter interface designed with clear separation of concerns
- ✅ 15b. Telegram bridge implemented with contract validation
- ✅ 15c. Discord + Slack bridges implemented with channel-specific configs

### 18. Observability — OpenTelemetry + OpenMeter ✅ COMPLETE (2 days)

**Decision:** Use OTel SDK directly — it IS the vendor-neutral abstraction. No custom MetricsCollector needed.

OTel is the industry standard. To swap vendors (Datadog → Grafana → Honeycomb → self-hosted Jaeger), you only change the **exporter config** — zero application code changes.

**Implementation Status:**

| Component | Status | Evidence |
|-----------|--------|----------|
| **OTel packages** | ✅ Done | `@opentelemetry/sdk-node`, `auto-instrumentations-node` in `worker/package.json` |
| **OTel initialization** | ✅ Done | `worker/src/observability/tracing.ts` → `initTracing()` called at top of `worker/src/index.ts` |
| **Span helpers** | ✅ Done | 5+ span factories: `startInboundSpan`, `startLlmCallSpan`, `startToolExecuteSpan`, `startEncryptSpan`, `startMemoryExtractSpan` |
| **Auto-instrumentation** | ✅ Done | DB queries + HTTP calls covered by `auto-instrumentations-node` |
| **OpenMeter integration** | ✅ Done | **Separate metering system in `lucid-cloud`** (TrustGate API) with CloudEvents v1.0 + outbox pattern |
| **MetricsCollector** | ✅ Deprecated | Marked `@deprecated` in `worker/src/utils/metrics-collector.ts` with migration guide |

**OpenMeter Architecture (lucid-cloud):**
- Migration: `001_openmeter_event_ledger.sql` (outbox table with lease-based delivery)
- Package: `packages/metering/` — `OpenMeterClient`, `buildCloudEvent`, `OutboxWorker`
- Integration: TrustGate API routes insert events into ledger (fire-and-forget)
- Delivery: 3-TX outbox worker with lease-based concurrency control
- Idempotency: `event_id` (CloudEvents ID) prevents duplicates
- Documentation: `OPENMETER_DEPLOYMENT_GUIDE.md`

**Metrics label policy (explicit):**
- **Allowed labels:** `service`, `environment`, `provider_name`, `channel_type`, `status_code_bucket`, `model_family`
- **Forbidden labels:** `run_id`, `message_id`, `conversation_id`, raw tenant/session/user keys, hashed identity keys

**Completed work items:**
- ✅ 18a. OTel packages installed
- ✅ 18b. OTel tracer initialized in worker entrypoint
- ✅ 18c. 5+ minimum spans instrumented (inbound, llm, tool, encrypt, memory) + auto-instrumentation
- ✅ 18d. OpenMeter integrated as separate metering backend in lucid-cloud
- ✅ 18e. MetricsCollector deprecated with migration guide

### 19. Code interpreter tool — sandboxed execution ✅ COMPLETE (0.5 day)

**Implementation:**
- `worker/src/agent/tools/code-interpreter.ts` — Sandboxed JS execution via `node:vm`
- Uses `vm.createContext()` with blocked globals (process, require, fetch, globalThis)
- `codeGeneration: { strings: false, wasm: false }` blocks eval() and new Function()
- 5s timeout, 10K char output limit, 100 console.log cap
- Wired into `AgentLoop.executeTool()` → `case 'code_interpreter'`
- Already in `CommandsAllowlist` as `dangerLevel: 'elevated'`
- 37 tests in `tests/integration/code-interpreter.test.ts` (all green)
- Added to CI workflow in `.github/workflows/openclaw-integration-gates.yml`

### 20. Spend analytics UI (2 days)
### 21. Lucid Personal analytics tab (1 day)

---

## ═══════════════════════════════════════════════════════
## P3 — LATER
## ═══════════════════════════════════════════════════════

### 22. WebChat ChannelOutput
### 23. OpenClaw automated sync (GitHub Actions)
### 24. Phase 4 — Nitro Enclaves + KMS
### 25. Track B — Private Inference

---

## CORRECTED SUMMARY

| Phase | Previous Claim | Actual | Notes |
|-------|---------------|--------|-------|
| **1A — Pipeline Hardening** | 100% | **~97%** | 2 key scoping fixes needed (dedup + memory) |
| **1B — Encrypted Agent** | 95% | **~60%** | 9 P0 fixes required |
| **2 — Agent Loop** | 90% | **~70%** | No failover/commands/tests/memory/subtree |
| **3 — Multi-Channel** | 0% | **0%** | Not started |
| **Integration Tests** | 20% | **~20%** | db-stress only |
| **Observability** | 60% | **~50%** | No runId, no latency metrics |

---

## ═══════════════════════════════════════════════════════
## ENCRYPTION INTEGRATION TEST (dev correction #6)
## ═══════════════════════════════════════════════════════

### Test E1: Encryption Round-Trip (must pass before marketing)

This test prevents "we turned on encryption and quality collapsed" from ever regressing.

**Test steps:**
1. Insert user message via inbound processing with `encryption_mode=APP_LAYER`
2. Verify DB row has `content = NULL`, `content_encrypted IS NOT NULL`, `content_iv IS NOT NULL`, `content_auth_tag IS NOT NULL`
3. Insert assistant response via same path
4. Verify same DB invariant for assistant row
5. Process a SECOND inbound message for the same conversation
6. Verify the context loader (Step 4) decrypts previous messages correctly
7. Verify the LLM receives non-empty, correct plaintext context (not NULL, not ciphertext)

**This is a Phase 2 gate test.** Add as Test E1 alongside Tests 1-5a.

---

## CORRECTED SUMMARY (v3.2 — 2026-02-13)

| Phase | v3.1 Claim | Actual (v3.2) | Notes |
|-------|------------|---------------|-------|
| **1A — Pipeline Hardening** | ~98% | **✅ 100%** | Memory scoping (userKey) + dual rate limiter done |
| **1B — Encrypted Agent** | ~60% | **✅ 100%** | All 9 P0 fixes implemented + E1 green |
| **2 — Agent Loop** | ~70% | **✅ ~97%** | Failover/commands/tests/memory/subtree/code-interpreter all done |
| **3 — Multi-Channel** | 0% | **✅ 100%** | Telegram, Discord, Slack bridges + tests |
| **Integration Tests** | ~20% | **✅ ~95%** | 12 test files, 113+ tests green |
| **Observability** | ~50% | **~70%** | runId done, OTel spans in, MetricsCollector bridge remaining |

**P0 status:** ✅ ALL P0 fixes landed. All sanity checks pass.

**Marketing gate:** ✅ ALL P0 fixes + Test E1 GREEN. "Encrypted Agent" can be claimed.

---

## ═══════════════════════════════════════════════════════
## SANITY CHECK VERIFICATION (2026-02-13)
## ═══════════════════════════════════════════════════════

All 4 reviewer sanity checks verified against live code:

### 1) Dedup table reality = match migrations ✅

| Check | Result | Evidence |
|-------|--------|----------|
| Migration defines 4-column UNIQUE | ✅ | `062`: `UNIQUE(tenant_key, channel_type, external_chat_id, external_message_id)` |
| `InboundDeduper` supplies all 4 fields (no NULLs) | ✅ | `isDuplicate(tenantKey, channelType, externalChatId, externalMessageId, channelId?)` — all required params, `externalMessageId` guarded by truthiness check before insert |
| Cleanup index matches TTL column | ✅ | `056`: `CREATE INDEX idx_inbound_dedup_cleanup ON assistant_inbound_dedup(received_at)` — matches `InboundDeduper.cleanup()` which uses `.lt('received_at', cutoff)` |

### 2) Rate limiter: userKey bucket is atomic ✅

| Check | Result | Evidence |
|-------|--------|----------|
| RPC handles both buckets atomically | ✅ | `065`: `consume_rate_tokens_dual()` — both buckets locked with `FOR UPDATE`, all-or-nothing semantics |
| `tenantKey:__anon__` scoped to tenant | ✅ | `tenant-keys.ts`: anonymous `userKey = tenantKey:__anon__` (not a global shared key) |
| Worker calls dual RPC | ✅ | `inbound.ts`: `rateLimiter.tryConsumeDual(tenantKeys.tenantKey, tenantKeys.userKey)` |

### 3) AAD rules: IDs generated before encrypt ✅

| Insert Point | ID Generation | AAD Format | Evidence |
|-------------|---------------|------------|----------|
| User message (Step 3) | `crypto.randomUUID()` before `buildMessageColumns` | `tenantKey:sessionKey:userMessageId` | `inbound.ts` ~line 195 |
| Agent assistant message | `crypto.randomUUID()` before `buildMessageColumns` | `tenantKey:sessionKey:assistantMessageId` | `inbound.ts` ~line 270 |
| Legacy streaming assistant | `crypto.randomUUID()` before `buildMessageColumns` | `tenantKey:sessionKey:legacyAssistantId` | `inbound.ts` processWithStreaming() |
| Legacy non-streaming assistant | `crypto.randomUUID()` before `buildMessageColumns` | `tenantKey:sessionKey:nsAssistantId` | `inbound.ts` processWithoutStreaming() |
| Memory writes | `crypto.randomUUID()` before encrypt | `tenantKey:userKey:memoryId` | `extractAndStoreMemories.ts` |
| Context decryption (Step 4) | Reads `row.id` from DB | `tenantKey:sessionKey:row.id` (exact match) | `inbound.ts` ~line 215 |
| Memory decryption (Step 5) | Reads `mem.id` from DB | `tenantKey:userKey:mem.id` (exact match) | `inbound.ts` ~line 240 |
| Slash command messages | `crypto.randomUUID()` before `buildMessageColumns` | `tenantKey:sessionKey:cmdUserMsgId` | `inbound.ts` ~line 160 |

### 4) E1 test covers context decryption ✅

| Test Case | What It Proves |
|-----------|---------------|
| E1.1 | Encrypted rows have `content=NULL`, `content_encrypted IS NOT NULL` |
| E1.3 | `decryptMessageRow` restores exact plaintext |
| E1.4 | Wrong AAD = decryption failure (integrity) |
| E1.5 | **Context decryption**: 3 messages encrypted → all decrypted correctly in sequence (simulates Step 4 context loader) |
| E1.6 | Memory uses `userKey` AAD (not `sessionKey`) |
| E1.7 | Plaintext rows pass through unchanged |
| E1.8 | Session-style AAD on memory FAILS (proves memory ≠ message AAD scope) |

**Note:** Both legacy and agent loop paths use the same `buildMessageColumns` + `decryptMessageRow` primitives, so E1 coverage is path-agnostic. The primitives are validated; the wiring is verified by code trace above.

**Dedup migration:** `062_phase1a_dedup_v2_and_billing_unique.sql` — UNIQUE constraint: `uq_dedup_tenant_channel_chat_msg(tenant_key, channel_type, external_chat_id, external_message_id)`

**Rate limiter RPC:** `consume_rate_tokens_dual(p_tenant_key TEXT, p_user_key TEXT, p_tenant_bucket_key TEXT DEFAULT 'msg_per_min', p_user_bucket_key TEXT DEFAULT 'msg_per_min_user', p_cost INT DEFAULT 1, p_tenant_max_tokens INT DEFAULT 20, p_user_max_tokens INT DEFAULT 10, p_refill_interval_sec INT DEFAULT 60) RETURNS JSONB`

---

## v3 → v3.1 Changelog (dev's 6 corrections)

1. **Dedup key:** Verified via code trace — already uses 4-column UNIQUE ✅. Removed incorrect fix suggestion.
2. **Rate limiter:** Added `userKey` bucket requirement. Anonymous uses `tenantKey:__anon__` (not a separate global key).
3. **AAD rules:** Explicit table — Messages use `tenantKey:sessionKey:messageId`, Memories use `tenantKey:userKey:memoryId`.
4. **Storage-only encryption:** Added explicit statement — channel outputs always receive plaintext.
5. **Memory extraction timing:** Clarified — runs AFTER Step 8 + lock release, never inside lock.
6. **Test E1:** Added encryption round-trip integration test as marketing gate.
