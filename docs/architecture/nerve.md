# Nerve — Universal Agent Orchestration Engine

Strategic architecture for Lucid's orchestration layer. Nerve extends Pulse into a universal orchestration engine that works across all deployment modes, supports any agent type, and adds intelligent task decomposition with confidence-based routing.

## Why Nerve Exists

Pulse now provides the scheduling backbone with Redis Streams, lease-based claims, retries, and degraded-mode DB recovery. Shared workers consume Pulse directly. Dedicated runtimes can either use relay transport to a Pulse-backed control-plane scheduler or, in trusted modes, consume Pulse directly.

Nerve builds on top of that scheduler contract. It adds universal orchestration concerns: task decomposition, dependency DAGs, confidence routing, and multi-agent step execution.

## Current State vs Nerve

| Capability | Current | Nerve (Universal) |
|---|---|---|
| **SaaS orchestration** | Pulse (~50ms, full features) | Same Pulse (~50ms) |
| **Self-hosted** | Pulse via standard Redis | **Same Pulse semantics, self-hosted Redis** |
| **Dedicated C1** | Relay transport to Pulse-backed control plane | **Relay or native Pulse (trusted mode)** |
| **Dedicated C2a** | Runtime-native channels + Pulse-backed scheduler | **Relay or native Pulse (trusted mode)** |
| **External agents** | Not supported | **HTTP webhook protocol** |
| **Task decomposition** | Manual | **AI-powered goal decomposition** |
| **Dependencies** | None | **DAG with cycle detection** |
| **Confidence routing** | None | **3-layer (step/agent/mission)** |
| **Step types** | Agent events only | **Agent + webhook + human + approval + delay** |

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │            NERVE ENGINE                   │
                    │                                           │
                    │  ┌─ Universal Pulse ───────────────────┐ │
                    │  │  Redis Streams + lease semantics     │ │
                    │  │  ioredis / standard Redis backbone   │ │
                    │  │                                       │ │
                    │  │  Priority   Per-agent     Orphan      │ │
                    │  │  streams    concurrency   detection   │ │
                    │  │            (Redis INCR)  (TTL lease)  │ │
                    │  │                                       │ │
                    │  │  DLQ       Retry queue    Adaptive    │ │
                    │  │            + leases       backoff     │ │
                    │  └───────────────────────────────────────┘ │
                    │                                           │
                    │  ┌─ Access Modes ─────────────────────┐  │
                    │  │  Direct Pulse  (shared, self-hosted) │  │
                    │  │  Relay         (dedicated default)   │  │
                    │  │  Native Pulse  (trusted dedicated)   │  │
                    │  └───────────────────────────────────────┘ │
                    │                                           │
                    │  ┌─ Step Executors ────────────────────┐  │
                    │  │  ProcessorExecutor   (inbound/outbound) │
                    │  │  RelayExecutor       (C1 runtimes)     │
                    │  │  CrewExecutor        (multi-agent)     │
                    │  │  ApprovalExecutor    (human gate)      │
                    │  │  WebhookExecutor     (external agents) │
                    │  │  HumanTaskExecutor   (channel-routed)  │
                    │  └───────────────────────────────────────┘ │
                    │                                           │
                    │  ┌─ Intelligence Layer ────────────────┐  │
                    │  │  DependencyGraph + cycle detection    │  │
                    │  │  ConfidenceRouter (3-layer scoring)   │  │
                    │  │  DagPlanner (AI decomposition)        │  │
                    │  │  Auto-assignment (skill + health)     │  │
                    │  └───────────────────────────────────────┘ │
                    └─────────────────────────────────────────┘
```

## Universal Pulse — Scheduler Contract

The key invariant is no longer "which Redis client is used." It is that every runtime path follows the same scheduler contract: claim, lease, retry, complete, fail, and degraded-mode recovery.

### Transport split

```
Pulse scheduler
  ├── shared/self-hosted workers      → direct Pulse consumption
  ├── dedicated relay runtimes        → HTTP transport, Pulse-backed control-plane claims
  └── dedicated native Pulse runtimes → direct Pulse consumption in trusted modes
```

## How Each Deployment Mode Works

### Shared SaaS (Direct Pulse)

```
Webhook → INSERT inbound event → enqueue to Pulse
Worker claim loop → XREADGROUP BLOCK → process → complete
```
No change from current Pulse. ~50ms claim latency.

### Self-Hosted (Direct Pulse — standard Redis)

```
Webhook → INSERT inbound event → enqueue to Pulse
Worker claim loop → XREADGROUP BLOCK → process → complete
```
Same Pulse engine, standard Redis. ~50ms claim latency. Previously 5s DB polling.

### Dedicated C1 (Relay transport — control plane claims on behalf)

```
Webhook → INSERT inbound event → enqueue to Pulse (control plane Redis)
Runtime long-polls: GET /claim-next
  → Control plane claims from Pulse on behalf of runtime
  → Returns RunPacket + lease token
Runtime processes → POST /complete
```
Control plane has Pulse access. Runtime doesn't touch Redis. ~200-500ms.

### Dedicated Native Pulse (trusted runtimes)

```
Runtime boots with native Pulse transport
  → joins the same Pulse scheduler contract directly
  → claims / renews / completes with the same lease semantics
```

This is an advanced trust mode, not the default dedicated path.

### Dedicated C2a (runtime-native channels)

```
Telegram/Discord message arrives at runtime in-process
  → Runtime POST /enqueue-and-claim-self
  → Control plane: INSERT + enqueue to Pulse + claim for runtime (atomic)
  → Returns lease token
Runtime processes locally → POST /complete
```
New endpoint. Runtime enters same Pulse state machine as everyone else.

### External/Imported Agents (Webhook Protocol)

```
Nerve enqueues step to Pulse → WebhookExecutor fires:
  POST {agent_webhook_url}
  { "step_id": "...", "input": {...}, "callback_url": "https://..." }

External agent processes → calls back:
  POST {callback_url}
  { "status": "completed", "output": {...}, "confidence": 0.85 }
```
Any HTTP client can be a Nerve agent. OpenClaw instances, LangGraph, CrewAI, curl scripts.

## Competitive Differentiation vs Paperclip

### Their Architecture

Paperclip (openclaw-mission-control) uses:
- **Redis lists + sorted sets** for task queue (LPUSH/RPOP/BLPOP + ZADD)
- **Single worker process** (no distributed claiming)
- **15-second throttle** between tasks
- **No priority lanes** (FIFO only)
- **No per-agent concurrency** control
- **Generation-counter orphan detection** (manual, not automatic)
- **Drop after 3 retries** (no DLQ)
- **Own agents only** (gateway RPC protocol)
- **Board/kanban-based** task management (humans create and assign tasks)

### Head-to-Head Comparison

| Dimension | Paperclip | Nerve |
|---|---|---|
| **Queue backend** | Redis lists (separate from DB) | **Redis ZSET (universal — same engine everywhere)** |
| **Claim mechanism** | BLPOP (single consumer) | **Lua ZPOPMIN (multi-worker atomic)** |
| **Push notification** | None (blocking pop) | **Direct enqueue resets claim loop (~50ms)** |
| **Distribution** | Single worker only | **Any number of workers** |
| **Throttle** | 15s between tasks | **Target <100ms when active (~30x faster)** |
| **Priority** | None | **3 lanes: critical/normal/background** |
| **Per-agent concurrency** | None | **Redis counter (configurable per-agent)** |
| **Orphan detection** | Generation counter (manual) | **Redis TTL lease (automatic, 60s)** |
| **DLQ** | Drop after 3 retries | **Redis LIST per type (inspectable, capped)** |
| **If Redis dies** | Queue is dead | **Postgres polling fallback (circuit breaker)** |
| **Self-hosted Redis** | Required (no fallback) | **Already in docker-compose + Postgres fallback** |
| **Deployment universality** | Single-process only | **SaaS + self-hosted + dedicated + local** |
| **Agent compatibility** | Own gateway only | **Any agent (webhook protocol)** |
| **Task decomposition** | Manual (humans create tasks) | **AI-powered (goal to steps)** |
| **Assignment** | Manual (humans assign agents) | **Auto (skill + confidence + health matching)** |
| **Confidence routing** | Schema exists, unused | **3-layer with channel-aware escalation** |
| **Dependencies** | DAG + cycle detection | **DAG + cycle detection + conditional edges** |
| **Multi-channel** | None | **Slack, Telegram, Discord, WhatsApp, email** |
| **Multi-runtime** | Single process | **Shared, dedicated, self-hosted, external** |
| **Step types** | Agent tasks only | **Agent + webhook + human + approval + delay** |
| **Transactional safety** | No (Redis + DB separate) | **Dual-write + sweep safety net** |
| **Visual workspace** | Kanban board | **Mission timeline + DAG view (planned)** |
| **Templates** | None | **Reusable workflow blueprints (planned)** |

### Why We're Far Ahead (9 Dimensions)

Not one killer feature — the **combination** is unreachable:

1. **Universal transport** — Same Pulse engine (Redis ZSET + Lua) on every deployment mode. Paperclip is single-process only.
2. **~30x faster claim latency** — Target <100ms when active vs 15s throttle. Adaptive backoff prevents quota burn at idle.
3. **Any-agent protocol** — Dead-simple HTTP webhook. OpenClaw, LangGraph, CrewAI, external APIs. Paperclip only speaks to its own gateway.
4. **AI decomposition** — "Handle this customer complaint" auto-decomposes into research + response + approval + delivery. Paperclip requires humans to create every task.
5. **Confidence intelligence** — Agent reports confidence, system routes: high → auto-approve, medium → specialist, low → human via Slack/Telegram. Paperclip has a confidence float that nothing reads.
6. **Multi-channel orchestration** — Steps execute across Slack, Telegram, Discord, WhatsApp. Human approval via the operator's preferred channel. Paperclip has no channels.
7. **Multi-runtime execution** — Same workflow runs on cloud SaaS, dedicated infrastructure, self-hosted Docker, or external compute. Zero config change. Paperclip runs on one machine.
8. **Adaptive re-planning** — If a step fails, system generates alternative steps. Paperclip has no re-planning.
9. **Fault tolerance** — Redis down? Postgres fallback. Worker dies? Lease expires, orphan detector re-enqueues. Agent stuck? Per-agent concurrency prevents cascade. Paperclip: Redis down = queue dead, worker crash = backlog accumulates.

Paperclip is **project management for AI agents** — humans create tasks on a kanban board and manually assign agents. Nerve is an **autonomous execution engine** — describe the goal, agents deliver.

## Confidence System (What Paperclip Failed to Build)

### Three Layers

**Step Confidence** (0.0-1.0): Agent self-reports after execution.
- OpenClaw agents: LLM structured output ("rate your confidence")
- External agents: optional field in webhook callback (default 0.7)
- Human steps: always 1.0 (human-verified)

**Agent Confidence** (historical): Rolling average from last N completed steps.
- Used for auto-assignment: high-confidence agents get critical tasks
- Visible in Mission Control health scores

**Mission Confidence** (aggregate): Weighted average of step confidences.
- Live dashboard indicator
- Below threshold triggers operator notification

### Routing Rules (per-step configurable)

```
confidence >= 0.8  →  Auto-approve, continue to next step
0.5 - 0.8         →  Route to human via best channel (Slack for urgent, email for async)
< 0.5             →  Pause step, escalate to mission operator
```

## External Agent Webhook Protocol

Dead simple. Two endpoints:

### Outbound (Nerve to External Agent)
```
POST {agent_webhook_url}
Content-Type: application/json

{
  "step_id": "uuid",
  "mission_id": "uuid",
  "input": { "task": "Research competitor pricing", "context": {...} },
  "callback_url": "https://api.lucid.foundation/nerve/callback/{step_id}",
  "timeout_seconds": 300
}
```

### Inbound (External Agent to Nerve)
```
POST /nerve/callback/{step_id}
Content-Type: application/json

{
  "status": "completed",
  "output": { "findings": "...", "sources": [...] },
  "confidence": 0.85,
  "artifacts": [{ "type": "markdown", "content": "..." }]
}
```

Any HTTP client can implement this. A curl script, a Python function, a LangGraph agent — all valid Nerve participants.

## Migration Path

### Phase 1: Universal Pulse (Redis Adapter)
- Create `IPulseRedisAdapter` interface (~50 lines)
- Implement `UpstashAdapter` (wraps existing `@upstash/redis`)
- Implement `IoredisAdapter` (wraps `ioredis`)
- Update `pulse/redis.ts` factory to select by env vars
- Self-hosted gets Pulse via `REDIS_URL=redis://redis:6379`
- ~250-400 changed lines total

### Phase 2: REST Claim Unification
- C1 claim endpoint uses Pulse internally (claims on behalf of runtime)
- C2a gets `enqueue-and-claim-self` endpoint
- All deployment modes go through same Pulse state machine

### Phase 3: Step Execution Protocol
- `ITaskExecutor` interface for pluggable executors
- `ProcessorExecutor` wraps existing `processInboundEvent()` etc.
- `ApprovalExecutor` wraps `mc_pending_approvals`
- `WebhookExecutor` for external agents

### Phase 4: Task Decomposition + DAG
- `orchestration_tasks` table (pending/claimed/running/waiting/completed/failed/dlq)
- `orchestration_dependencies` table (edges with cycle detection)
- `DagPlanner` — AI decomposition of goals into steps
- `ConfidenceRouter` — deterministic routing by confidence thresholds

### Phase 5: Intelligence Layer
- Auto-assignment by skill catalog + agent confidence + health scores
- Adaptive re-planning on step failure
- Mission templates (reusable workflow blueprints)

## File Structure (Planned)

```
worker/src/orchestration/        # Nerve engine (above Pulse)
  index.ts, types.ts, config.ts
  engine/
    OrchestrationEngine.ts       # Top-level lifecycle
    LeaseManager.ts              # Universal lease semantics
    ConcurrencyGovernor.ts       # Per-agent limits
    DlqPolicy.ts                 # Dead letter routing
  protocol/
    StepProtocol.ts              # Start/heartbeat/complete
    AgentRunsLedger.ts           # agent_runs writer
  graph/
    DependencyGraph.ts           # DAG + edges
    DagPlanner.ts                # AI decomposition
    cycle-detection.ts           # DFS validator
  executors/
    ProcessorStepExecutor.ts     # Wraps existing processors
    RelayStepExecutor.ts         # C1 dispatch
    CrewStepExecutor.ts          # Multi-agent fan-out
    ApprovalStepExecutor.ts      # Human approval gate
    WebhookStepExecutor.ts       # External agents
    HumanTaskExecutor.ts         # Channel-routed human work

worker/src/pulse/                # Pulse engine (unchanged except redis.ts)
  redis.ts                       # Updated: adapter factory
  adapters/
    types.ts                     # IPulseRedisAdapter interface
    upstash.ts                   # Upstash HTTP adapter
    ioredis.ts                   # Standard TCP adapter
```

## Design Docs

| Topic | Location |
|-------|----------|
| Nerve architecture (this doc) | `docs/architecture/nerve.md` |
| Orchestration layers | `docs/architecture/orchestration.md` |
| Pulse implementation | `worker/src/pulse/README.md` |
| Pulse full plan (5 phases) | `.claude/plans/woolly-squishing-summit.md` |
| Smart Gateway (Phase 3+) | `docs/plans/2026-04-01-smart-gateway-architecture-plan.md` |
| Channel architecture | `docs/plans/2026-03-30-channel-architecture-dedicated-runtimes.md` |
| Competitive analysis | `docs/plans/2026-04-01-abhi-repo-comparison.md` |
