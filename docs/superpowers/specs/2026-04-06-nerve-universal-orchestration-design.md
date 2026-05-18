# Nerve — Universal Agent Orchestration Engine — Design Spec

**Date**: 2026-04-06
**Last Updated**: 2026-04-06
**Status**: Phase 0-5 complete (worker Pulse). Phase 1N complete (Redis adapter). Phase 2N complete (REST Unification + hardening). Phase 3N spec+plan ready. Phase 4N-5N planned.
**Scope**: Event-driven distributed orchestration engine replacing polling loops, supporting all deployment modes (SaaS, self-hosted, dedicated, external).

## 1. Problem Statement

Lucid's original orchestration was 5 `setInterval` polling loops in `worker/src/index.ts` — inbound (5s), outbound (3s), scheduled tasks (30s), cleanup (5min), and cron jobs. Concurrency was global `pLimit` (not per-agent), there was no priority, no orphan detection, no centralized run state, and timers drifted under load.

### Problems (Original — Solved by Pulse Phases 0-5)

1. **5s claim latency** — Fixed interval polling misses events by up to 5s
2. **Global concurrency** — `pLimit(5)` across all agents, not per-agent
3. **No priority** — FIFO only, critical messages wait behind background retries
4. **No orphan detection** — Stuck events required manual DB scans every 5min
5. **Timer drift** — `setInterval` doesn't account for processing time

### Problems (Post-Pulse — Being Solved by Nerve)

6. **SaaS-only Pulse** — Hardcoded to Upstash HTTP. Self-hosted docker-compose has Redis but can't use Pulse.
7. **Dedicated C1 degraded** — REST polling with 5s latency, no Pulse participation
8. **Dedicated C2a no queue** — In-process only, no state machine observability
9. **No external agents** — Only OpenClaw agents. LangGraph, CrewAI, external APIs can't participate.
10. **No task decomposition** — Goals must be manually broken into steps

### Goal

> **Same Pulse engine everywhere. Any runtime. Any agent type.**

One orchestration engine that works identically across SaaS, self-hosted, dedicated, and external agents.

## 2. Architecture

### 2.1 Layer Stack

```
┌─────────────────────────────────────────────────┐
│  Nerve Intelligence (Phase 3N-5N — planned)     │
│  Task decomposition, DAG, confidence routing    │
├─────────────────────────────────────────────────┤
│  REST Unification (Phase 2N — complete)         │
│  Control plane Pulse proxy for C1/C2a runtimes  │
├─────────────────────────────────────────────────┤
│  Redis Adapter (Phase 1N — complete)            │
│  IPulseRedisAdapter: Upstash HTTP | ioredis TCP │
├─────────────────────────────────────────────────┤
│  Pulse Engine (Phases 0-5 — complete)           │
│  ZSET queue, Lua claims, TTL leases, DLQ,       │
│  per-agent concurrency, orphan detector,         │
│  circuit breaker, polling fallback              │
└─────────────────────────────────────────────────┘
```

### 2.2 Pulse Engine (Complete — worker/src/pulse/)

Priority ZSET queue with Lua atomic claims, TTL leases, per-agent concurrency, dead-letter queues, exponential backoff, orphan detection, Redis circuit breaker with polling fallback.

**Industry patterns used:**
- Priority ZSET (same as Sidekiq/Celery)
- TTL-based lease (same as SQS visibility timeout)
- Atomic Lua claims (same as BullMQ internals)
- Exponential backoff, dead-letter queues
- Hystrix-style circuit breaker

**Redis data structures:**
```
Queue ZSETs (hash-tagged for Lua co-location):
  pulse:{inbound}:critical/normal/background
  pulse:{outbound}:critical/normal/background
  pulse:{scheduled}:critical/normal/background

Active run ledger:      pulse:active (SET)
Lease keys (TTL 60s):   pulse:lease:{runId} (STRING, JSON)
Per-agent concurrency:  pulse:agent:{agentId}:inflight (STRING, 5min TTL)
Dead letter queues:     pulse:dlq:{type} (LIST, capped 1000)
Metrics (7d TTL):       pulse:metrics:{date} (HASH)
```

**Lua scripts (3 — all CROSSSLOT-safe):**
| Script | Keys | Purpose |
|--------|------|---------|
| `CLAIM_LUA` | 3 hash-tagged ZSETs | Atomic ZPOPMIN from highest-priority non-empty queue |
| `CONDITIONAL_DEL_LUA` | 1 lease key | Fenced release: DEL only if workerId matches (string.find, plain mode) |
| `FLOOR_DECR_LUA` | 1 inflight key | DECR with floor guard (prevents negative counters) |

**Additional Lua scripts (control plane only):**
| Script | Keys | Purpose |
|--------|------|---------|
| `RENEW_LEASE_LUA` | 1 lease key | Extend lease TTL if workerId matches |
| `PLAIN_CONDITIONAL_DEL_LUA` | 1 key | Simple GET + DEL if value matches exactly |

**Claim flow (5 steps):**
1. Lua ZPOPMIN from priority ZSETs (atomic)
2. Pipeline: INCR inflight + EXPIRE 300
3. Post-INCR check: over limit → floor-DECR + re-enqueue → null
4. Pipeline: SET lease NX EX 60 + SADD active
5. If SET NX fails → floor-DECR → null

**Complete/fail flow (fenced):**
1. CONDITIONAL_DEL_LUA on lease key → returns 0 (stale) or 1 (owned)
2. If 0: abort — orphan detector re-claimed
3. If 1: SREM active + floor-DECR inflight + metrics

**Circuit breaker (Hystrix-style):**
| State | Meaning | Transition |
|-------|---------|------------|
| `closed` | Redis healthy → Pulse active | 3 probe failures → `open` |
| `open` | Redis down → polling fallback | 30s cooldown → `half_open` |
| `half_open` | Probing recovery | 3 successes → `closed`; 1 failure → `open` |

### 2.3 Redis Adapter Layer (Phase 1N — Complete)

Thin adapter interface enabling Pulse on any Redis:

```
IPulseRedisAdapter
  ├── UpstashAdapter  (@upstash/redis — HTTP, SaaS)
  └── IoredisAdapter  (ioredis — TCP, self-hosted + dedicated)
```

Selection by env vars:
- `UPSTASH_REDIS_REST_URL` → Upstash (SaaS)
- `REDIS_URL` → ioredis (self-hosted, dedicated)
- Neither → Pulse disabled, polling fallback

**Pipeline result normalization:**
- Upstash returns raw values: `[value1, value2, ...]`
- ioredis returns tuples: `[[null, value1], [null, value2], ...]`
- Adapter normalizes to raw values

### 2.4 REST Unification (Phase 2N — Complete)

Control plane acts as Pulse proxy for dedicated runtimes that don't have direct Redis access.

**Access modes:**
| Mode | Redis Client | Access Pattern | Latency |
|------|-------------|----------------|---------|
| **Shared SaaS** | Upstash HTTP | Direct Redis (worker claim loop) | ~50ms |
| **Self-Hosted** | ioredis TCP | Direct Redis (docker-compose) | ~50ms |
| **Dedicated C1** | None | Control plane REST proxy | ~200-500ms |
| **Dedicated C2a** | None | enqueue-and-claim-self REST | ~200ms |

**C1 REST Relay flow:**
```
Webhook → INSERT inbound event → enqueue to Pulse (control plane Redis)
Runtime polls: POST /claim-inbound
  → Control plane: claimForRuntime() — same 5-step claim flow
  → Returns RunPacket[] with _pulse metadata (runId, leaseToken, agentId)
Runtime processes locally
  → POST /complete-inbound → releasePulseResources() (best-effort)
  → POST /fail-inbound → releasePulseOnFail() (best-effort)
  → POST /renew-lease → renewPulseLease() (best-effort)
```

**C2a Self-Sovereign flow:**
```
Message arrives at runtime in-process
  → Runtime calls POST /enqueue-and-claim-self
  → Control plane: ZADD NX → ZREM → INCR inflight → SET lease → SADD active
  → Returns { runId, leaseToken, leaseTtlSeconds }
Runtime processes locally → POST /complete-inbound
```

**Contracts sharing:**
- `contracts/pulse.ts` — shared constants (PulseKeys, Lua scripts, types) for control plane
- Worker keeps its own copy in `worker/src/pulse/types.ts` + `lua-scripts.ts` (rootDir restriction)
- Contract sync verified by tests in both `claim-proxy.test.ts` and `rest-unification.test.ts`

**Worker ID conventions:**
| Runtime | Prefix | Example |
|---------|--------|---------|
| Shared SaaS | `worker-` | `worker-abc123` |
| C1 REST Relay | `relay-` | `relay-runtime-1` |
| C2a Self-Sovereign | `native-` | `native-runtime-c2a` |

**Fencing on complete/fail/renew:**
- Routes read `workerId` from the stored lease JSON (not reconstructed from prefix)
- Handles both `relay-` and `native-` prefixes correctly
- CONDITIONAL_DEL_LUA matches workerId via string.find with plain mode

**Pulse release is best-effort:**
- DB state (event status) is the source of truth
- Pulse lease release is fire-and-forget (`.catch()` + `console.warn`)
- If Pulse release fails, orphan detector cleans up within 60s
- Routes return success based on DB update, not Redis result

### 2.5 Polling Fallback (Phase 5 — Complete)

Extracted to `worker/src/polling/fallback.ts`. Self-contained module with 4 legacy polling loops. Activates when `FEATURE_PULSE=false` OR when Redis circuit opens.

**Generation counter safety:** Each `startPollingFallback()` increments a generation counter. All in-flight polls and queued `setImmediate` callbacks capture generation at entry and bail if changed — prevents stale work bleeding after stop-then-restart.

### 2.6 Step Execution Protocol (Phase 3N — Planned)

Pluggable executors for different step types:

| Executor | Purpose | When |
|----------|---------|------|
| `ProcessorExecutor` | Wraps existing processors | Standard agent events |
| `RelayExecutor` | C1 dedicated runtime dispatch | RunPacket to runtime |
| `CrewExecutor` | Multi-agent fan-out | Crew missions |
| `ApprovalExecutor` | Human gate via `mc_pending_approvals` | Approval steps |
| `WebhookExecutor` | External agent HTTP callback | Imported/external agents |
| `HumanTaskExecutor` | Channel-routed human work | Human-in-the-loop |

### 2.7 Intelligence Layer (Phase 4N-5N — Planned)

**Task Decomposition (DagPlanner):**
- AI-powered: "Handle this complaint" → research + draft + approval + delivery
- Output: DAG of `OrchestrationStep` nodes with dependency edges
- Cycle detection via DFS

**Confidence Routing (3-layer):**
| Layer | Source | Purpose |
|-------|--------|---------|
| Step confidence (0.0-1.0) | Agent self-report | Route decision |
| Agent confidence (historical) | Rolling average | Auto-assignment |
| Mission confidence (aggregate) | Weighted average | Dashboard + alerts |

## 3. Database Schema

### Existing (Complete)

**`agent_runs`** (migration `20260403100000`):
- Centralized run ledger for cross-event-type observability
- `id, agent_id, org_id, event_type, event_id, worker_id, status, priority, attempt, lease_expires_at, started_at, completed_at, error_message, duration_ms`
- Note: table exists but inserts not yet wired into claim/complete/fail flow

### Planned (Phase 3N)

**`orchestration_tasks`** — Step-level tracking with DAG support
**`orchestration_dependencies`** — Dependency edges with conditional logic

## 4. File Structure

### Worker (Pulse Engine)
```
worker/src/pulse/
├── index.ts              # Barrel exports
├── redis.ts              # Adapter factory (Upstash | ioredis | null)
├── types.ts              # PulseJob, PulsePriority, PulseLeaseInfo, PulseConfig, PulseKeys
├── lua-scripts.ts        # 3 Lua scripts (CLAIM, CONDITIONAL_DEL, FLOOR_DECR)
├── queue.ts              # PulseQueue: enqueue, claim, complete, fail, renewLease, dlq, metrics
├── redis-health.ts       # RedisHealthProbe circuit breaker
├── orphan-detector.ts    # 60s scan + DB event reset + inflight verification
├── adapters/
│   ├── types.ts          # IPulseRedisAdapter, IPulsePipeline
│   ├── upstash.ts        # Upstash HTTP adapter
│   ├── ioredis.ts        # Standard TCP adapter
│   └── index.ts          # Barrel
├── enqueue/
│   ├── inbound.ts        # Push path + 30s sweep safety net
│   ├── outbound.ts       # Outbound enqueuer
│   └── scheduled.ts      # Wake scanner
├── workers/
│   ├── base-worker.ts    # Abstract: claim loop, backoff, lease renewal, shutdown
│   ├── inbound-worker.ts # → processInboundEvent()
│   ├── outbound-worker.ts # → processOutboundEvent()
│   └── scheduled-worker.ts # → processScheduledTask()
└── __tests__/             # 12 test files, ~200+ tests

worker/src/polling/
├── fallback.ts           # Legacy polling (circuit breaker fallback)
└── __tests__/fallback.test.ts
```

### Control Plane (REST Unification)
```
contracts/pulse.ts                                    # Shared: PulseKeys, Lua scripts, types
src/lib/pulse/
├── redis-client.ts                                   # Singleton Upstash client (server-only)
├── claim-proxy.ts                                    # claimForRuntime, completeForRuntime, failForRuntime, enqueueAndClaimSelf
├── index.ts                                          # Barrel
└── __tests__/
    ├── claim-proxy.test.ts                           # 18 tests
    └── rest-unification.test.ts                      # 9 tests

src/app/api/runtimes/messages/
├── claim-inbound/route.ts                            # Modified: Pulse claim path
├── complete-inbound/route.ts                         # Modified: Pulse release
├── fail-inbound/route.ts                             # Modified: Pulse release
├── renew-lease/route.ts                              # Modified: Pulse lease renewal
└── enqueue-and-claim-self/route.ts                   # NEW: C2a endpoint
```

## 5. Competitive Differentiation vs Paperclip

| Dimension | Paperclip | Nerve/Pulse |
|---|---|---|
| Queue backend | Redis lists (LPUSH/RPOP) | Redis ZSET + Lua (universal) |
| Claim mechanism | BLPOP (single consumer) | Lua ZPOPMIN (multi-worker atomic) |
| Distribution | Single worker only | Any number of workers |
| Claim latency | 15s throttle | <100ms when active (~30x faster) |
| Priority | None (FIFO) | 3 lanes: critical/normal/background |
| Per-agent concurrency | None | Redis counter (configurable) |
| Orphan detection | Generation counter (manual) | Redis TTL lease (automatic, 60s) |
| DLQ | Drop after 3 retries | Redis LIST (inspectable, capped 1000) |
| If Redis dies | Queue is dead | Postgres polling fallback (circuit breaker) |
| Deployment universality | Single-process only | SaaS + self-hosted + dedicated |
| Multi-runtime | None | C1 REST proxy + C2a self-sovereign |
| Contract sharing | None | contracts/pulse.ts (control plane ↔ worker sync) |

## 6. Security

### Authentication
- Runtime endpoints: API key auth via `authenticateRuntime()` (O(1) prefix lookup, scrypt, timing-safe)
- Worker Pulse: no auth needed (direct Redis, same process)

### Authorization
- `claim-inbound`: runtime can only claim events for agents assigned to it
- `complete-inbound` / `fail-inbound`: ownership verified via assistant → org chain
- `enqueue-and-claim-self`: org match + event exists + agent belongs to org
- `renew-lease`: event ownership + claimed status check

### Fencing
- CONDITIONAL_DEL_LUA: atomic check-and-delete prevents double-release
- FLOOR_DECR_LUA: prevents negative inflight counters
- Lease SET NX: prevents duplicate claims
- Post-INCR check: prevents over-limit concurrency

### Data Safety
- Pulse Redis is best-effort — DB is source of truth
- Orphan detector resets stuck events (both Redis and DB)
- Circuit breaker falls back to polling on Redis failure
- Generation counter prevents stale polling callbacks

## 7. Success Criteria

### Phase 0-5 (Complete)
- [x] Pulse replaces 5 polling loops when FEATURE_PULSE=true
- [x] <100ms claim latency when queue active
- [x] Per-agent concurrency (max 3, configurable)
- [x] 3 priority lanes (critical/normal/background)
- [x] TTL lease + orphan detection (60s)
- [x] DLQ after 5 failed attempts
- [x] Circuit breaker (Pulse → polling fallback)
- [x] Polling fallback extracted to dedicated module
- [x] 2600+ worker tests passing

### Phase 1N (Complete)
- [x] IPulseRedisAdapter interface
- [x] Upstash adapter (pass-through)
- [x] ioredis adapter (pipeline normalization)
- [x] Env-var-based adapter selection
- [x] Self-hosted docker-compose can use Pulse

### Phase 2N (Complete)
- [x] claimForRuntime() — same 5-step flow as worker
- [x] completeForRuntime() / failForRuntime() — fenced release
- [x] enqueueAndClaimSelf() — C2a self-sovereign entry point
- [x] Lease renewal, fail-inbound endpoints
- [x] contracts/pulse.ts shared constants
- [x] Worker ID from lease (not hardcoded prefix)
- [x] DB status: buildRunPacketById sets 'processing' (matches completeInbound)
- [x] runId schema accepts both UUID and Pulse format
- [x] Event/agent verification on enqueue-and-claim-self
- [x] 27 control plane Pulse tests, 1432 total frontend tests passing

### Phase 3N-5N (Planned)
- [ ] External agent webhook protocol
- [ ] Step execution protocol with pluggable executors
- [ ] Task decomposition (DagPlanner)
- [ ] Confidence routing (3-layer)
- [x] agent_runs table wired into claim/complete/fail flow (Phase 2N-hardening Chunks 8 + 15)

## 8. Gaps Identified (Audit + Codex Review)

### Resolved in Phase 2N-hardening
1. ~~`agent_runs` not populated~~ — Wired in worker (`base-worker.ts` + `agent-runs.ts`) and control plane (`claim-proxy.ts`). Per-attempt rows; updates filter on `attempt = job.attempt + 1`. Per-attempt UNIQUE constraint added in migration `20260407210000_agent_runs_attempt_unique.sql` so accidental double-inserts fail fast at the DB layer.
2. ~~No contract sync CI guard~~ — `worker/src/pulse/__tests__/contract-sync.test.ts` (21 assertions) pins keys, Lua scripts, types, and shared constants.
3. ~~Claim-inbound Pulse path untested~~ — Covered by `byo-runtime.test.ts` + `e2e-pulse.test.ts`.
4. ~~Pulse constants duplicated~~ — `LEASE_TTL_SECONDS`, `MAX_CONCURRENT_PER_AGENT`, `INFLIGHT_EXPIRE_SECONDS`, `MAX_ATTEMPTS`, `METRICS_TTL_SECONDS` live in `contracts/pulse.ts`.
5. ~~Metrics key TTL~~ — All control plane `hincrby` paths now pipeline `expire(METRICS_TTL_SECONDS)`.
6. ~~Backoff lacks jitter~~ — Full jitter (`Math.random() * currentBackoffMs`) in `BaseWorker`.
7. ~~No rate limiting on control plane Pulse proxy~~ — Redis-backed sliding window (120 ops/min/runtime) on claim paths; release paths exempt to prevent lease leaks.
8. ~~`next_wake_at` column~~ — Already in `20260403100000_pulse_agent_runs.sql` with partial index.

### Outstanding (Hardening, Non-Blocking)

9. **No OTel spans on control plane Pulse ops** — Requires `@vercel/otel` setup. Worker has full coverage. Tracking task: add when control plane gains OTel infra.

### Accepted Tradeoffs (Documented, Not Bugs)

9. **Claim flow partially atomic** — Only ZPOPMIN is Lua-atomic. INCR/SET NX/SADD are separate round-trips (CROSSSLOT prevents single Lua across non-hash-tagged keys). Process crash between ZPOPMIN and lease creation loses the Redis job, but the DB event stays 'pending' and the 30s sweep safety net re-enqueues it. Acceptable for our architecture where DB is source of truth.
10. **Fencing uses substring matching** — `CONDITIONAL_DEL_LUA` uses `string.find` with plain mode on serialized JSON. WorkerIDs are server-generated (`relay-{uuid}`, `native-{uuid}`) — no user input, no injection risk. Alternative (separate opaque lease token) adds complexity for no practical benefit.
11. **`failForRuntime` no retry/DLQ** — Control plane only releases lease. DB status + sweep safety net handle retry. This is by design: the control plane is a thin proxy, retry/DLQ logic lives in the worker.
12. **Orphan recovery = DB reset, not re-enqueue** — Orphan detector doesn't re-enqueue to Redis. It resets stuck DB events to 'pending', then the sweep safety net re-enqueues them. Two-step recovery is simpler and more reliable than direct re-enqueue (which would need to reconstruct the PulseJob JSON).
13. **Circuit breaker is lightweight** — Consecutive-failure counter with cooldown, not full Hystrix (no rolling window, no half-open permits). Sufficient for our workload. Redis is either up or down — partial degradation is uncommon with Upstash HTTP.

### Deferred (Future Phases)

14. **SMEMBERS scaling** — `pulse:active` is scanned fully every 60s. At 100K+ active runs, use SSCAN batching or time-indexed structure.
15. **Release path pipeline batching** — complete/fail do SREM + DECR + metrics as separate round-trips. Could pipeline.
16. **Hot key sharding** — `pulse:active` and `pulse:metrics:{date}` are global. Shard by event type if load grows.
17. **Wake signal** — Supabase Broadcast on enqueue to reset backoff. With full-jitter capped at 5s, idle worst-case latency is acceptable at current scale.
18. **Old polling code removal** — Keep until 1 stable release cycle with `FEATURE_PULSE=true`. Polling fallback is the circuit-breaker target — removing it prematurely removes the rollback path.
19. **Independent Pulse health page** — Pulse state is observable via worker OTel + `pulse:metrics:{date}` HASH + MC System page. Dedicated page is polish, not correctness.
20. **Response cache (Perf Phase 6)** — Not a Pulse concern. Belongs to agent-perf optimization track.

## 9. Design Docs

| Topic | Location |
|-------|----------|
| This spec | `docs/superpowers/specs/2026-04-06-nerve-universal-orchestration-design.md` |
| Implementation plan (1N-2N) | `docs/superpowers/plans/2026-04-06-nerve-universal-orchestration-plan.md` |
| Phase 3N spec | `docs/superpowers/specs/2026-04-06-nerve-step-execution-protocol-design.md` |
| Phase 3N plan | `docs/superpowers/plans/2026-04-06-nerve-step-execution-protocol-plan.md` |
| Full 5-phase Pulse plan | `.claude/plans/woolly-squishing-summit.md` |
| Pulse README | `worker/src/pulse/README.md` |
| Polling README | `worker/src/polling/README.md` |
| Channel architecture | `docs/plans/2026-03-30-channel-architecture-dedicated-runtimes.md` |
