# OpenClaw SaaS Integration Spec — v2.0 (Comprehensive)

> **Status note (2026-05-08):** This spec is still useful design background, but it predates the completed Hermes/OpenClaw runtime-parity pass. Current production behavior is engine/runtime agnostic: OpenClaw and Hermes share centralized channels, skills/plugins, memory policy, TrustGate routing, RuntimeExecutionContext, management commands, capability heartbeats, and EHV/HHV/OHV state projection. Use `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md` plus `packages/runtime-compat/`, `packages/runtime-adapter-sdk/`, `packages/runtime-adapters/`, and `packages/engine-home/` as the current source of truth.

> **Status:** LOCKED — All design questions resolved. Both sides signed off.
> **Date:** 2026-02-12 (updated from v1.4 2026-02-11)
> **Phases:** 1A (pipeline hardening) → 1B (encrypted agent) → 2 (agent loop + compaction) → 3 (multi-channel) → 4 (enclaves) + Track B (private inference)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture: Control Plane vs Runtime](#2-architecture-control-plane-vs-runtime)
3. [OpenClaw Module Decision Table](#3-openclaw-module-decision-table)
4. [Existing Worker Audit](#4-existing-worker-audit)
5. [Phase 1A — Pipeline Hardening](#5-phase-1a--pipeline-hardening)
6. [Phase 1B — Encrypted Agent Foundations](#6-phase-1b--encrypted-agent-foundations)
7. [Phase 2 — Agent Loop + Compaction](#7-phase-2--agent-loop--compaction)
8. [Phase 3 — Multi-Channel Expansion](#8-phase-3--multi-channel-expansion)
9. [Phase 4 — Nitro Enclaves + KMS Attestation](#9-phase-4--nitro-enclaves--kms-attestation)
10. [Track B — Private Inference (Parallel)](#10-track-b--private-inference-parallel)
11. [Memory System](#11-memory-system)
12. [OpenClaw Compatibility Strategy](#12-openclaw-compatibility-strategy)
13. [Subtree Sync & Upgrade Strategy](#13-subtree-sync--upgrade-strategy)
14. [Integration Tests (Gate Criteria)](#14-integration-tests-gate-criteria)
15. [Rollout Guardrails](#15-rollout-guardrails)
16. [Data Model & DB Checklist](#16-data-model--db-checklist)
17. [Observability Checklist](#17-observability-checklist)
18. [Migration Numbering](#18-migration-numbering)
19. [Glossary](#19-glossary)

---

## 1. Executive Summary

### Guiding Principle

> **Borrow domain/runtime logic. Own platform/control-plane primitives.**

OpenClaw is a local-first personal AI assistant (MIT licensed). Our SaaS needs tenant isolation, plan enforcement, billing, and SLO-grade observability — responsibilities that upstream projects rarely maintain "for free" because their assumptions differ.

We do NOT "use OpenClaw for everything." We use OpenClaw for **agent runtime semantics** and keep our worker as the **SaaS control plane**.

### Why Not Replace Everything?

"Upstream maintenance is free" is a trap for SaaS:
- OpenClaw upstream is optimized for single Gateway on one host
- If we outsource control-plane primitives, we inherit upstream assumptions and churn
- The "maintenance tax" moves from "writing code" to "integration churn + regressions + SLO incidents"

### Two Encryption Systems (Explicitly Separate)

| System | Algorithm | Scope | Status |
|--------|-----------|-------|--------|
| **Channel secrets** | AES-256-GCM (`ENCRYPTION_KEY` env var) | Bot tokens, WhatsApp API keys | ✅ Working |
| **Message + Memory encryption** | Envelope encryption (CMK → per-tenant DEK) | `assistant_messages`, memory content | Phase 1B |

> **Decision:** Do NOT unify them. Document this so nobody "simplifies" later.

---

## 2. Architecture: Control Plane vs Runtime

### We Keep (Control Plane) — SaaS platform responsibilities

| Module | File(s) | Reason |
|--------|---------|--------|
| **ConversationLock** | `worker/src/locks/ConversationLock.ts` | Per-session concurrency primitive. OpenClaw's "Gateway lock" prevents two gateways on one host — different concern. |
| **TenantRateLimiter** | `worker/src/guards/TenantRateLimiter.ts` | Plan/tenant/user rate limiting. OpenClaw has provider cooldown, not SaaS billing enforcement. |
| **InboundDeduper** | `worker/src/guards/InboundDeduper.ts` | Webhook retry idempotency. SaaS-specific. |
| **PolicyEngine** | `worker/src/guards/PolicyEngine.ts` | Run budgets, feature flags, command allowlists. |
| **ToolExecutionGuard** | `worker/src/guards/ToolExecutionGuard.ts` | Mid-run enforcement (tool/LLM call budgets, wall time). |
| **Channel delivery** | `worker/src/channels/` | TelegramOutput + WhatsApp official API. See §8 for Telegram chunking adoption. |
| **Observability** | `worker/src/logging/`, `worker/src/monitoring/` | Tenant-correlated structured logs + Sentry. |
| **Billing/usage** | `packages/lucid-adapters/src/billing/` | Token tracking for plan enforcement + invoicing. |
| **Worker lifecycle** | `worker/src/index.ts` | Express server + polling loops. Railway deployment model. |
| **Memory system** | `worker/src/memory/` | Supabase + pgvector + RLS. See §11 for rationale. |
| **Provider throttling** | `worker/src/rate-limit/RateLimiter.ts` | Bottleneck wrapper for outbound API rate limiting (Lucid-L2, Telegram, WhatsApp). Separate from tenant rate limiting. |

### We Import (Runtime Semantics) — OpenClaw provides real leverage

| Module | Source | Status |
|--------|--------|--------|
| **Commands** | OpenClaw `src/commands/` | Phase 2 — behind allowlist |
| **Session orchestration** | OpenClaw `src/sessions/` | Phase 2 — backed by our Supabase stores |
| **Context compaction** | OpenClaw `src/memory/` + our `ConversationCompactor` | Phase 2 |
| **Agent loop** | OpenClaw `src/agents/` (Pi agent) | Phase 2 — Think→Act→Observe with tool budgets |
| **Provider failover** | OpenClaw `src/providers/` | Phase 2 — auth rotation + fallback chain |
| **Streaming/chunking logic** | OpenClaw streaming utilities | Phase 3+ — output formatting quality |

### We Hard-Gate (Danger Surface)

| Feature | Default | Gate Criteria |
|---------|---------|---------------|
| **Skills/plugins** | DENY | Curated only, version-pinned, reviewed per tenant/env |
| **Browser/CDP** | DENY | Internal/dev tenants only |
| **Cron** | SHIPPED | Implemented via `croner` library (5-field + timezone/DST). Stored in `agent_scheduled_tasks` (Supabase outbox). |
| **TTS** | DENY | Per-tenant budgeting + rate limits required first |
| **Auto-reply** | DENY | Tenant-level caps + audit logs |

### Critical Tweak: Sessions ≠ Locks

Never assume OpenClaw sessions replace ConversationLock. Keep lock outside runtime. OpenClaw sessions are state/routing. Locks are concurrency primitives.

---

## 3. OpenClaw Module Decision Table

Comprehensive mapping of every OpenClaw `src/` module to our decision:

| OpenClaw Module | Decision | Rationale |
|-----------------|----------|-----------|
| `src/agents/` (Pi agent) | **USE** | Core agent loop — Think→Act→Observe. Integrate as runtime library. |
| `src/sessions/` | **USE** (adapted) | Session orchestration, but backed by our Supabase stores via adapters. |
| `src/commands/` | **USE** | Command parser + built-in commands. Behind our CommandsAllowlist. |
| `src/memory/` | **SKIP** (use ours) | Our memory is Supabase+pgvector+RLS. Disable OpenClaw memory: `plugins.slots.memory="none"`. |
| `src/providers/` | **USE** (extended) | Provider failover chain. We add Lucid-L2 as primary provider. |
| `src/routing/` | **USE** (adapted) | Message routing. Adapted for multi-tenant session keys. |
| `src/channels/telegram/` | **EVALUATE Phase 3+** | grammY-based, better markdown/chunking. Adopt chunking utilities only, not full stack initially. |
| `src/channels/whatsapp/` | **SKIP** | Uses Baileys (unofficial API). SaaS must use official WhatsApp Business API. |
| `src/channels/discord/` | **USE Phase 3** | discord.js-based. Behind policy wall + tenant caps. |
| `src/channels/slack/` | **USE Phase 3** | Bolt-based. Behind policy wall + tenant caps. |
| `src/channels/signal/` | **DEFER** | Only if we truly need and can support ops + legal compliance. |
| `src/channels/imessage/` | **DEFER** | Do not adopt the upstream channel module directly. Lucid now ships iMessage as a product channel through its own shared BYOB + hosted provider-plane architecture instead. |
| `src/channels/line/` | **DEFER** | LINE channel. Low priority for Western markets. |
| `src/config/` | **USE** (adapted) | TypeBox-validated config. Merge with our Zod env-based config. Support OpenClaw's `openclaw.json` format as alternative. |
| `src/gateway/` | **SKIP** | WebSocket control plane — local-first concept. We have our own worker. |
| `src/security/` | **PARTIAL** | DM pairing + allowlists are useful. Sandboxing we implement ourselves. |
| `src/media/` | **USE Phase 5** | Media pipeline (images, audio, video). Gated. |
| `src/media-understanding/` | **USE Phase 5** | Transcription, OCR, image description. Gated. |
| `src/link-understanding/` | **USE Phase 5** | URL→summary before passing to LLM. Gated. |
| `src/plugin-sdk/` | **USE** (curated only) | Plugin SDK interface. No dynamic installs. |
| `src/plugins/` | **USE** (curated only) | Built-in plugins. Version-pinned. |
| `src/hooks/` | **USE** | Lifecycle hooks (pre/post message). Wire into our pipeline. |
| `src/acp/` | **SHIPPED (hybrid)** | Cross-agent messaging shipped via `send_message_to_agent` tool (synthetic inbound events). Gateway ACP deferred. |
| `src/cron/` | **SHIPPED (hybrid)** | Scheduling shipped via `schedule_task` tool + `croner` library. Bypasses upstream year-calc bug (#10035). |
| `src/tts/` | **GATED Phase 5** | ElevenLabs TTS. Per-tenant budgeting required. |
| `src/auto-reply/` | **GATED Phase 4** | Auto-reply rules. Tenant caps + audit logs. |
| `src/browser/` | **GATED Phase 4** | CDP-based browser control. Internal/dev only. |
| `src/pairing/` | **USE** (in security) | DM access control — already covered. |
| `src/markdown/` | **USE** | Markdown processing for channel output. |
| `src/shared/`, `src/types/`, `src/utils/` | **USE** | Shared types and utilities. |
| `src/logging/` | **SKIP** (use ours) | SaaS needs tenant-correlated tracing. |
| `src/daemon/`, `src/wizard/`, `src/cli/`, `src/macos/`, `src/terminal/`, `src/tui/` | **SKIP** | Local-first desktop/CLI features. Not relevant to SaaS. |
| `src/canvas-host/`, `src/node-host/` | **SKIP** | Visual workspace / local host features. |
| `src/polls/` | **USE Phase 5** | Polls feature for channels. Low priority. |
| `src/compat/` | **USE** | Backwards compatibility layer. |
| `src/infra/` | **SKIP** (use ours) | Our Railway/Docker infra is different. |

---

## 4. Existing Worker Audit

Our worker already has significant infrastructure. **Don't reinvent what works.**

### What We Have (Keep)

```
worker/src/
├── adapters/
│   ├── supabase.ts          ✅ DB adapter (claim, renew, mark)
│   └── lucid-l2.ts          ✅ LLM adapter
├── agent/                   ✅ NEW (Phase 2 scaffolds)
│   ├── AgentLoop.ts
│   ├── CommandsAllowlist.ts
│   └── ConversationCompactor.ts
├── cache/
│   └── l1.ts                ✅ In-memory L1 cache
├── channels/
│   ├── ChannelOutput.ts     ✅ Channel output interface
│   ├── telegram/TelegramOutput.ts   ✅ Telegram streaming
│   └── whatsapp/
│       ├── WhatsAppBusinessAPI.ts   ✅ WhatsApp Business (official)
│       └── WhatsAppOutput.ts        ✅ WhatsApp output
├── guards/                  ✅ NEW (Phase 1A scaffolds)
│   ├── InboundDeduper.ts
│   ├── PolicyEngine.ts
│   ├── TenantRateLimiter.ts
│   └── ToolExecutionGuard.ts
├── locks/
│   └── ConversationLock.ts  ✅ Advisory lock (FNV hash)
├── logging/
│   └── logger.ts            ✅ Structured logging
├── memory/
│   ├── index.ts             ✅ Memory module
│   ├── MemoryDeduper.ts     ✅ Deduplication
│   ├── MemoryEmbedder.ts    ✅ Embedding generation
│   ├── MemoryExtractor.ts   ✅ LLM-based extraction
│   ├── MemoryRetriever.ts   ✅ RAG retrieval (pgvector)
│   └── NullMemory.ts        ✅ No-op adapter
├── monitoring/
│   └── sentry.ts            ✅ Sentry integration
├── processors/
│   ├── inbound.ts           ✅ Inbound processor
│   └── outbound.ts          ✅ Outbound processor
├── rate-limit/
│   └── RateLimiter.ts       ✅ Bottleneck (provider/channel throttling)
├── config.ts                ✅ Zod-validated config
└── index.ts                 ✅ Express server + polling loops
```

### Adapter Layer (packages/lucid-adapters/src/)

```
packages/lucid-adapters/src/
├── index.ts                 ✅ Package exports
├── runtime.ts               ✅ createLucidRuntime() bootstrap
├── types.ts                 ✅ Shared types
├── auth/
│   └── multi-tenant-context.ts  ✅ org/project/env scoping
├── billing/
│   └── usage-tracker.ts     ✅ Token tracking for billing
├── crypto/
│   └── encryption-service.ts ✅ Phase 1B encryption
├── monitoring/
│   └── sentry-hook.ts       ✅ Error monitoring
├── providers/
│   └── lucid-l2-provider.ts ✅ Unified LLM gateway
└── storage/
    ├── supabase-config-store.ts    ✅ Assistant config from Supabase
    ├── supabase-message-store.ts   ✅ Message history → Supabase
    └── supabase-session-store.ts   ✅ Sessions → Supabase
```

---

## 5. Phase 1A — Pipeline Hardening (Ship Now)

### 5.1 Multi-Tenant from Day 1

Canonical keys (compute first, everywhere):

```
tenantKey  = orgId + ":" + projectId + ":" + envId
sessionKey = tenantKey + ":" + channelType + ":" + externalChatId
userKey    = tenantKey + ":" + externalUserId (optional but recommended)
```

> **Key format rule:** Components MUST NOT contain the `:` separator. If any ID could contain `:`, URL-encode it first. Consider storing a `hash64(key)` index column if composite keys exceed ~200 chars.

### 5.2 Inbound Pipeline Order (v1.3 corrected)

```
Step 0:   Compute tenantKey/sessionKey/userKey (needed by dedup + all subsequent steps)
Step 1:   Idempotency check (InboundDeduper) — BEFORE lock & heartbeat
Step 1.5: Load tenant crypto policy + key handle (Phase 1B)
Step 2:   ConversationLock.withLock(sessionKey, fn, timeout)
Step 3:   TenantRateLimiter.checkAndConsume(tenantKey, userKey)
Step 4:   Load config (assistant + channel + tenant flags)
Step 4.5: Decrypt inputs if encrypted (Phase 1B)
Step 5:   Policy precheck (PolicyEngine.evaluate)
Step 6:   Execute path:
          if FEATURE_OPENCLAW → runOpenClawPipeline()
          else → legacy streamLucidL2() / callLucidL2Fetch()
Step 7:   Persist + metrics + billing (encrypt outputs if needed)
Step 8:   Mark inbound done (inside lock)
```

### 5.3 Inbound Deduplication

**Table:** `assistant_inbound_dedup`

```sql
CREATE TABLE assistant_inbound_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  channel_id UUID REFERENCES assistant_channels(id),
  external_message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_chat_id TEXT NOT NULL,
  UNIQUE(tenant_key, channel_type, external_chat_id, external_message_id)
);
CREATE INDEX idx_inbound_dedup_cleanup ON assistant_inbound_dedup(received_at);
```

**File:** `worker/src/guards/InboundDeduper.ts`
- `isDuplicate(tenantKey, channelType, externalChatId, externalMessageId)` → INSERT ... ON CONFLICT DO NOTHING
- Handle Postgres error code `23505` (unique violation) as duplicate
- TTL cleanup: DELETE WHERE received_at < now() - interval '24 hours' (pg_cron daily at 03:00)
- **Fallback:** If pg_cron is not enabled, cleanup runs as a daily worker task via `setInterval` in `worker/src/index.ts`

> **Design note:** Uniqueness is `(tenant_key, channel_type, external_chat_id, external_message_id)` — tenant-scoped by design. `external_message_id` is only unique per-chat on some channels (e.g., Telegram), so `external_chat_id` is required to prevent false dedup across chats. `channel_id` is kept as an optional FK for joins, but the safety boundary is the canonical string key.

### 5.4 Tenant Rate Limiter

**Table:** `tenant_rate_buckets`

```sql
CREATE TABLE tenant_rate_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key TEXT NOT NULL,
  user_key TEXT NOT NULL DEFAULT '__anon__',
  bucket_key TEXT NOT NULL,
  tokens_remaining INT NOT NULL,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_key, user_key, bucket_key)
);
```

**File:** `worker/src/guards/TenantRateLimiter.ts`
- `tryConsume(tenantKey, userKey, bucketKey, cost)` → atomic decrement with refill logic
- For unauthenticated users: `userKey = '__anon__'` (TEXT DEFAULT, no UUID workaround needed)

> **Design note:** All control-plane identifiers are **string-first** (`tenant_key`, `user_key`, `session_key`), not UUIDs. This aligns with the canonical key model (`orgId:projectId:envId`) and avoids UUID/string mismatches.
- **Separate from** existing Bottleneck `RateLimiter.ts` which handles provider/channel outbound throttling

### 5.5 Policy Engine + Run Budget

**File:** `worker/src/guards/PolicyEngine.ts`

```typescript
interface RunBudget {
  maxLlmCalls: number      // Phase 1: 1, Phase 2: configurable
  maxToolCalls: number     // Phase 1: 0, Phase 2: configurable
  maxWallTimeMs: number    // Default: 60000
  maxOutputTokens: number  // Default: 4096
}
```

- Loads policy from `ai_assistants.policy_config` JSONB field
- Default budget: `{ maxLlmCalls: 1, maxToolCalls: 0, maxWallTimeMs: 60000, maxOutputTokens: 4096 }`

### 5.6 Mid-Run Enforcement (Two Entry Points)

**Pre-execution:** `PolicyEngine.evaluate()` — before runtime
**Mid-run:** `ToolExecutionGuard` — during agent loop

The `ToolExecutionGuard` wraps tool registry + provider client to enforce:
- Per-tool-call allow/deny (via `CommandsAllowlist`)
- Tool call count limit
- LLM call count limit
- Token burn limit
- Wall time limit

If OpenClaw doesn't expose stable `tool:before/tool:after` hooks (confirmed: feature request exists, GitHub #7597), enforce mid-run by:
- Wrapping the tool registry passed to runtime
- Wrapping the provider client (model call wrapper)

### 5.7 NullMemory Adapter

**File:** `worker/src/memory/NullMemory.ts`
- Used when `assistant.memory_enabled = false`
- Avoids conditional memory logic scattered through inbound.ts
- Also used for OpenClaw memory: `plugins.slots.memory = "none"` (Phase 2)

### 5.8 Config Additions

**File:** `worker/src/config.ts`

```typescript
FEATURE_OPENCLAW: z.boolean().default(false)
DEDUP_TTL_HOURS: z.number().default(24)
DEFAULT_RATE_LIMIT_PER_MIN: z.number().default(20)
DEFAULT_MAX_LLM_CALLS: z.number().default(1)
DEFAULT_MAX_TOOL_CALLS: z.number().default(0)
DEFAULT_MAX_WALL_TIME_MS: z.number().default(60000)
LOCK_TIMEOUT_MS: z.number().default(10000)
TENANT_DEFAULT_MSGS_PER_MINUTE: z.number().default(60)
```

### 5.9 Fix external_channel_id Write Hotspot

Only write if value changed:
```typescript
if (channel.external_channel_id !== event.external_chat_id) {
  await supabase.from('assistant_channels')
    .update({ external_channel_id: event.external_chat_id })
    .eq('id', event.channel_id)
}
```

---

## 6. Phase 1B — Encrypted Agent Foundations

### 6.1 Encryption Modes (Per-Tenant Togglable)

| Mode | Behavior | Who uses it |
|------|----------|-------------|
| `NONE` | Plaintext `content` column. Zero overhead. | Free tier, dev environments |
| `APP_LAYER` | Encrypted with per-tenant DEK before DB write. | Pro/Business opt-in |
| `ENCLAVE` | Decryption only inside Nitro Enclave (Phase 4). | Enterprise |

### 6.2 Tenant Keys Table

```sql
CREATE TABLE tenant_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  key_version INT NOT NULL DEFAULT 1,
  encrypted_dek TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, key_version)
);
```

### 6.3 EncryptionService Interface

**File:** `packages/lucid-adapters/src/crypto/encryption-service.ts`

```typescript
interface EncryptionService {
  encrypt(tenantId: string, plaintext: string, aad?: string): Promise<EncryptedPayload>
  decrypt(tenantId: string, payload: EncryptedPayload, aad?: string): Promise<string>
  rotateKey(tenantId: string): Promise<void>
}
```

Phase 1B backend: HKDF from env master key (no AWS dependency)
Prod backend: AWS KMS `GenerateDataKey` (KMS-backed)

> **Marketing rule:** Do NOT claim "KMS/HSM-backed" until Option B is deployed to prod.

### 6.4 Message Encryption Schema

| Column | When `NONE` | When `APP_LAYER`/`ENCLAVE` |
|--------|------------|------|
| `content` | Plaintext | **NULL** |
| `content_encrypted` | NULL | Ciphertext (base64) |
| `content_iv` | NULL | IV (hex) |
| `content_auth_tag` | NULL | Auth tag (hex) |
| `encryption_mode` | `NONE` | `APP_LAYER` or `ENCLAVE` |
| `key_id` | NULL | Tenant key ID + version |

**DB CHECK constraints (enforce in migration, not just code):**

```sql
ALTER TABLE assistant_messages ADD CONSTRAINT chk_encryption_invariant CHECK (
  (encryption_mode = 'NONE' AND content IS NOT NULL AND content_encrypted IS NULL AND content_iv IS NULL AND content_auth_tag IS NULL)
  OR
  (encryption_mode IN ('APP_LAYER','ENCLAVE') AND content IS NULL AND content_encrypted IS NOT NULL AND content_iv IS NOT NULL AND content_auth_tag IS NOT NULL)
);
```

**Invariant:** If mode is `APP_LAYER`|`ENCLAVE` → `content` MUST be NULL. If mode is `NONE` → encrypted fields MUST be NULL. Never both populated. No `content_plaintext` column (security hole).

### 6.5 Memory Encryption (Vector Search Compatible + Disclosure)

- Encrypt **only** `content` column, NOT the embedding vector
- Embeddings are lossy representations, not reversible to plaintext (standard tradeoff)

> **Disclosure for marketing:** We store message/memory *content* encrypted; we may store **derived, non-reversible embeddings** for retrieval, protected by strict access controls and isolation. Marketing copy must not imply "everything is ciphertext."
- Retrieval: vector search returns top-k → decrypt `content_encrypted` for those k rows → pass to LLM

### 6.6 AAD (Additional Authenticated Data) Definition

For envelope encryption, AAD is precisely:

```
aad = tenantKey + ":" + sessionKey + ":" + messageId
```

This binds ciphertext to the correct tenant/session/message. Ciphertext cannot be replayed across contexts — decryption fails if any component of AAD mismatches.

### 6.7 PII Log Redaction

- Remove `textPreview` from processor logs
- Sanitize error messages containing user content
- Feature flag: `PII_REDACT_LOGS` (default: true in prod)

### 6.8 Marketing Claims

| Claim | Requirements | Status |
|-------|-------------|--------|
| "Encrypted in transit + at rest" | TLS + DB encryption + secrets AES-256-GCM | ✅ Already true |
| "Encrypted Agent: messages stored encrypted" | App-layer encryption + KMS/Vault keys + PII redaction + audit | Phase 1B |
| "Decrypted only inside protected runtime" | Nitro Enclaves + KMS attestation | Phase 4 |
| ~~"E2EE chat for Telegram/WhatsApp"~~ | **NEVER claim this.** Bot API receives plaintext. | ❌ Not honest |

Correct positioning: **"Encrypted Agent (server-side encryption + protected runtime)"**

> **Privacy scope clarification:**
> - **Standard mode:** Prompts may be processed by external LLM providers (via Lucid-L2). Content is encrypted at rest but decrypted for inference.
> - **Private inference (Track B):** Avoids sending plaintext to third-party providers entirely. Self-hosted model behind Lucid-L2.
> - Marketing must clearly distinguish these tiers. Do not over-claim privacy in Standard mode.

---

## 7. Phase 2 — Agent Loop + Compaction

### 7.1 ConversationCompactor

**File:** `worker/src/agent/ConversationCompactor.ts`

When conversation window exceeds `memory_window_size`:
1. Split into [older messages] + [recent N messages]
2. Summarize [older] via cheap model (gpt-4o-mini) into 200-300 token summary
3. Cache summary per conversation (invalidate on new messages)
4. Final context = [system prompt] + [summary] + [recent N messages]

Reduces token usage by 40-60% on long conversations. Separate from memory extraction.

### 7.2 Commands System

**File:** `worker/src/agent/CommandsAllowlist.ts`

- OpenClaw commands imported behind allowlist
- Per-assistant allowed commands: `/status`, `/reset`, `/model`, `/compact`, `/help`, `/usage`
- Denied by default: `/think`, `/verbose` (until Phase 3+)

### 7.3 Agent Loop (Think → Act → Observe)

**File:** `worker/src/agent/AgentLoop.ts`

- OpenClaw Pi runner with Lucid adapters
- `FEATURE_OPENCLAW` flag enabled
- Multi-step reasoning with tool calls
- Budget enforcement per run via `ToolExecutionGuard`
- Memory: our system (NullMemory for OpenClaw, our MemoryExtractor/Retriever active)

### 7.4 Provider Failover Chain

Import OpenClaw's provider abstraction:
- Lucid-L2 as primary provider
- Auth rotation + fallback chain from OpenClaw
- BYOK direct provider as optional fallback
- Provider selection constrained by tenant policy

---

## 8. Phase 3 — Multi-Channel Expansion

### 8.1 Channel Decisions

| Channel | Decision | Rationale |
|---------|----------|-----------|
| **Telegram** | Keep ours + adopt OpenClaw chunking utilities | Our TelegramOutput handles basic streaming. OpenClaw's handles: markdown fence awareness, per-channel caps, draft coalescing, retry on 429. Phase 3+: extract `splitTelegramMarkdownSafely()` utility. |
| **WhatsApp** | Keep ours (official API) | OpenClaw uses Baileys (unofficial). SaaS cannot risk account bans. |
| **Discord** | USE OpenClaw's discord.js | Behind policy wall + tenant caps |
| **Slack** | USE OpenClaw's Bolt | Behind policy wall + tenant caps |
| **Signal** | DEFER | Legal/compliance review required |
| **iMessage (upstream channel module)** | DEFER | Lucid productized iMessage through the shared channel architecture and provider-plane transport, not by adopting the upstream OpenClaw channel module directly |
| **LINE** | DEFER | Low priority for Western markets |
| **WebChat** | Build ours | Integration with Next.js web UI chat |

### 8.2 Telegram Chunking Adoption (Phase 3+)

Practical approach:
1. Extract pure utilities from OpenClaw: `splitTelegramMarkdownSafely(text)` + code-fence-aware split + cap-aware segmenter
2. Use inside our `TelegramOutput` before sending
3. This gives the biggest win (streaming/chunking quality) without channel-stack migration risk

---

## 9. Phase 4 — Nitro Enclaves + KMS Attestation

- KMS key-release bound to enclave attestation document
- "Decrypted only inside verified runtime" becomes valid marketing claim
- Swap EncryptionService backend from HKDF → KMS with attestation
- `encryption_mode = 'ENCLAVE'` tier
- Enable only for Web/API channel first (where we control UX)
- Telegram/WhatsApp: still better security, but don't call it E2EE

### Danger Features (Hard Gated in Phase 4)

| Feature | Gate | Notes |
|---------|------|-------|
| Browser control (CDP) | Internal/dev only | Off by default. Allow only curated tenants. |
| ~~Cron~~ | **SHIPPED** | Implemented via `croner` + `agent_scheduled_tasks` outbox. Bypasses upstream bug. |
| ~~ACP~~ | **SHIPPED (hybrid)** | `send_message_to_agent` tool with synthetic inbound events. Same-org only. |
| Subagent spawning | SHIPPED | `spawn_subagent` tool. Depth limit 2, children limit 5, budget slicing. |
| Auto-reply | Tenant caps + audit logs | Rules-based when agent is busy/offline |
| TTS (ElevenLabs) | Per-tenant budgeting | Cost implications |
| Link understanding | Feature flag | URL→summary before LLM |
| Media understanding | Feature flag | Image/audio description pipeline |

---

## 10. Track B — Private Inference (Parallel)

**Not chained behind enclaves — independent infrastructure workstream.**

Privacy ladder (product tiers):
1. **Standard** (fast/cheap): External LLM via Lucid-L2 gateway
2. **Private Mode**: Self-hosted model (Kimi K2.5 or other open-weight model)
3. **Max Privacy**: Customer VPC / on-prem deployment

Implementation:
- Deploy model behind Lucid-L2 as a private provider
- Tenant policy: `providers_allowed = [self_hosted]`
- Disable logging + enforce retention caps
- Separate load tests + SLOs

---

## 11. Memory System

### Decision: Option A — Keep Our Memory System

**Rationale:**

| Capability | Our System | OpenClaw |
|-----------|-----------|----------|
| Extraction | LLM-based (gpt-4o-mini), categorized (fact/preference/instruction/context), importance/confidence scoring | LLM-based, similar |
| Storage | Supabase + pgvector + RLS | Various backends (configurable) |
| Retrieval | Semantic search via `search_memory()` RPC (cosine similarity) | Similar vector search |
| Deduplication | MemoryDeduper module | Built-in |
| Embedding | MemoryEmbedder (via Lucid-L2) | Configurable |
| User scoping | `scoped_user_id = channel_type:external_user_id` | Session-based (less granular) |
| Multi-tenant isolation | Supabase RLS policies (database-level) | Plugin-dependent (application-level) |
| Access tracking | `last_accessed_at` updated on retrieval | Not standard |

**Our advantages:**
- RLS enforcement = stronger isolation guarantee
- User-scoped memories prevent cross-user leakage
- Category-based filtering enables fine-grained retrieval
- Access tracking enables future memory decay/LRU cleanup

**Explicit no-op for OpenClaw memory:**
- Disable via `plugins.slots.memory = "none"` in runtime config
- `NullMemory` adapter prevents silent writes from upstream changes
- Our MemoryExtractor/Embedder/Retriever/Deduper remain active

**Phase 2 improvement:** Add ConversationCompactor for context window management (separate from memory extraction).

---

## 12. OpenClaw Compatibility Strategy

### 12.1 Plugin SDK Compatibility

Our `plugins/sdk.ts` implements the same `extensionAPI` interface as OpenClaw's `src/plugin-sdk/`. OpenClaw plugins from `extensions/` or community can be loaded with minimal adaptation.

**Constraint:** No dynamic installs. Curated, version-pinned, reviewed only.

### 12.2 Skills Format Compatibility

Same `SKILL.md` markdown format. OpenClaw skills from ClawHub can be installed directly.

**Constraint:** Default-deny. Known malware risk in skills marketplaces.

### 12.3 Channel Interface Compatibility

Our `channels/base.ts` mirrors OpenClaw's channel abstraction. Channel extensions (Matrix, Zalo, Teams) can be ported.

### 12.4 Config Format Compatibility

Support OpenClaw's `openclaw.json` as alternative config source for users transitioning from OpenClaw.

### 12.5 OpenClaw Tool Policy

OpenClaw supports config-level tool allow/deny:
- `tools.profile` — tool profile selection
- `tools.allow` — explicit allowlist
- `tools.deny` — explicit denylist
- `tools.byProvider` — per-provider tool config

We use these to implement the policy wall partly by generating OpenClaw tool policy per tenant/plan.

> **Strict rule:** OpenClaw tool policy is **generated from PolicyEngine decisions**; tenant config never directly writes OpenClaw tool policy. PolicyEngine + ToolExecutionGuard remain the source of truth. OpenClaw `tools.allow/deny` is an output of our policy, not an input.

---

## 13. Subtree Sync & Upgrade Strategy

### 13.1 Initial Setup (Done)

```bash
git subtree add --prefix packages/openclaw-core \
  https://github.com/openclaw/openclaw.git main --squash
```

OpenClaw code lives in `packages/openclaw-core/` — untouched. Our changes live only in `packages/lucid-adapters/`, `worker/src/`, and `worker/src/agent/`.

### 13.2 Manual Sync (Phase 1-2)

```bash
git subtree pull --prefix packages/openclaw-core \
  https://github.com/openclaw/openclaw.git main --squash
```

Pull updates manually as needed while we stabilize.

### 13.3 Automated Sync (Phase 3+)

GitHub Actions workflow for weekly PR creation:

```yaml
# .github/workflows/sync-openclaw.yml
name: Sync OpenClaw Upstream
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - name: Check for updates
        id: check
        run: |
          LATEST=$(curl -s https://api.github.com/repos/openclaw/openclaw/commits/main | jq -r '.sha[:7]')
          CURRENT=$(cat packages/openclaw-core/.openclaw-version 2>/dev/null || echo "none")
          if [ "$LATEST" != "$CURRENT" ]; then
            echo "update=true" >> $GITHUB_OUTPUT
            echo "version=$LATEST" >> $GITHUB_OUTPUT
          fi
      - name: Pull updates
        if: steps.check.outputs.update == 'true'
        run: |
          git subtree pull --prefix packages/openclaw-core \
            https://github.com/openclaw/openclaw.git main --squash
          echo "${{ steps.check.outputs.version }}" > packages/openclaw-core/.openclaw-version
      - name: Create PR
        if: steps.check.outputs.update == 'true'
        uses: peter-evans/create-pull-request@v5
        with:
          title: "🔄 Sync OpenClaw upstream (${{ steps.check.outputs.version }})"
          branch: sync/openclaw-${{ steps.check.outputs.version }}
```

### 13.4 Vendor Diff Policy

- Our changes MUST live only in adapters/policy/worker
- `packages/openclaw-core/` stays pristine (subtree-managed)
- Before each upstream pull: run integration tests (§14)
- Review PR before merging — never auto-merge upstream changes

---

## 14. Integration Tests (Gate Criteria)

### Phase 2 Gate (tests 1–5a must be green)

| # | Test | Description |
|---|------|-------------|
| 1 | **Telegram happy path** | Inbound → runtime → outbound stream completes, single response persisted |
| 2 | **Command parsing** | `/reset` or `/status` flows through adapter, produces expected state change + output |
| 3 | **Session creation** | New session created with correct (tenantKey, channelType, externalChatId) indexing |
| 4 | **Billing hook fires** | Usage tracker invoked, writes token counts once (no double-charge on streaming) |
| 5a | **Precheck blocks** | Disallowed command is blocked by PolicyEngine precheck |

### Agent Loop + Tools Gate (test 5b must be green)

| # | Test | Description |
|---|------|-------------|
| 5b | **Runtime guard blocks mid-run** | ToolExecutionGuard blocks a tool call mid-agent-loop. Only testable after runtime hook injection confirmed. |

### Upstream Upgrade Gate

All tests 1–5a must pass before pulling OpenClaw subtree updates.

---

## 15. Rollout Guardrails

### Feature Flag Strategy

- Flag by **tenant + environment**, not globally
- Canary progression: 1 tenant → 5% → 25% → 100%

### Kill Switches (Immediate Disable)

- Agent loop
- Tools
- Browser
- Skills/plugins
- Cron
- TTS

### Metrics to Watch

| Metric | Threshold |
|--------|-----------|
| Dedup drop rate | Monitor effectiveness |
| p95 runtime latency | < 30s |
| Tool calls per message | Distribution, alert on outliers |
| Token burn per message | Distribution, alert on budget exhaustion |
| Supabase write volume per request | < 10 writes/request |
| Duplicate inbound events | Should trend to 0 |

---

## 16. Data Model & DB Checklist

### Tables / Indexes

| Table | Key Index | Purpose |
|-------|-----------|---------|
| `assistant_inbound_dedup` | `(tenant_key, channel_type, external_chat_id, external_message_id)` UNIQUE | Idempotency |
| `tenant_rate_buckets` | `(tenant_key, user_key, bucket_key)` UNIQUE | Rate limiting |
| `tenant_encryption_keys` | `(tenant_id, key_version)` UNIQUE | Envelope encryption |
| `assistant_messages` | Existing + encryption columns | Message storage |
| `assistant_memory` | Existing + encryption columns | Memory storage |

### Streaming Writes

- Batch/coalesce writes (don't write 200 rows for 200 stream chunks)
- Store final message + optional structured stream artifacts if needed

### Idempotency

- Inbound event idempotency key: `(tenantKey, channelType, externalChatId, externalMessageId)`
- **Exactly-once billing invariant:** Streaming emits many chunks, but billing writes exactly once per final assistant message. Enforce via `UNIQUE(tenant_key, message_id)` on `usage_records`.
- OpenClaw has message ordering conflicts in some flows; our outer lock + idempotency prevents duplicates

---

## 17. Observability Checklist

Every log/span/metric MUST include:
- `tenantKey`
- `sessionKey`
- `messageId` (internal)
- `workerJobId`
- `channelType`, `externalChatId`

Track:
- Latency p50/p95
- Token burn (input/output)
- Tool-call counts
- DB ops per request
- Retries / provider failovers

---

## 18. Migration Numbering

| Migration | Phase | Content |
|-----------|-------|---------|
| `XXX_inbound_dedup.sql` | 1A | `assistant_inbound_dedup` table |
| `XXX_tenant_rate_buckets.sql` | 1A | `tenant_rate_buckets` table |
| `XXX_policy_config.sql` | 1A | Add `policy_config` JSONB to `ai_assistants` |
| `XXX_tenant_encryption_keys.sql` | 1B | `tenant_encryption_keys` table |
| `XXX_message_encryption_columns.sql` | 1B | Encryption columns on `assistant_messages` + `assistant_memory` |
| `082_agent_scheduled_tasks.sql` | Agent Runtime | `agent_scheduled_tasks` table + claim/reset RPCs |
| `083_agent_channel_type.sql` | Agent Runtime | Adds `'agent'` channel type, nullable `secret_token_hash` |

---

## 19. Glossary

| Term | Meaning |
|------|---------|
| **DEK** | Data Encryption Key (per-tenant, encrypts content) |
| **CMK** | Customer Master Key (KMS-managed, wraps DEKs) |
| **HKDF** | HMAC-based Key Derivation Function (Phase 1B local key derivation) |
| **AAD** | Additional Authenticated Data — `tenantKey:sessionKey:messageId` bound to ciphertext. Prevents cross-context replay. |
| **BYOK** | Bring Your Own Key (user's provider API keys, separate system) |
| **OpenClaw** | Open-source agent framework (Pi loop, commands, compaction) — MIT licensed |
| **Lucid-L2** | Unified AI endpoint routing to 100+ LLM models |
| **NullMemory** | No-op memory adapter for assistants with memory disabled |
| **ACP** | Agent Communication Protocol (agent-to-agent communication) |
| **Pi Agent** | OpenClaw's agent runtime with RPC mode, tool streaming, block streaming |
| **RunBudget** | Stateful per-run budget tracking (tokens, tool calls, wall time) |
| **Policy Wall** | Two-entry-point enforcement: pre-execution + mid-run runtime guard |
| **tenantKey** | `orgId:projectId:envId` — canonical tenant identifier |
| **sessionKey** | `tenantKey:channelType:externalChatId` — canonical session identifier |

---

> **ConversationLock collision note:** FNV advisory lock uses a 64-bit hash. Collision probability is ~1 in 2^32 at 65K concurrent sessions — acceptable. If you scale beyond that, map sessionKey → UUID via a lookup table and lock on UUID-derived int64.

*Spec v2.2 — 2026-02-12. Round-2 must-fixes: dedup key includes external_chat_id (prevents false dedup across chats), pipeline step reorder (compute keys before dedup), DB CHECK constraints for encryption invariants. Should-fixes: key escaping rule, lock collision note, exactly-once billing invariant.*
*v2.3 — 2026-03-09. Agent Runtime Hybrid features shipped: scheduling (croner + outbox), cross-agent messaging (synthetic inbound events), subagent spawning (recursive embedded runner). Cron and ACP moved from GATED to SHIPPED.*
*Locked. No further design changes without explicit review.*
