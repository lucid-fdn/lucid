# Pulse — Distributed Agent Orchestration Engine

Replaces 5 `setInterval` polling loops with a Redis Streams priority queue + TTL lease system. Feature-gated via `FEATURE_PULSE` (default `false`).

## Why Pulse Exists

The old polling path (`setInterval` every 3-5s) burns DB connections on idle queues, provides no priority ordering, uses global concurrency (`pLimit(5)`) instead of per-agent limits, and detects stuck events via a 5-minute cleanup scan. Pulse fixes all of these with Redis Streams (zero idle cost via `XREADGROUP BLOCK`), <100ms claim latency, per-agent Redis counters, and 60s TTL-based orphan detection.

## Pulse v2 — Redis Streams (2026-04-09)

Migrated from ZSET + Lua ZPOPMIN to Redis Streams with `XREADGROUP BLOCK`. Standardized on ioredis (TCP) for the job queue. Dedicated relay runtimes do not consume Redis directly by default, but their control-plane claim path now uses the same Streams lease semantics.

Key design decisions documented in `.claude/plans/woolly-squishing-summit.md`:
- **D1**: Priority sweep + blocking fallback (non-blocking critical → normal → BLOCK all 3)
- **D2**: Retry ZSET + RetryDrainer for delayed retries (streams are append-only)
- **D3**: SET NX dedup replaces ZADD NX (streams have no NX semantics)
- **D6**: XACK immediately after XREADGROUP (don't use PEL for recovery)
- **D8**: ZREM-first ordering in RetryDrainer (fail-safe: DB sweep recovers on crash)

## Key Concepts

| Concept | Implementation |
|---------|---------------|
| **Priority Streams** | 3 Redis Streams per event type: `critical`, `normal`, `background`. Priority sweep: non-blocking XREADGROUP on critical/normal, then BLOCK on all 3. |
| **Dedup** | `SET pulse:dedup:{eventId}:{attempt} 1 NX EX 300` before XADD. If key exists, skip. 5-minute TTL auto-cleans. |
| **Retry ZSET** | Failed jobs go to `pulse:retry:{type}` ZSET with delayed score. RetryDrainer (2s interval) transfers ready retries back to streams. |
| **TTL Lease** | `SET NX EX 60` on claim. Lease key holds `{workerId, agentId, eventId}`. If worker dies, key expires → orphan detector re-enqueues. |
| **Per-Agent Concurrency** | Redis `INCR` counter per agent (max 3, replaces global `pLimit`). 5-min TTL auto-resets on idle. Floor-guard Lua prevents negative values. |
| **Circuit Breaker** | Hystrix-style (CLOSED → OPEN → HALF_OPEN → CLOSED). When Redis is unhealthy, Pulse stops and polling fallback activates. Recovery is automatic. |
| **Orphan Detection** | 60s cron: `SMEMBERS pulse:active` → pipelined `GET` for all lease keys. Missing = orphaned → re-enqueue + reset stuck DB events. |
| **Dead Letter Queue** | After 5 failed attempts → `RPUSH pulse:dlq:{type}` (capped at 1000). |

## File Guide

```
pulse/
├── index.ts              — Barrel exports (single import point)
├── types.ts              — PulseJob, PulsePriority, PulseConfig, PulseKeys (stream/retry/dedup)
├── redis.ts              — Redis factory (REDIS_URL → ioredis first, Upstash fallback) + bootstrapConsumerGroups()
├── lua-scripts.ts        — Lua scripts: CONDITIONAL_DEL, PLAIN_CONDITIONAL_DEL, FLOOR_DECR, RENEW_LEASE
├── queue.ts              — PulseQueue: enqueue (SET NX + XADD), claimNonBlocking/claimBlocking (XREADGROUP), complete, fail, enqueueRetry, postClaimFlow
├── retry-drainer.ts      — RetryDrainer: 2s interval, ZRANGEBYSCORE → ZREM first → raw XADD
├── redis-health.ts       — RedisHealthProbe circuit breaker (CLOSED/OPEN/HALF_OPEN)
├── orphan-detector.ts    — 60s scan + distributed lock + DB event reset
├── wake-signal.ts        — @deprecated (XREADGROUP BLOCK wakes natively). Kept as no-op.
├── adapters/
│   ├── types.ts          — IPulseRedisAdapter interface (Stream + sorted-set-range methods)
│   ├── ioredis.ts        — IoredisAdapter (TCP, supports XREADGROUP BLOCK — required for Pulse v2)
│   └── upstash.ts        — UpstashAdapter (HTTP, Stream methods throw "not supported")
├── enqueue/
│   ├── inbound.ts        — Push path + sweep for inbound events
│   ├── outbound.ts       — Push path + sweep for outbound events
│   └── scheduled.ts      — Wake scanner (2-tier: next_wake_at agent filter → task scan)
├── workers/
│   ├── base-worker.ts    — Abstract claim loop: priority sweep + BLOCK, shutdown guards, .catch()
│   ├── inbound-worker.ts — → processInboundEvent()
│   ├── outbound-worker.ts — → processOutboundEvent()
│   └── scheduled-worker.ts — → processScheduledTask()
└── __tests__/             — 55 test files (~645 tests)

polling/
├── fallback.ts           — Legacy polling loops (circuit breaker fallback)
└── __tests__/
    └── fallback.test.ts  — 22 tests
```

## Configuration

Set in `worker/src/config.ts` (Zod-validated):

| Env Var | Default | Purpose |
|---------|---------|---------|
| `FEATURE_PULSE` | `false` | Master switch |
| `REDIS_URL` | — | ioredis TCP connection (required when FEATURE_PULSE=true) |
| `PULSE_BLOCK_TIMEOUT_MS` | `2000` | XREADGROUP BLOCK timeout (ms) |
| `PULSE_LEASE_TTL_SECONDS` | `60` | Lease expiry (also orphan detection window) |
| `PULSE_MAX_CONCURRENT_PER_AGENT` | `3` | Per-agent Redis counter limit |

## How It Runs

```
FEATURE_PULSE=false (default)
  → index.ts starts polling fallback (setInterval loops)
  → /trigger webhook calls triggerInboundPoll()

FEATURE_PULSE=true
  → index.ts calls bootstrapConsumerGroups() (creates pulse-workers group on all 12 streams)
  → Starts RedisHealthProbe + Pulse workers + OrphanDetector + RetryDrainer
  → /trigger webhook calls enqueueInboundEvent()
  → If Redis circuit opens → stop Pulse, activate polling fallback
  → If Redis recovers → stop polling, reactivate Pulse

Dedicated relay mode
  → runtime long-polls /api/runtimes/messages/claim-inbound over HTTP
  → control plane claims from Pulse Streams using the same lease semantics as worker Pulse
  → runtime re-issues immediately after real work, falls back to idle interval after empty claim
  → DB claim path remains degraded-mode fallback only
```

## Redis Key Layout

```
pulse:stream:{inbound}:critical    — Stream (consumer group: pulse-workers, MAXLEN ~ 10000)
pulse:stream:{inbound}:normal      — Stream
pulse:stream:{inbound}:background  — Stream
pulse:stream:{outbound}:*          — same pattern
pulse:stream:{scheduled}:*         — same pattern
pulse:stream:{human_task}:*        — same pattern
pulse:retry:{inbound}              — ZSET (delayed retries, score = ready-at timestamp)
pulse:retry:{outbound}             — ZSET
pulse:retry:{scheduled}            — ZSET
pulse:dedup:{eventId}:{attempt}    — STRING (SET NX EX 300)
pulse:active                       — SET of active run IDs
pulse:lease:{runId}                — STRING with TTL (JSON lease info)
pulse:agent:{agentId}:inflight     — STRING counter (5min TTL)
pulse:dlq:{type}                   — LIST (capped at 1000)
pulse:metrics:{date}               — HASH (7-day TTL)
pulse:retry:lock                   — Lock key (5s TTL, UUID token)
pulse:orphan:lock                  — Lock key (10s TTL, UUID token)
```

## Claim → Complete Flow

1. Priority sweep: non-blocking `XREADGROUP COUNT 1` on critical, then normal
2. Blocking: `XREADGROUP COUNT 1 BLOCK 2000` on all 3 priority streams
3. `XACK` immediately after read (D6: don't use PEL for recovery)
4. `INCR` agent inflight counter → if over limit, `floor-DECR` + raw XADD re-enqueue → skip
5. `SET NX EX 60` lease + `SADD active` → if NX fails, `floor-DECR` → skip
6. Process event (delegates to existing processor functions)
7. Lua `CONDITIONAL_DEL` on lease (fenced: only if workerId matches)
8. `SREM active` + `floor-DECR inflight` + metrics increment

## Adapter Layer

```
IPulseRedisAdapter
  ├── IoredisAdapter  (ioredis — TCP, supports XREADGROUP BLOCK — required for Pulse v2)
  └── UpstashAdapter  (@upstash/redis — HTTP, runtime-drain only, Stream methods throw)
```

Adapter selection by env vars:
- `REDIS_URL` set → ioredis adapter (SaaS with Railway Redis, self-hosted, control-plane Pulse, trusted dedicated native Pulse)
- `UPSTASH_REDIS_REST_URL` only → Upstash adapter (runtime-drain only, cannot run Pulse v2 scheduling semantics)
- Neither → Pulse disabled, polling fallback

**Key gotcha**: Pipeline result format differs. Upstash returns raw values, ioredis returns `[null, value]` tuples. Adapter normalizes to raw values.

## Executors

Step executors handle specific job types claimed from the queue. Each implements `StepExecutor` (`canHandle(type) → boolean` + `execute(step, deps)`).

| Executor | Type | File | Purpose |
|----------|------|------|---------|
| `InboundExecutor` | `inbound` | `executors/inbound.ts` | Process inbound events via `processInboundEvent()` |
| `OutboundExecutor` | `outbound` | `executors/outbound.ts` | Process outbound events via `processOutboundEvent()` |
| `ScheduledExecutor` | `scheduled` | `executors/scheduled.ts` | Process scheduled tasks via `processScheduledTask()` |
| `PmSyncOutboundExecutor` | `pm_sync_outbound` | `executors/pm-sync-outbound.ts` | Mirror work items to external PM tools |
| `LinearAgentSessionExecutor` | `linear_agent_session` | `executors/linear-agent-session.ts` | Run agent on Linear issue (Agents API) |

All executors are registered via `createDefaultRegistry()` in `executors/index.ts`.

## Rollback

Set `FEATURE_PULSE=false` on Railway. Next restart reverts to polling. Redis data is harmless (streams auto-trimmed via MAXLEN, TTL-expired keys, or manually flushed).

## Testing

```bash
cd worker
npm run test -- --run src/pulse/__tests__/       # Pulse unit + e2e (~645 tests)
npm run test -- --run src/polling/__tests__/      # Polling fallback (22 tests)
npm run test -- --run                              # Full suite (includes both)
```
