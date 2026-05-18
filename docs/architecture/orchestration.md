# Worker Orchestration Architecture

How events flow from arrival to agent execution. Four layers, each independent.

## Layer Map

```
┌─────────────────────────────────────────────────────────────┐
│ 1. EVENT ARRIVAL                                            │
│    Webhook /trigger  │  Routine trigger │  Cross-agent msg  │
└──────────┬──────────────────┬──────────────────┬────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ORCHESTRATION (scheduler + recovery)                    │
│                                                             │
│  ┌─ Pulse (FEATURE_PULSE=true) ─────────────────────────┐  │
│  │  Redis-backed scheduling backbone                     │  │
│  │  Lease claim / ack / retry semantics                 │  │
│  │  Shared workers may consume directly                 │  │
│  │  Dedicated relay may still be Pulse-backed           │  │
│  └──────────────────────────────────────────────────────┘  │
│                       ▲ circuit breaker ▼                   │
│  ┌─ DB Recovery / Polling Fallback ─────────────────────┐  │
│  │  Postgres claim path when Pulse is unavailable       │  │
│  │  Recovery / degraded-mode fallback, not target state │  │
│  │  Generation-scoped stale callback protection         │  │
│  │  Exponential backoff on failures                     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PROCESSING                                               │
│    processInboundEvent()  │  processOutboundEvent()         │
│    processScheduledTask() │  processRelayInbound()          │
│                                                             │
│    Same functions regardless of orchestration layer.        │
│    Pulse and polling both call these identically.           │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. AGENT RUNTIME                                            │
│                                                             │
│  ┌─ Engine Runner seam (current) ────────────────────────┐  │
│  │  Worker resolves engine → runner                      │  │
│  │  OpenClawEngineRunner is stable                       │  │
│  │  HermesEngineRunner is integrated through the same    │  │
│  │  governance/runtime seams, with flavor-aware policy  │  │
│  │  Dedicated Hermes uses the standalone Hermes runtime  │  │
│  │  wrapper + Lucid bridge                               │  │
│  │  Optional OpenClaw profile migration can run at boot  │  │
│  │  Tool/runtime/governance contracts are engine-neutral │  │
│  │  SaaS adaptations: session isolation, prompt ordering │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Gateway (future — Smart Gateway Phase 3+) ───────────┐  │
│  │  HTTP-based agent loop (OpenClaw Gateway service)     │  │
│  │  Same AgentRuntime interface, different transport      │  │
│  │  Independent of Pulse — only changes layer 4          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Layer Independence

Each layer can change without affecting the others:

| Change | Layers Affected |
|--------|----------------|
| Add new priority lane to Pulse | Layer 2 only |
| Switch from polling to Pulse (`FEATURE_PULSE=true`) | Layer 2 only |
| Add new event type (e.g., billing) | Layer 1 + 3 (new processor) |
| Switch to Gateway runtime | Layer 4 only |
| Add new tool to agent | Layer 4 only |

## Scheduler, Transport, Recovery

Lucid should be described with three separate concerns:

- `Pulse` = scheduling semantics
- `relay` / `runtime_native` = transport boundary
- `DB polling` = fallback or recovery

That distinction matters because dedicated runtimes may still use Lucid relay transport without becoming a second scheduler model.

### Canonical target

- one Pulse scheduling contract everywhere
- one source of truth for claim / ack / retry / lease semantics
- shared workers may consume Pulse directly
- dedicated runtimes may use:
  - relay transport with Pulse-backed control-plane claims
  - native Pulse consumption in trusted modes later
- DB fallback should converge toward recovery-only, not a parallel steady-state scheduler
- control-plane Pulse claims should use the same Redis Streams + lease semantics as worker Pulse, even when the runtime itself is only speaking HTTP relay
- dedicated relay claim loops should long-poll and only fall back to the idle interval after an empty successful claim, so idle runtimes do not hot-loop

### Product-safe wording

Today it is accurate to say:

- Pulse is the scheduling backbone for Lucid runtimes
- shared runtimes are direct Pulse consumers
- dedicated runtimes may still use relay transport while remaining Pulse-backed through the control plane
- Routines are the product/control-plane contract for scheduled and operator-promoted work
- `worker/src/cron` is platform maintenance infrastructure, not the product routine model

It is not yet accurate to say:

- every runtime consumes Pulse directly
- polling is gone everywhere
- relay is the scheduler
- cron alone is the product model for recurring work

For the Routine Kernel boundary, code map, and milestone status, see [`routine-kernel.md`](routine-kernel.md).

### Dedicated Native Pulse Option

`dedicated_native_pulse` is a valid future runtime mode, but it should be treated as an advanced trust boundary, not the default dedicated path.

Requirements before broad rollout:

- same claim / ack / retry / lease semantics as relay-backed dedicated
- scoped runtime credentials for Redis/Pulse access
- explicit revocation story
- identical degraded-mode recovery behavior
- dedicated-native smoke and reconnect coverage

Recommended default:

- `shared` = native Pulse consumer
- `dedicated_relay` = default dedicated transport
- `dedicated_native_pulse` = opt-in trusted mode
- rollout gate = `FEATURE_DEDICATED_NATIVE_PULSE=true` plus org allowlist
- production default remains `relay` until native Pulse is proven live on internal and selected customer runtimes

## Platform vs Engine Boundary

Lucid's target is **agnostic rails, non-agnostic brains**.

### Platform-owned rails
- deployment and runtime identity
- runtime protocol, flavor, and governance lifecycle
- relay/native transport contracts
- approvals, budgets, usage accounting, and audit
- observability and operator controls
- catalog distribution, install state, warm cache, and compatibility metadata

These should be shared across engines where possible.

### Engine-owned brains
- reasoning loop and planning style
- memory model
- self-improvement behavior
- skill internals and skill authoring
- tool-selection behavior
- session semantics and agent UX

These should remain engine-specific and be exposed through adapters, not flattened into one fake standard.

### Current adapter direction
- `EngineRunner` / runtime bridge: platform-owned execution seam
- `EngineSkillAdapter`, `EngineMemoryAdapter`, `EngineToolAdapter`, `EngineSessionAdapter`: engine-specific translation layers
- `PlatformGovernance`: approvals, budget, usage, audit
- `PlatformTransport`: relay transport + runtime-native transport contracts

The goal is to standardize governance and observability outcomes, not internal cognition.

## Runtime Product Promise

The worker architecture must stay aligned with the product promise:

- `shared` is Lucid-managed shared compute with assistant-scoped context rebuilt from platform state
- `dedicated` is an isolated runtime with stronger continuity, more headroom, and better support for runtime-local behavior
- `shared` must be sold as real autonomous product value, not as a fake preview tier
- `dedicated` should differentiate on isolation, continuity, and heavy workload support

For the canonical capability matrix and approved external wording, see [runtime-model-matrix.md](../platform/billing/runtime-model-matrix.md).

## Circuit Breaker (Layer 2 Switching)

```
Redis healthy (CLOSED)
  → Pulse workers active, polling stopped
  → 3 consecutive PING failures → OPEN

Redis down (OPEN)
  → Pulse stopped, polling fallback activated
  → 30s cooldown, then probe → HALF_OPEN

Recovery probing (HALF_OPEN)
  → 3 consecutive successes → CLOSED (back to Pulse)
  → 1 failure → OPEN (back to polling)
```

Transitions are mutually exclusive — no dual-claim risk.

## Deployment Modes

| Mode | Layer 2 | Layer 3 | Layer 4 |
|------|---------|---------|---------|
| **Shared SaaS** | Direct Pulse consumption, DB fallback when degraded | Standard processors | Engine runner (`openclaw` stable, `hermes` integrated) |
| **Self-Hosted** | Direct Pulse consumption, DB fallback when degraded | Standard processors | Engine runner (engine-specific) |
| **Dedicated C1 Relay** | Pulse-backed claim via control plane, DB fallback when degraded | Relay processor | Engine-specific runtime image |
| **Dedicated Native Pulse** | Native Pulse consumption with the same lease semantics | Native adapter | Engine-specific runtime image |
| **Dedicated C2a** | Runtime-native channels plus platform-governed scheduling contract | Native adapter | Engine-specific runtime image |
| **External Agents** | Webhook protocol (HTTP callback) | WebhookExecutor | Any (LangGraph, CrewAI, curl) |

**Important:** generic worker/runtime infrastructure never silently falls back to OpenClaw when an engine is unknown. Unsupported engines fail fast at the registry/boundary layer.

**Capability note:** dedicated relay/native support is now engine/runtime capability-driven rather than hardcoded to OpenClaw. Hermes and OpenClaw both advertise supported execution targets, channel ownership, command/service surfaces, parser support, and EHV policy through the runtime compatibility and heartbeat contracts. Dedicated native Pulse remains an optional advanced mode, not the default trust boundary.

**Authority note:** the important invariant is not "native Redis everywhere." The important invariant is one scheduler contract. Shared workers may consume Pulse directly; dedicated runtimes may remain relay clients if Lucid wants the control plane to stay authoritative for leasing and revocation.

**Implementation note:** the control plane now claims dedicated relay work through the same Redis Streams/ioredis lease model as Pulse workers. Relay remains an HTTP transport boundary; it is no longer backed by a separate queue protocol.

**Migration note:** Hermes runtimes can optionally bootstrap from an existing OpenClaw profile via `hermes claw migrate`. Lucid passes that through as explicit runtime migration metadata and corresponding `HERMES_MIGRATE_*` env vars. This is an onboarding/import path only, not a substitute for tool/channel/runtime parity.

**Skill note:** skill catalog entries may be portable, but skill semantics remain engine-aware. Lucid resolves catalog variants by engine/runtime context and should not assume one universal internal skill behavior model.

## Nerve — Universal Orchestration Engine (Roadmap)

Nerve extends Pulse into a universal orchestration engine. See [`docs/architecture/nerve.md`](nerve.md) for full design.

**Key additions over current Pulse:**
- **Universal Redis adapter**: `IPulseRedisAdapter` → IoredisAdapter (TCP, full Streams semantics) + optional lightweight adapters for degraded/runtime-drain scenarios. Full Pulse scheduling requires the same Streams lease semantics everywhere.
- **Step executors**: ProcessorExecutor, RelayExecutor, CrewExecutor, ApprovalExecutor, WebhookExecutor, HumanTaskExecutor
- **Intelligence layer**: DAG dependency graph + cycle detection, AI-powered task decomposition, 3-layer confidence routing (step/agent/mission)
- **External agent protocol**: Dead-simple HTTP webhook — any HTTP client can be a Nerve agent

**Migration path**: 5 phases from current Pulse to full Nerve. Phase 1 (Redis adapter, ~250-400 lines) unblocks self-hosted. Each phase is independently deployable.

## Code Locations

| Layer | Directory | README |
|-------|-----------|--------|
| Orchestration (Pulse) | `worker/src/pulse/` | [pulse/README.md](../worker/src/pulse/README.md) |
| Orchestration (Polling) | `worker/src/polling/` | [polling/README.md](../worker/src/polling/README.md) |
| Processing | `worker/src/processors/` | — |
| Agent Runtime | `worker/src/agent/` | [agent/README.md](../worker/src/agent/README.md) |
| Channels | `worker/src/channels/` | [channels/README.md](../worker/src/channels/README.md) |
| Cron Jobs | `worker/src/cron/` | [cron/README.md](../worker/src/cron/README.md) |
| Runtime Seam | `worker/src/runtime/` | [runtime/README.md](../worker/src/runtime/README.md) |

## Design Docs

| Topic | Location |
|-------|----------|
| Nerve architecture | `docs/architecture/nerve.md` |
| Pulse full plan | `.claude/plans/woolly-squishing-summit.md` |
| Dedicated native Pulse rollout | `docs/plans/2026-04-12-dedicated-native-pulse-rollout-plan.md` |
| Pulse README | `worker/src/pulse/README.md` |
| Smart Gateway plan | `docs/plans/2026-04-01-smart-gateway-architecture-plan.md` |
| Channel architecture | `docs/plans/2026-03-30-channel-architecture-dedicated-runtimes.md` |
| Competitive analysis | `docs/plans/2026-04-01-abhi-repo-comparison.md` |
| OpenClaw maximization | `docs/superpowers/specs/2026-03-11-openclaw-maximization-design.md` |
| Runtime v2 seam | `docs/superpowers/plans/2026-03-11-openclaw-maximization-plan.md` |
