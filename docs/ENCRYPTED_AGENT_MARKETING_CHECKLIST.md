# Encrypted Agent — Marketing Readiness Checklist

> **Last updated:** 2026-02-12
> **Status:** P0 fixes complete, P1 gate tests passing
> **Reference:** `docs/OPENCLAW_AUDIT_PLAN_V3.md` P1 #14

---

## 1. What IS Encrypted (can be claimed ✅)

| Data Type | Encryption | Algorithm | Key Management |
|-----------|-----------|-----------|----------------|
| **Message content** (user + assistant) | ✅ AES-256-GCM | HKDF-derived DEK per org | Tenant key table, rotatable |
| **Memory content** (user facts/preferences) | ✅ AES-256-GCM | HKDF-derived DEK per org | Same tenant key infrastructure |
| **Channel secrets** (bot tokens, API keys) | ✅ AES-256-GCM | Platform-level encryption key | Stored in `encrypted_secrets` table |

### Encryption Details

- **Algorithm:** AES-256-GCM (authenticated encryption with associated data)
- **Key derivation:** HKDF (HMAC-based Key Derivation Function) from org-level master key
- **AAD binding:** Every ciphertext is bound to its context via Associated Authenticated Data:
  - Messages: `tenantKey:sessionKey:messageId`
  - Memories: `tenantKey:userKey:memoryId`
- **Scope:** Storage at rest — data is encrypted before INSERT, decrypted on SELECT
- **DB invariant:** CHECK constraints enforce that encrypted rows have `content = NULL` and all crypto fields populated (migration 064)

---

## 2. What is NOT Encrypted (must be transparent ⚠️)

| Data Type | Why Not Encrypted | Risk Level |
|-----------|------------------|------------|
| **Embeddings** (vector representations) | Derived, non-reversible vectors; encrypting would break similarity search | Low — vectors cannot reconstruct original text |
| **Metadata** (timestamps, message counts, token usage) | Required for billing, analytics, rate limiting | Low — no PII content |
| **Conversation IDs / Assistant IDs** | Required for routing and indexing | Low — UUIDs, not meaningful |
| **Channel type / external_chat_id** | Required for message routing | Medium — reveals platform usage |
| **Model name / token counts** | Required for billing and observability | Low — operational data |

### Honest Limitation Statement

> "Lucid encrypts all message and memory **content** at rest using AES-256-GCM. Metadata required for routing, billing, and search (including vector embeddings) remains unencrypted. Embeddings are derived representations that cannot be reversed to reconstruct original text."

---

## 3. Data Retention Rules

| Data Type | Retention | Deletion Mechanism |
|-----------|-----------|-------------------|
| Messages | Until user/org deletes conversation | `/reset` command or API delete |
| Memories | Until user/org deletes or memory expires | TTL-based cleanup + manual delete |
| Dedup records | 24h rolling window | Automatic cleanup via `InboundDeduper.cleanup()` |
| Usage records | Indefinite (billing) | Org deletion only |
| Rate limit buckets | 60s sliding window | Automatic expiry |
| Conversation locks | Auto-release on completion or timeout | Lock TTL (default: 60s) |

---

## 4. Plaintext Access — Who Can See What

| Actor | Access to Plaintext | Mechanism |
|-------|-------------------|-----------|
| **Runtime (worker process)** | ✅ Yes — required for LLM calls | Decrypts on-read, encrypts on-write |
| **LLM provider (Lucid-L2)** | ✅ Yes — receives plaintext for inference | Standard mode: provider sees prompts |
| **Channel output (Telegram/WhatsApp)** | ✅ Yes — delivers plaintext to user | Encryption is storage-only |
| **Database at rest** | ❌ No — ciphertext only | AES-256-GCM encrypted columns |
| **Platform operators (Lucid team)** | ❌ No — no access to DEKs | Break-glass procedure requires org approval |
| **Other tenants** | ❌ No — tenant isolation via RLS + scoped keys | Each org has its own DEK |

### Break-Glass Procedure

In emergency scenarios (legal requirement, critical debugging):
1. Requires explicit org admin approval
2. Requires platform admin + security officer dual authorization
3. All access is logged and auditable via `runId` spine
4. Temporary DEK access revoked after resolution

---

## 5. PII Log Redaction Guarantees

| Log Location | PII Redacted? | Mechanism |
|-------------|--------------|-----------|
| Worker console logs | ✅ Yes | `pii-redactor.ts` strips message content |
| Structured log context | ✅ Yes | `createLogContext()` — only IDs, no content |
| Error captures (Sentry) | ✅ Yes | `captureError()` — stack traces only, no user data |
| Rate limit logs | ✅ Yes | Only tenant/user keys logged, not message text |
| Billing/usage records | ✅ Yes | Token counts only, no content |

### What IS logged (PII-safe):
- `runId`, `tenantKey`, `sessionKey`, `userKey` (opaque composite keys)
- `assistantId`, `conversationId`, `channelType`
- Token counts, latency, error codes
- Step progression (dedup → rate limit → lock → LLM → store → done)

### What is NEVER logged:
- Message text / content
- User names, emails, phone numbers
- Channel secrets / bot tokens
- Encryption keys or key material
- Memory content / facts about users

---

## 6. Standard Mode vs Private Inference (Track B)

### Standard Mode (current — what we ship)

| Property | Value |
|----------|-------|
| Content encryption at rest | ✅ AES-256-GCM |
| Memory encryption at rest | ✅ AES-256-GCM |
| LLM sees plaintext | ✅ Yes (required for inference) |
| Provider logging | Depends on provider policy |
| PII redaction in our logs | ✅ Yes |
| Tenant isolation | ✅ RLS + scoped keys |

**Honest claim:** "Your data is encrypted at rest and isolated per-tenant. During inference, the LLM provider processes your prompts — standard provider data handling policies apply."

### Private Inference — Track B (future, NOT shipped)

| Property | Value |
|----------|-------|
| Content encryption at rest | ✅ AES-256-GCM |
| Memory encryption at rest | ✅ AES-256-GCM |
| LLM sees plaintext | ❌ Processed in TEE (Nitro Enclaves) |
| Provider logging | ❌ No provider access to plaintext |
| PII redaction in our logs | ✅ Yes |
| Tenant isolation | ✅ RLS + scoped keys + enclave isolation |

**Future claim (when shipped):** "Your data never leaves encrypted enclaves. Even the LLM provider cannot access your plaintext prompts or responses."

### Marketing Distinction

> ⚠️ **DO NOT claim Private Inference capabilities until Track B is complete.**
>
> Current marketing should say: "End-to-end encrypted storage with tenant isolation" — NOT "end-to-end encrypted inference" or "zero-knowledge AI."

---

## 7. Pre-Marketing Technical Gates (ALL must be ✅)

| Gate | Status | Evidence |
|------|--------|----------|
| P0 Fix #1: DB CHECK constraints (migration 064) | ✅ | `migrations/064_encryption_invariants_and_memory_rpc_v2.sql` |
| P0 Fix #2: AAD binding (messageId before encrypt) | ✅ | `inbound.ts` Step 3 + agent path + legacy paths |
| P0 Fix #3: Legacy path encryption | ✅ | `processWithStreaming()` + `processWithoutStreaming()` use `buildMessageColumns()` |
| P0 Fix #4: Context decryption | ✅ | `inbound.ts` Step 4 — decrypts APP_LAYER rows |
| P0 Fix #5: Memory write pipeline | ✅ | `extractAndStoreMemories.ts` — fire-and-forget after lock release |
| P0 Fix #6: Memory retrieval decryption | ✅ | `get_recent_memories_v2` RPC + worker decryption |
| P0 Fix #7: Stable `runId` | ✅ | `crypto.randomUUID()` at top of `processInboundEvent()` |
| P0 Fix #8: Rate limiter dual-bucket | ✅ | `TenantRateLimiter.tryConsumeDual()` (migration 065) |
| P0 Fix #9: Memory scoping tenant-safe | ✅ | `scopedUserId = tenantKeys.userKey` |
| Test E1: Encryption round-trip | ✅ | `tests/integration/encryption-roundtrip.test.ts` |
| Test E2: Memory extraction pipeline | ✅ | `tests/integration/memory-extraction-pipeline.test.ts` |
| Tests 1-5a: Pipeline guards | ✅ | `tests/integration/pipeline-guards.test.ts` |
| Slash command writes respect encryption | ✅ | `inbound.ts` Step 2.5a — uses `buildMessageColumns()` + AAD |
| Slash commands consume rate limit buckets | ✅ | Step 1.5 (rate limit) runs before Step 2.5a (commands) |

---

## 8. Approved Marketing Language

### ✅ CAN say:
- "AES-256-GCM encryption for all message and memory content at rest"
- "Per-tenant encryption keys with HKDF key derivation"
- "Authenticated encryption with associated data (AAD) binding"
- "Multi-tenant isolation with Row-Level Security"
- "PII-free logging — no user content in application logs"
- "Exactly-once billing with idempotency guarantees"
- "Rate limiting per tenant and per user"

### ❌ CANNOT say (yet):
- "End-to-end encrypted AI" (LLM provider sees plaintext — standard mode)
- "Zero-knowledge AI platform" (requires Track B / Nitro Enclaves)
- "OpenClaw-powered" (subtree is vendored only, not behavior-driving)
- "HIPAA compliant" (requires BAA + formal audit, not just encryption)
- "SOC 2 certified" (requires formal certification process)
- "Private inference" (Track B not shipped)

---

## 9. Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-02-12 | Initial checklist created from OPENCLAW_AUDIT_PLAN_V3.md P1 #14 | Cline |
| 2026-02-13 | Next-phase kickoff: added execution starter checklist and migration apply/verification status | Cline |

---

## 10. Next-Phase Kickoff (Execution Starter)

### Migration Apply & Verification Status (Supabase MCP)

- ✅ Applied: `openclaw_064_encryption_invariants_and_memory_rpc_v2`
- ✅ Applied: `openclaw_066_dual_rate_limit_rpc_tenant_rate_buckets_fix`

**Post-apply verification checks (all green):**
- ✅ `chk_msg_encryption_invariant` exists
- ✅ `chk_mem_encryption_invariant` exists
- ✅ `get_recent_memories_v2` exists
- ✅ `assistant_usage_records.run_id` exists
- ✅ `consume_rate_tokens_dual` exists

### Kickoff sequence for next phase (P2)

1. **Lock CI gates in branch protection**
   - Require `.github/workflows/openclaw-integration-gates.yml` on PR merge.
2. **Create P2-15a implementation ticket**
   - Scope: ChannelAdapter bridge contract between our `ChannelOutput` and OpenClaw channel extensions.
   - Include invariant list: dedup/lock/rate/policy/encryption/runId remain in our pipeline.
3. **Start with Telegram adapter bridge first**
   - Keep behavior parity with existing Telegram output tests.
4. **Add explicit P2 gate tests before Discord/Slack**
   - Adapter contract tests + no-regression path for encryption + usage + observability.

### P2-15a starter Definition of Done

- [ ] Adapter interface documented (inputs/outputs + failure model)
- [ ] Telegram bridge compiles and routes through existing control-plane guards
- [ ] Existing OpenClaw integration gates stay green
- [ ] New adapter contract tests pass
- [ ] No plaintext leaks in logs/traces during adapter path