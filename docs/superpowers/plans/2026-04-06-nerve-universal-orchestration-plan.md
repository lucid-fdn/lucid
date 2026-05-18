# Nerve — Universal Agent Orchestration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Pulse into a universal orchestration engine for all deployment modes. Phase 1N: Redis adapter. Phase 2N: REST Unification. Phase 2N-fix: Codex review fixes. Phase 2N-hardening: production hardening.

**Tech Stack:** TypeScript, @upstash/redis, ioredis, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-04-06-nerve-universal-orchestration-design.md`

---

## File Structure

### Phase 1N: Redis Adapter (files)

| File | Status | Responsibility |
|------|--------|---------------|
| `worker/src/pulse/adapters/types.ts` | Created | `IPulseRedisAdapter`, `IPulsePipeline` interface |
| `worker/src/pulse/adapters/upstash.ts` | Created | Upstash HTTP adapter (pass-through) |
| `worker/src/pulse/adapters/ioredis.ts` | Created | ioredis TCP adapter (pipeline normalization) |
| `worker/src/pulse/adapters/index.ts` | Created | Barrel exports |
| `worker/src/pulse/redis.ts` | Modified | Adapter factory (Upstash → ioredis → null) |
| `worker/src/pulse/queue.ts` | Modified | Type: `Redis` → `IPulseRedisAdapter` |
| `worker/src/pulse/orphan-detector.ts` | Modified | Same type import change |
| `worker/src/pulse/redis-health.ts` | Modified | Same type import change |
| `worker/src/pulse/__tests__/adapters.test.ts` | Created | Adapter conformance tests |

### Phase 2N: REST Unification (files)

| File | Status | Responsibility |
|------|--------|---------------|
| `contracts/pulse.ts` | Created | Shared PulseKeys, Lua scripts, types |
| `contracts/index.ts` | Modified | Added pulse export |
| `src/lib/pulse/redis-client.ts` | Created | Control plane Redis singleton |
| `src/lib/pulse/claim-proxy.ts` | Created | claimForRuntime, completeForRuntime, failForRuntime, enqueueAndClaimSelf |
| `src/lib/pulse/index.ts` | Created | Barrel exports |
| `src/app/api/runtimes/messages/claim-inbound/route.ts` | Modified | Pulse claim path added |
| `src/app/api/runtimes/messages/complete-inbound/route.ts` | Modified | Pulse release added |
| `src/app/api/runtimes/messages/fail-inbound/route.ts` | Modified | Pulse release added |
| `src/app/api/runtimes/messages/renew-lease/route.ts` | Modified | Pulse lease renewal |
| `src/app/api/runtimes/messages/enqueue-and-claim-self/route.ts` | Created | C2a self-claim endpoint |
| `src/lib/mission-control/schemas.ts` | Modified | enqueueAndClaimSelfSchema, pulseRunId |
| `src/lib/db/mission-control.ts` | Modified | buildRunPacketById() |
| `src/lib/pulse/__tests__/claim-proxy.test.ts` | Created | 18 tests |
| `src/lib/pulse/__tests__/rest-unification.test.ts` | Created | 9 tests |
| `src/app/api/runtimes/messages/__tests__/claim-inbound.test.ts` | Modified | server-only + Pulse mocks |
| `src/app/api/runtimes/messages/__tests__/complete-inbound.test.ts` | Modified | server-only + Pulse mocks |

---

## Phase 1N: Redis Adapter — DONE

- [x] **Task 1: Create `IPulseRedisAdapter` interface** — `worker/src/pulse/adapters/types.ts`
- [x] **Task 2: Create barrel export** — `worker/src/pulse/adapters/index.ts`
- [x] **Task 3: Create `UpstashAdapter`** — Thin pass-through wrapper
- [x] **Task 4: Add `ioredis` dependency** — `cd worker && npm install ioredis`
- [x] **Task 5: Create `IoredisAdapter`** — TCP client, pipeline normalization, arg translation
- [x] **Task 6: Update `redis.ts` adapter factory** — Env-var-based selection
- [x] **Task 7: Update config.ts** — Add `REDIS_URL` env var
- [x] **Task 8-11: Update Pulse consumers** — Type imports: `Redis` → `IPulseRedisAdapter`
- [x] **Task 12: Update index.ts shutdown** — `shutdownPulseRedis()` in graceful shutdown
- [x] **Task 13: Adapter conformance tests** — `adapters.test.ts`
- [x] **Task 14-15: Full test suite verification** — 2658+ worker tests passing

---

## Phase 2N: REST Unification — DONE

### Chunk 1: Shared Contracts

- [x] **Task 1: Create contracts/pulse.ts**
  - PulseKeys, PulseJob, PulseLeaseInfo, PulseEventType, PulsePriority types
  - 5 Lua scripts: CLAIM_LUA, CONDITIONAL_DEL_LUA, PLAIN_CONDITIONAL_DEL_LUA, FLOOR_DECR_LUA, RENEW_LEASE_LUA
  - Importable via `@contracts/pulse` alias
  - Worker keeps own copy (rootDir restriction) with sync comments

- [x] **Task 2: Update contracts/index.ts** — Add `export * from './pulse'`

### Chunk 2: Control Plane Pulse Client

- [x] **Task 3: Create src/lib/pulse/redis-client.ts**
  - Singleton @upstash/redis client, `import 'server-only'` guard
  - Returns null if env vars not configured
  - No NEXT_PUBLIC fallback (security fix from Codex review)

- [x] **Task 4: Create src/lib/pulse/claim-proxy.ts**
  - `claimForRuntime(eventType, runtimeId)` — 5-step claim flow
  - `completeForRuntime(job, workerId)` — Fenced lease release
  - `failForRuntime(job, workerId)` — Fenced lease release
  - `enqueueAndClaimSelf(params)` — C2a self-claim
  - `isPulseAvailable()` — Redis availability check
  - `reEnqueue(redis, job)` — Re-add popped-but-not-claimed jobs
  - Constants: LEASE_TTL=60, MAX_CONCURRENT=3, INFLIGHT_EXPIRE=300

- [x] **Task 5: Create src/lib/pulse/index.ts** — Barrel exports

### Chunk 3: Endpoint Integration

- [x] **Task 6: Update claim-inbound/route.ts**
  - When isPulseAvailable(): call claimViaPulse() instead of DB claim
  - claimForRuntime() → buildRunPacketById() → attach _pulse metadata
  - Falls back to DB claim when Pulse not available

- [x] **Task 7: Update complete-inbound/route.ts**
  - After DB completion, fire-and-forget releasePulseResources()
  - Read workerId from lease JSON (not hardcoded prefix — Codex fix)

- [x] **Task 8: Update fail-inbound/route.ts**
  - After DB fail, fire-and-forget releasePulseOnFail()
  - Read workerId from lease JSON (Codex fix)

- [x] **Task 9: Update renew-lease/route.ts**
  - After DB updated_at touch, fire-and-forget renewPulseLease()
  - Read workerId from lease JSON (Codex fix)
  - Check RENEW_LEASE_LUA result, warn on stale (Codex fix)

- [x] **Task 10: Create enqueue-and-claim-self/route.ts**
  - POST with eventId, eventType, agentId, orgId, priority
  - Auth: authenticateRuntime()
  - Org match + event exists + agent belongs to org (Codex fix: auth depth)
  - Returns 503 if Pulse not available, 429 if over concurrency

### Chunk 4: Schema & DB

- [x] **Task 11: Add enqueueAndClaimSelfSchema** — Zod: eventId UUID, eventType enum, agentId UUID, orgId UUID, priority enum (default 'normal')

- [x] **Task 12: Fix runId schema** — Changed from z.string().uuid() to z.string().min(1).max(200) — accepts both UUID and Pulse format (uuid:attempt)

- [x] **Task 13: Add buildRunPacketById()**
  - Loads event by ID, marks as 'processing' (not 'claimed' — Codex P0 fix)
  - Optimistic lock via WHERE status IN (pending, claimed)
  - Builds RunPacket via existing buildRunPacket()
  - Releases claim on packet-building failure

### Chunk 5: Tests

- [x] **Task 14: claim-proxy.test.ts** (18 tests)
  - claimForRuntime: queue claim, correct keys, empty queue, over concurrency, lease fail, enqueuedAt restore
  - completeForRuntime: success release, stale lease
  - failForRuntime: success release, stale lease
  - enqueueAndClaimSelf: atomic claim, over concurrency, native- prefix
  - Contract sync: PulseKeys patterns, Lua script content

- [x] **Task 15: rest-unification.test.ts** (9 tests)
  - Contract sync: key patterns, Lua scripts, PulseJob type
  - Schema validation: enqueueAndClaimSelfSchema
  - Worker ID conventions: relay-, native-, worker- prefixes
  - Metrics key pattern

- [x] **Task 16: Fix existing test mocks**
  - claim-inbound.test.ts: added server-only mock, Pulse mock, buildRunPacketById mock
  - complete-inbound.test.ts: added server-only mock, Pulse mock, redis-client mock, contracts mock

### Chunk 6: Codex Review Fixes

- [x] **Task 17: P0 — DB status mismatch**
  - `buildRunPacketById()`: changed `status: 'claimed'` → `status: 'processing'`
  - Matches what `completeInboundForRuntime()` expects at `.eq('status', 'processing')`

- [x] **Task 18: P1 — Worker ID from lease**
  - releasePulseResources: reads workerId from lease JSON
  - releasePulseOnFail: reads workerId from lease JSON
  - renewPulseLease: reads workerId from lease JSON
  - All handle both relay- and native- prefixes

- [x] **Task 19: P1 — runId schema**
  - Changed z.string().uuid() → z.string().min(1).max(200) for runId
  - Accepts both UUID (legacy) and Pulse format (uuid:attempt)

- [x] **Task 20: P1 — Renew lease result check**
  - renewPulseLease checks RENEW_LEASE_LUA return value
  - Logs warning on result === 0 (stale lease)

- [x] **Task 21: P1 — enqueue-and-claim-self auth depth**
  - Verify event exists via DB query
  - Verify agent belongs to runtime's org
  - Return 404/403 on mismatch

- [x] **Task 22: P2 — Remove NEXT_PUBLIC fallback**
  - redis-client.ts: only accepts UPSTASH_REDIS_REST_URL/TOKEN (no NEXT_PUBLIC_*)

---

## Phase 2N-hardening: Production Hardening — DONE

### Chunk 7: Contract Sync Guard

- [x] **Task 23: Worker-side contract sync test**
  - `worker/src/pulse/__tests__/contract-sync.test.ts` — 21 tests
  - Verifies PulseKeys patterns (7 key types), Lua scripts (5), types (4), shared constants (5)
  - CI guard that prevents worker↔contracts drift

### Chunk 8: agent_runs Wiring

- [x] **Task 24: Wire agent_runs inserts into worker claim/complete/fail**
  - `worker/src/pulse/agent-runs.ts` — recordClaim, recordComplete, recordFail, recordDlq
  - BaseWorker: recordClaim after successful claim, recordComplete/recordFail in processJob
  - PulseQueue.sendToDlq: recordDlq after DLQ entry
  - initAgentRuns(supabase) called at Pulse startup in index.ts
  - All operations are fire-and-forget (best-effort, non-blocking)

- [x] **Task 25: Wire agent_runs into control plane**
  - claim-proxy.ts: recordAgentRunClaim/Complete/Fail (best-effort, void Promise.resolve().catch())
  - claimForRuntime + enqueueAndClaimSelf: INSERT on successful claim
  - completeForRuntime: UPDATE on successful release
  - failForRuntime: UPDATE on successful release

- [x] **Task 26: agent_runs tests**
  - Contract sync test verifies shared constants match DEFAULT_PULSE_CONFIG
  - claim-proxy.test.ts updated with supabase mock for agent_runs calls
  - 306 total Pulse tests passing (90 frontend + 216 worker)

### Chunk 9: Shared Constants

- [x] **Task 27: Import constants from contracts in claim-proxy.ts**
  - Added to contracts/pulse.ts: LEASE_TTL_SECONDS, MAX_CONCURRENT_PER_AGENT, INFLIGHT_EXPIRE_SECONDS, MAX_ATTEMPTS, METRICS_TTL_SECONDS
  - claim-proxy.ts: removed hardcoded constants, imports from @contracts/pulse
  - Worker: DEFAULT_PULSE_CONFIG values already match (verified by contract-sync.test.ts)

### Chunk 10: OTel Spans on Control Plane — DEFERRED

- [ ] **Task 28: Add OTel spans to claim-proxy.ts**
  - **Deferred**: Control plane (Vercel) has no OTel instrumentation yet
  - Requires @vercel/otel setup or equivalent — separate infrastructure task
  - Worker-side already has OTel spans on all Pulse operations (via withSpan in BaseWorker + PulseQueue)

### Chunk 11: Metrics Key TTL

- [x] **Task 29: Set 7d TTL on metrics keys in claim-proxy.ts**
  - completeForRuntime, failForRuntime: metrics via pipeline (hincrby + expire METRICS_TTL_SECONDS)
  - enqueueAndClaimSelf: metrics via pipeline (hincrby enqueued + claimed + expire)
  - Matches worker behavior (queue.ts incrementMetric already uses 7d TTL)

### Chunk 12: Backoff Jitter (Codex Audit)

- [x] **Task 30: Add jitter to BaseWorker backoff**
  - Full jitter: `Math.random() * currentBackoffMs` before sleeping
  - Prevents synchronized claim bursts when multiple idle workers wake up after idle period

### Chunk 13: Proxy Rate Limiting (Codex Audit)

- [x] **Task 31: Add per-runtime rate limiting to claim-proxy.ts**
  - In-memory sliding window: 120 ops/minute per runtime
  - Applied to claim paths only: claimForRuntime, enqueueAndClaimSelf
  - Release paths (completeForRuntime, failForRuntime) exempt — rate limiting releases causes lease leaks
  - Returns null/false on rate limit (runtime backs off naturally)
  - Periodic cleanup of stale entries (every 5 min)

### Chunk 14: Codex Route-Layer Fixes

- [x] **Task 32: P0 — Accept 'processing' status in renew-lease and fail-inbound routes**
  - `buildRunPacketById` sets status to 'processing' for Pulse-claimed events
  - Routes now accept both 'claimed' and 'processing' via `.in('status', [...])`
  - Prevents 409/already_applied on Pulse-claimed events

- [x] **Task 33: P1 — Remove rate limiting from release paths**
  - `completeForRuntime` and `failForRuntime` no longer rate-limited
  - Blocking a release silently leaks the lease (orphan detector is 60s safety net, not a primary path)

- [x] **Task 34: P1 — Use LEASE_TTL_SECONDS constant in route helpers**
  - renew-lease: imports from `@contracts/pulse`, uses `String(LEASE_TTL_SECONDS)` instead of `'60'`

### Chunk 15: Codex Tradeoffs Review Fixes

- [x] **Task 35: P0 — Orphan detector covers 'processing' status**
  - `orphan-detector.ts`: DB reset query now uses `.in('status', ['claimed', 'processing'])`
  - Without this, events claimed via Pulse relay (which sets 'processing') would be stuck forever if runtime dies

- [x] **Task 36: P1 — Route helpers use actual runId from request**
  - complete-inbound, fail-inbound, renew-lease: pass `runId` from parsed request body
  - Helpers accept optional `requestRunId` param, fall back to `${eventId}:0`
  - Supports retries with attempt > 0 (runId format: `eventId:attempt`)

- [x] **Task 37: P1 — agent_runs updates are attempt-scoped**
  - Worker agent-runs.ts: recordComplete, recordFail, recordDlq add `.eq('attempt', job.attempt + 1)`
  - Control plane claim-proxy.ts: recordAgentRunComplete, recordAgentRunFail add same filter
  - Prevents retried runs from corrupting earlier attempt rows

---

## Verification

### After Phase 2N (Complete)
```bash
npm run typecheck                                     # Frontend types ✓
npm run test -- --run                                 # 1432 tests ✓
cd worker && npm run typecheck                        # Worker types ✓
cd worker && npm run test -- --run                    # 2658 tests ✓
```

### After Phase 2N-hardening
```bash
npm run test -- --run                                 # All frontend tests
cd worker && npm run test -- --run                    # All worker tests
cd worker && npm run test -- --run src/pulse/__tests__/contract-sync.test.ts  # Sync guard
```

### Staging
- SaaS: `FEATURE_PULSE=true` + Upstash Redis → verify C1 claim via REST
- Self-hosted: `REDIS_URL=redis://redis:6379` + `FEATURE_PULSE=true` → verify direct Redis
- C2a: enqueue-and-claim-self → verify lease created → complete → verify lease released

---

## Summary

| Phase | Status | Deliverables |
|-------|--------|-------------|
| 1N: Redis Adapter | Done | IPulseRedisAdapter, Upstash + ioredis adapters, factory |
| 2N: REST Unification | Done | claim-proxy, 5 endpoints, contracts sharing, 27 tests |
| 2N-fix: Codex Fixes | Done | 6 fixes (P0 status, P1 workerId/schema/auth/renew, P2 env) |
| 2N-hardening | Done | Contract sync guard (21 tests), agent_runs wiring, shared constants, metrics TTL, jitter, rate limiting (claim-only), route-layer fixes (P0 status, P1 release rate-limit, P1 constant TTL). OTel deferred (no Vercel OTel). |
| 3N: Step Protocol | Done | Pluggable executors (ProcessorExecutor, WebhookExecutor, ApprovalExecutor), step tracking (orchestration_steps), callback + enqueue endpoints, HMAC auth, 58 tests |
| 4N: Intelligence | Planned | DagPlanner, dependency graph |
| 5N: Confidence | Planned | 3-layer confidence routing |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Best-effort Pulse release | DB is source of truth. Orphan detector catches leaks within 60s. |
| Worker ID from lease | Handles relay- and native- prefixes. No prefix reconstruction needed. |
| contracts/pulse.ts + worker copy | rootDir restriction prevents worker importing from contracts/. Sync tests guard drift. |
| runId = uuid:attempt format | Enables retry tracking. Schemas accept both UUID and Pulse format. |
| buildRunPacketById sets 'processing' | Matches completeInboundForRuntime's WHERE status='processing'. |
| No failForRuntime retry/DLQ | Control plane only releases lease. DB status + sweep safety net handle retry. |
| No NEXT_PUBLIC env fallback | Server-side only. Prevents accidental credential exposure to browser. |
| Event/agent verification on C2a | Prevents compromised API key from creating leases for arbitrary resources. |
