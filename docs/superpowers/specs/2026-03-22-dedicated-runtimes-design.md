# Dedicated Runtimes — Multi-Runtime Fleet Management

**Date:** 2026-03-22
**Status:** Historical design, superseded by the 2026-05 runtime parity implementation
**Scope:** DB schema + REST phone-home + DataSink abstraction + UI + capability system (3 deployment modes)

> **Current source of truth (2026-05-08):** use `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`, `docs/platform/mission-control/dedicated-runtimes.md`, `packages/runtime-compat/`, `packages/runtime-adapters/`, `packages/runtime-adapter-sdk/`, and `packages/engine-home/` for the implemented OpenClaw/Hermes runtime capability plane, re-home behavior, management commands, EHV/HHV/OHV, BYO/local bridge, and Mission Control sanitizer rules.

## Goal

Enable agents running on independent infrastructure (Railway, Akash, Phala, io.net, Nosana, Docker) to be monitored, controlled, and approved from the same Mission Control dashboard as SaaS agents. The architecture supports three deployment modes (`saas | self-hosted | hybrid`) from the same codebase, preparing for open-source self-hosting while maintaining the multi-tenant SaaS offering.

**Key invariant:** Lucid-L2 owns deployment lifecycle (launch, stop, scale, logs, reconcile). LucidMerged owns engine/runtime semantics, operational data ingestion, and Mission Control visualization. Providers are infrastructure targets; engines are agent frameworks.

**Maintenance invariant:** customer runtime maintenance is initiated from Mission Control, but executed server-side through a provider-neutral maintenance service. The frontend is only a trigger/visibility surface. Provider adapters carry out the actual infrastructure operation.

## 1.5 Platform Vocabulary (Implemented)

| Term | Meaning |
|---|---|
| `engine` | Agent framework/runtime (`openclaw`, `hermes`, future engines) |
| `runtimeFlavor` | Operating model (`shared`, `c1_managed`, `c2a_autonomous`) |
| `channelOwnership` | Who owns transport + secrets (`lucid_relay`, `runtime_native`) |
| `provider` | Where it runs (`railway`, `akash`, `phala`, `io.net`, `nosana`, `docker`, `manual`) |
| `runtimeProtocol` | Control-plane wire contract (`lucid-runtime-v1`, `lucid-runtime-v2`) |
| `migration` | Optional engine bootstrap/import metadata (for example Hermes importing an OpenClaw profile) |

**Implemented boundary:** `LucidMerged` now stores `engine`, `runtime_flavor`, `channel_ownership`, and `runtime_protocol` on dedicated runtime records. `Lucid-L2` stores image-launch metadata in `descriptor_snapshot.metadata`.

**Current engine bootstrap note:** Hermes runtimes can optionally receive OpenClaw migration metadata. `LucidMerged` persists that in first-class `runtime_bootstrap_config` (with fallback reads from legacy `engine_metadata` during rollout), emits `HERMES_MIGRATE_*` env vars during config bootstrap/deploy, and the Hermes wrapper runs `hermes claw migrate` before starting the Lucid bridge when explicitly enabled.

**Core principle:**

> "Same fleet, same feed, same controls — regardless of where the worker runs."

## 1. Problem Statement

Mission Control currently assumes all agents run on the shared SaaS worker with direct Supabase access. This creates three gaps:

1. **Visibility gap**: Customers deploying independent agent runtimes on Railway/Akash/etc. have zero operational visibility — no health scores, no live feed, no approval flow
2. **Control gap**: No way to pause, kill, or approve elevated tool calls for agents running outside the SaaS worker
3. **Platform gap**: The `DeploymentMode = 'saas' | 'vps'` type doesn't model the actual deployment scenarios (self-hosted single-tenant, hybrid, multi-runtime SaaS)

### What This Enables

- Business+ SaaS users deploy dedicated runtimes with one-click L2 deployment
- Self-hosted users get all features unlocked, manage their own instance + optional additional runtimes
- Agents from all runtimes appear in the same fleet table, same live feed, same approval flow
- Worker business logic is deployment-mode-agnostic via DataSink abstraction

### UX Decisions (Confirmed)

- Terminology: **"Dedicated Runtime"** (never "VPS", "self-hosted", or "instance")
- In SaaS: Free/Pro users see **zero evidence** that dedicated runtimes exist (Business+ only)
- In self-hosted: All features unlocked, "This Instance" label replaces "Lucid Cloud"
- Industry pattern: Vercel (invisible infra), Heroku (plan-gated), GitLab ("Self-managed"), Plane (full parity for self-hosted)

### 1.1 Competitive Audit — Open-Source Mission Controls

#### builderz-labs/mission-control (~3K stars, Next.js 16 + SQLite)

**Patterns adopted:**
- **Triple-layer real-time**: SSE (primary) + WebSocket (gateway) + smart polling (visibility-aware, exponential backoff). Our `useRealtimeQuery` already does polling + Supabase RT — we match this resilience.
- **Gateway-optional architecture**: Works standalone, optionally connects to OpenClaw gateway. Same as our `isL2Available()` pattern.
- **Exec approval with glob allowlists**: Per-agent glob patterns (e.g. `read_file:src/**`) with live preview and risk-level viz. More granular than our tool-name-level `approval_required_tools`. Future enhancement.
- **ServerEventBus**: Node EventEmitter with 19 event types. Simple API route → emit → SSE push pattern.

**Avoided:** SQLite (no concurrent writes/RLS), catch-all 35-panel routing, gamification features.

#### abhi1693/openclaw-mission-control (~2.9K stars, FastAPI + Next.js 16 + PostgreSQL)

**Patterns adopted:**
- **Lifecycle generation counters**: Monotonically increasing `generation INT` per runtime. Stale async jobs check generation and abort if mismatched. Prevents ghost operations on recycled runtimes. **We add this to `dedicated_runtimes`.**
- **Write-coalesced heartbeats**: Rate-limits DB writes. Live columns always updated, history table every 5th beat. **We adopt this** — write to `dedicated_runtimes` live columns every heartbeat, `vps_health_snapshots` every 5th (every 2.5 min).
- **Confidence-based approval gating**: Agents self-assess confidence (0-100), auto-approve above threshold. Future enhancement.
- **Control-plane / data-plane separation**: Dashboard orchestrates through external gateways, never runs agents directly. Same as our L2 integration.
- **OpenAPI-driven codegen**: Backend → OpenAPI spec → auto-generated React Query hooks. Zero API drift. Worth considering long-term.

**Avoided:** SSE with 2s DB polling per client (doesn't scale), empty multi-tenancy scaffolding (route-level only), no pause/resume (only provision/delete), no pre-aggregated metrics.

---

## 2. Three Deployment Modes

### 2.1 Mode Definitions

| Mode | `NEXT_PUBLIC_DEPLOYMENT_MODE` | Who runs it | Entitlements | L2 available |
|------|-------------------------------|-------------|--------------|-------------|
| **saas** | `'saas'` (default) | Lucid hosts | Plan-gated (free/pro/business) | Yes (managed) |
| **self-hosted** | `'self-hosted'` | Customer hosts | All features unlocked | Optional (`LUCID_L2_GATEWAY_URL`) |
| **hybrid** | `'hybrid'` | Customer worker + Lucid control plane | Plan-gated | Yes (managed) |

**Source**: `src/lib/mission-control/capabilities.ts` — `DeploymentMode` type changes from `'saas' | 'vps'` to `'saas' | 'self-hosted' | 'hybrid'`

### 2.2 Shared Deployment Mode Utility

```typescript
// src/lib/deployment-mode.ts (NEW — single source of truth)
import type { DeploymentMode } from '@/lib/mission-control/capabilities'

export function getDeploymentMode(): DeploymentMode {
  return (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE as DeploymentMode) || 'saas'
}

export function isSelfHosted(): boolean {
  return getDeploymentMode() === 'self-hosted'
}

export function isL2Available(): boolean {
  return !!process.env.LUCID_L2_GATEWAY_URL
}
```

Consumed by: `use-capabilities.ts`, `evaluate.ts` (entitlements), API routes, setup wizard.

### 2.3 Entitlement Bypass (Self-Hosted)

**Current** (`src/hooks/use-capabilities.ts` line ~30): Reads `NEXT_PUBLIC_DEPLOYMENT_MODE`, defaults to `'saas'`, filters capability registry by mode + plan rank.

**Change**: When `deploymentMode === 'self-hosted'`, `hasCapability()` returns `true` for ALL capabilities. No plan check, no mode filtering.

**Current** (`src/lib/entitlements/evaluate.ts`): Evaluates plan limits for features.

**Change**: When `isSelfHosted()`, skip all plan/feature checks — everything is available.

### 2.4 Mode-Adaptive UX

| Element | SaaS (Free/Pro) | SaaS (Business+) | Self-Hosted |
|---------|-----------------|-------------------|-------------|
| Runtimes section | Hidden | Visible | Visible ("This Instance" + Add Runtime) |
| Dedicated badge | Hidden | Shown on dedicated agents | Shown on remote agents |
| Setup wizard | Hidden | Full L2 wizard | L2 wizard (if configured) or manual connect |
| Cloud label | N/A | "Lucid Cloud" | "This Instance" |
| Plan gating | Enforced | Enforced | Bypassed (all features) |

---

## 3. Architecture

### 3.1 Three-Layer Split

| Layer | Owns | System |
|-------|------|--------|
| **L2 SDK** | Deployment lifecycle (launch, stop, scale, logs, reconcile, health checks) | LucidL2 Gateway (optional) |
| **Lucid Control Plane** | Operational data ingestion (events, approvals, health scores, costs, metrics) | LucidMerged API routes |
| **Mission Control** | Visualization of both layers in unified dashboard | LucidMerged UI components |

### 3.1.1 Scheduler vs Transport vs Recovery

Dedicated runtimes should be reasoned about using three separate concepts:

- `Pulse` = scheduling semantics
- `relay` / `runtime_native` = transport mode
- `Postgres fallback` = recovery path

This avoids the common confusion that "relay" and "Pulse" are competing runtime models. They are not.

#### Canonical target

- one scheduler contract everywhere:
  - `claim`
  - `ack`
  - `retry`
  - lease visibility / timeout
  - backpressure and recovery semantics
- control plane remains the authority for scheduler semantics
- shared workers may consume Pulse directly because they are trusted Lucid workers
- dedicated runtimes may choose between:
  - `dedicated_relay`
  - `dedicated_native_pulse`
- DB fallback should move toward recovery-only, not a second hot-path scheduler
- control-plane relay claims should use the same Redis Streams/ioredis semantics as shared Pulse workers
- relay claim transport should long-poll instead of fixed hot-loop polling

#### Why relay still exists

Relay is not just legacy drift. It preserves an important boundary:

- no direct Redis credentials required on the runtime
- easy credential revocation
- easier BYO and multicloud deployment
- control-plane-owned claim surface

So the long-term goal is not "remove relay at all costs."
The goal is:

- keep relay if it is the right transport boundary
- make relay use the same Pulse scheduler semantics as shared/native consumers

#### Dedicated runtime options

| Mode | Transport | Scheduler semantics | Best fit |
|---|---|---|---|
| `dedicated_relay` | HTTP relay to Lucid control plane | Pulse-backed, control-plane-authoritative | safest default, managed dedicated, BYO with minimal infra exposure |
| `dedicated_native_pulse` | runtime-native Pulse consumption | same Pulse lease semantics | trusted runtimes, lower latency, tighter infra coupling |

The key invariant is that these are transport choices, not separate scheduling products.

#### Current implementation state

- `shared` workers consume Pulse directly through worker-side Redis Streams consumers
- `dedicated_relay` runtimes call `/api/runtimes/messages/claim-inbound` over HTTP
- that claim endpoint now uses the same Pulse-style Streams lease semantics on the control plane before falling back to DB recovery
- empty relay claims return to the configured idle interval; non-empty claims immediately re-issue so busy runtimes stay hot without hammering the control plane when idle

#### Dedicated native Pulse option

`dedicated_native_pulse` should exist as an explicit advanced runtime mode, not as an accidental side effect of enabling Redis.

Required properties:

- same Pulse claim / ack / retry / lease semantics as shared and relay-backed dedicated
- runtime-scoped credentials, never broad shared Redis access
- explicit runtime capability flag and deployment-mode selection
- revocable access without needing to rebuild scheduler semantics
- parity with relay-backed completion, failure, and lease-renew behavior

Recommended trust model:

- default dedicated mode remains `dedicated_relay`
- `dedicated_native_pulse` is opt-in for:
  - Lucid-managed trusted runtimes
  - advanced BYO runtimes with scoped credentials
  - low-latency or high-throughput workloads where the extra trust is justified

### 3.1.2 Provider-Agnostic Maintenance

Dedicated runtime maintenance should follow the same abstraction rule as scheduling:

- Mission Control owns operator intent and audit trail
- Lucid control plane owns maintenance orchestration
- provider adapters own provider-specific execution

Current implementation direction:

- `dedicated_runtimes` store provider-neutral maintenance metadata:
  - `managed_by_lucid`
  - `maintenance_channel`
  - `auto_update_policy`
  - image reference fields
  - last maintenance action / timestamp / error
- `runtime_maintenance_jobs` provide an append-only job log for redeploy and future restart / rollback actions
- `L2` is the first maintenance adapter, because it already abstracts infrastructure providers for launch/redeploy behavior

This keeps LucidMerged open-source friendly:

- Mission Control does not embed Railway-specific control logic
- provider-specific behavior is isolated
- future adapters can target Cloud Run, Kubernetes, Docker hosts, or external orchestrators without rewriting the UI contract

This is a transport-mode upgrade, not a product rewrite.

#### Rollout plan for `dedicated_native_pulse`

1. Unify scheduler semantics first
   - already in progress: control-plane relay claims and shared workers must use the same Streams lease model
2. Keep relay as the default dedicated mode
   - preserves revocation and minimal-infra BYO ergonomics
3. Add explicit runtime mode/config
   - runtime record must declare `channel_ownership`, `runtime_protocol`, and whether native Pulse is allowed
4. Introduce scoped Redis auth
   - dedicated native consumers need runtime-scoped credentials or a brokered token model
5. Add dedicated-native smoke coverage
   - claim
   - complete
   - fail
   - lease renew
   - reconnect / retry / orphan recovery
6. Roll out behind a narrow allowlist
   - internal runtimes first
   - then managed customers
   - then advanced BYO only if the ops model remains clean

This keeps Lucid on the correct architecture:

- one scheduler contract
- multiple transport boundaries
- DB fallback only for degraded recovery

Detailed rollout plan:

- [Dedicated Native Pulse — Design And Rollout Plan](../../../plans/2026-04-12-dedicated-native-pulse-rollout-plan.md)

### 3.2 Data Flow

```
MC "Add Runtime"                    L2 Gateway (optional)
┌──────────────┐  POST /v1/agents  ┌──────────────────┐
│ Setup Wizard │ ─────────────────►│ LaunchService    │
│ (engine,     │  /launch          │  → RailwayDeployer│
│  runtime     │                   │  → AkashDeployer  │
│  flavor,     │                   │  → PhalaDeployer  │
│  name)       │                   │                    │
└──────────────┘                   │  → DockerDeployer │
                                   │  → IoNetDeployer  │
                                   │  → NosanaDeployer │
                                   └────────┬─────────┘
                                            │ deploys + auto-injects env vars
                                            ▼
                                   ┌──────────────────┐
                                   │ Dedicated Worker  │
                                   │ (Railway/Akash/..)│
                                   │                   │
                                   │ LUCID_RUNTIME_ID      │
                                   │ LUCID_RUNTIME_KEY     │
                                   │ LUCID_CONTROL_PLANE_URL │
                                   │ LUCID_ENGINE          │
                                   │ LUCID_RUNTIME_FLAVOR  │
                                   │ LUCID_RUNTIME_PROTOCOL│
                                   └────────┬─────────┘
                                            │ REST (every 30s heartbeat +
                                            │ real-time events/approvals)
                                            ▼
                              ┌─────────────────────────┐
                              │ Lucid Control Plane API  │
                              │ /api/runtimes/heartbeat  │
                              │ /api/runtimes/events     │
                              │ /api/runtimes/approvals  │
                              └────────────┬────────────┘
                                           │ stores in Supabase
                                           ▼
                              ┌─────────────────────────┐
                              │ Mission Control UI       │
                              │ (reads same MC tables)   │
                              └─────────────────────────┘
```

When L2 is not available (self-hosted without `LUCID_L2_GATEWAY_URL`): the wizard provides manual connection instructions (runtime ID + API key to set as env vars on the external worker).

### 3.2.1 Current truth vs target

Current implementation is allowed to be hybrid during rollout:

- shared workers can consume Pulse directly
- dedicated runtimes can still poll relay claim endpoints
- control-plane claim endpoints may use Pulse first and DB fallback second

Target state:

- Pulse is the single scheduler contract
- relay is transport only
- DB fallback is recovery only

This is the standard Lucid architecture target and should be the framing used in future refactors.

### 3.3 What L2 Provides (Already Built)

**Source**: `Lucid-L2/offchain/packages/engine/src/compute/`

| L2 Feature | How MC Uses It | Source File |
|---|---|---|
| `POST /v1/agents/launch` | MC wizard calls this to deploy | `control-plane/launch/service.ts` |
| `GET /v1/agents/{id}/status` | MC reads deployment state | `control-plane/store/types.ts` |
| `GET /v1/agents/{id}/logs` | MC can show sanitized Lucid runtime diagnostics | Gateway routes |
| `POST /v1/agents/{id}/terminate` | MC "Remove Runtime" action | `control-plane/launch/service.ts` |
| 6 IDeployer implementations | Railway, Akash, Phala, io.net, Nosana, Docker | `providers/` directory |
| Reconciler (60s) | Auto-detects drift, repairs stuck deployments | `control-plane/reconciler.ts` |
| Passport system | Agent identity for deployed worker | `engine/src/identity/` |
| Auto-injected env vars | Worker gets all credentials automatically | Launch service |

### 3.4 What Changes vs What Doesn't

| Concern | Change? | Details |
|---------|---------|---------|
| Fleet table | Minimal | Agents gain optional `[Dedicated]` badge (Business+ in SaaS, always in self-hosted) |
| Command Center | None | Same 4-pane layout, same feed, same controls |
| Agent Detail | None | Same 7 tabs, same guardrails |
| Approvals | Ingestion path | Dedicated workers POST approvals via REST instead of direct DB write |
| System page | New section | "Runtimes" panel (capability-gated) |
| Canvas | None | Dedicated agents appear as nodes like any other |
| Capability system | Extended | New `runtime:dedicated` capability, 3 deployment modes |
| Entitlements | Mode-aware | Self-hosted bypasses all plan checks |

### 3.5 Native Mutation Governance

Dedicated Hermes runtimes now support runtime-local native mutation with control-plane governance.

#### Policy model

- `shared` → deny durable native memory/skill mutation
- `c1_managed` → allow durable native mutation
- `c2a_autonomous` → allow durable native mutation
- `candidate_only` remains a reserved rollout state for future staged shared learning

#### Execution and control-plane split

- dedicated runtime executes allowed native Hermes mutations locally
- Lucid does not replace Hermes-native memory or skill semantics
- Lucid governs around mutation through:
  - typed native mutation candidate events
  - Mission Control persistence and review state
  - approve / reject / promote actions
  - assistant/org memory promotion
  - org-private skill installation and later publication flow

#### Current operational surface

- assistant detail shows recent native mutation candidates
- Mission Control exposes an org-level native mutation queue
- promoted memory writes can apply into durable Lucid memory scopes
- promoted skills can become org-private installed skills and later publish into the catalog workflow

This preserves the Lucid rule:

- agnostic rails
- non-agnostic brains

Hermes keeps native mutation ownership. Lucid owns policy, audit, review, and promotion around that mutation.

---

## 4. Worker DataSink Abstraction

Strategy pattern so worker business logic is deployment-mode-agnostic. The worker doesn't know (or care) whether it's writing directly to Supabase or phoning home via REST.

### 4.1 Interface

```typescript
// worker/src/runtime/data-sink.ts

export interface HeartbeatPayload {
  runtimeId: string
  engine?: string
  runtimeProtocol?: string
  engineVersion?: string
  runtimeVersion?: string
  cpuPercent: number
  ramPercent: number
  diskPercent: number
  gpuPercent?: number
  pendingEvents: number
  deadLetters: number
  openclawVersion?: string // legacy compatibility for OpenClaw v1 runtimes
  agentCount: number
  uptimeSeconds: number
}

export interface FeedEvent {
  agentId?: string
  eventType: 'tool_call' | 'tool_result' | 'error' | 'message_received' | 'message_sent' | 'run_started' | 'run_finished'
  severity: 'info' | 'warning' | 'error'
  payload: Record<string, unknown>
}

export interface ApprovalRequest {
  agentId: string
  toolName: string
  toolArgs: Record<string, unknown>
  runId: string
  timeoutMs: number
}

export type ApprovalResolution = { decision: 'approved' | 'denied'; resolvedAt: string }

export interface HealthScorePayload {
  agentId: string
  overallScore: number
  dimensions: Record<string, number>
}

export interface CostPayload {
  agentId: string
  runId: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface DataSink {
  reportHeartbeat(metrics: HeartbeatPayload): Promise<void>
  reportEvents(events: FeedEvent[]): Promise<void>
  submitApproval(request: ApprovalRequest): Promise<string>
  pollApprovalResolution(approvalId: string): Promise<ApprovalResolution | null>
  reportHealthScores(scores: HealthScorePayload): Promise<void>
  reportCosts(costs: CostPayload): Promise<void>
}
```

**Compatibility rule:** the control plane accepts either `runtimeVersion` or legacy `openclawVersion`. New engines should emit `runtimeVersion`.

### 4.2 Implementations

| Implementation | When used | Data path |
|---|---|---|
| `SupabaseDataSink` | SaaS worker + self-hosted (direct DB access) | Direct Supabase writes to `dedicated_runtimes`, `runtime_events`, `mc_pending_approvals`, etc. |
| `RestDataSink` | Dedicated/hybrid runtime (no DB access) | REST calls to `/api/runtimes/*` endpoints, authenticated by `LUCID_RUNTIME_KEY` |

```typescript
// worker/src/runtime/data-sink.ts

export function createDataSink(): DataSink {
  if (IS_DEDICATED_RUNTIME) {
    return new RestDataSink(CONTROL_PLANE_URL!, RUNTIME_ID!, RUNTIME_API_KEY!)
  }
  return new SupabaseDataSink()
}
```

### 4.3 Worker Config Changes

```typescript
// worker/src/config.ts (MODIFY — add these exports)

export const IS_DEDICATED_RUNTIME = !!process.env.LUCID_RUNTIME_ID
export const RUNTIME_ID = process.env.LUCID_RUNTIME_ID
export const RUNTIME_API_KEY = process.env.LUCID_RUNTIME_API_KEY
export const CONTROL_PLANE_URL = process.env.LUCID_CONTROL_PLANE_URL
export const WORKER_DATA_MODE: 'direct' | 'rest' = IS_DEDICATED_RUNTIME ? 'rest' : 'direct'
```

### 4.4 Worker Startup Changes

```typescript
// worker/src/index.ts (MODIFY)

// At startup:
const dataSink = createDataSink()

// When IS_DEDICATED_RUNTIME:
//   - Start heartbeat loop (30s interval via DataSink.reportHeartbeat)
//   - Start event reporter (5s batch window via DataSink.reportEvents)
//   - Pass dataSink to processors and cron jobs

// Graceful shutdown:
//   - Final heartbeat with status 'shutting_down'
//   - Clear heartbeat/reporter intervals
```

### 4.5 Inbound Processor Changes

```typescript
// worker/src/processors/inbound.ts (MODIFY)

// After processing:
//   - dataSink.reportEvents([...events]) — works for both modes
//   - dataSink.submitApproval() / dataSink.pollApprovalResolution() for approval gate
```

### 4.6 Heartbeat Loop

```typescript
// worker/src/runtime/heartbeat.ts (NEW)

// 30s interval loop:
//   - Collects: os.cpus(), os.totalmem(), os.freemem(), disk usage (df)
//   - Calls dataSink.reportHeartbeat(payload)
//   - In RestDataSink: POST to CONTROL_PLANE_URL/api/runtimes/heartbeat
//   - In SupabaseDataSink: direct upsert to dedicated_runtimes + vps_health_snapshots
```

### 4.7 Event Reporter

```typescript
// worker/src/runtime/event-reporter.ts (NEW)

// Batched (5s window):
//   - Collects feed events (tool calls, errors, messages)
//   - Calls dataSink.reportEvents(batch)
//   - In RestDataSink: POST batch to CONTROL_PLANE_URL/api/runtimes/events
//   - In SupabaseDataSink: direct insert to runtime_events
```

---

## 5. DB Schema

### 5.1 New Table: `dedicated_runtimes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `org_id` | UUID NOT NULL FK → organizations | ON DELETE CASCADE |
| `display_name` | TEXT NOT NULL | User-facing name (e.g. "prod-worker") |
| `description` | TEXT | Optional description |
| `l2_deployment_id` | TEXT | L2 deployment_id (nullable if manual setup) |
| `l2_passport_id` | TEXT | L2 agent passport_id (nullable) |
| `provider` | TEXT NOT NULL | `railway \| akash \| phala \| io.net \| nosana \| docker \| manual` |
| `api_key_hash` | TEXT NOT NULL | bcrypt hash of runtime API key |
| `status` | TEXT DEFAULT `'pending'` | `pending \| deploying \| connected \| stale \| offline \| failed \| revoked` |
| `last_seen_at` | TIMESTAMPTZ | Updated by heartbeat |
| `openclaw_version` | TEXT | Reported by heartbeat |
| `cpu_percent` | NUMERIC(5,2) | Live metric from heartbeat |
| `ram_percent` | NUMERIC(5,2) | Live metric |
| `disk_percent` | NUMERIC(5,2) | Live metric |
| `gpu_percent` | NUMERIC(5,2) | Live metric (nullable) |
| `worker_pending_events` | INT DEFAULT 0 | Queue depth |
| `worker_dead_letters` | INT DEFAULT 0 | Failed events |
| `agent_count` | INT DEFAULT 0 | Active agents on this runtime |
| `uptime_seconds` | BIGINT DEFAULT 0 | Runtime uptime |
| `generation` | INT DEFAULT 1 | Lifecycle counter — increments on re-provision. Stale heartbeats with old generation rejected. (Adopted from openclaw-mc) |
| `heartbeat_counter` | INT DEFAULT 0 | Tracks beats since last history write. History snapshot written every 5th beat. (Write-coalesced heartbeats) |
| `deployment_url` | TEXT | Provider dashboard URL |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `revoked_at` | TIMESTAMPTZ | Set on revocation |

```sql
-- RLS: org-scoped via organization_members join
ALTER TABLE dedicated_runtimes ENABLE ROW LEVEL SECURITY;
CREATE POLICY dedicated_runtimes_org_access ON dedicated_runtimes
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_dedicated_runtimes_org ON dedicated_runtimes(org_id, status)
  WHERE status != 'revoked';
```

### 5.2 Modified: `ai_assistants`

```sql
ALTER TABLE ai_assistants ADD COLUMN runtime_id UUID REFERENCES dedicated_runtimes(id)
  ON DELETE SET NULL;
-- NULL = Lucid Cloud / This Instance (default runtime)
-- Non-null = runs on that dedicated runtime
```

### 5.3 New Table: `runtime_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `runtime_id` | UUID NOT NULL FK → dedicated_runtimes | ON DELETE CASCADE |
| `org_id` | UUID NOT NULL | Denormalized for efficient RLS + feed queries |
| `agent_id` | UUID | Nullable (some events are runtime-level) |
| `event_type` | TEXT NOT NULL | `tool_call \| tool_result \| error \| message_received \| message_sent \| run_started \| run_finished` |
| `severity` | TEXT DEFAULT `'info'` | `info \| warning \| error` |
| `payload` | JSONB DEFAULT `'{}'` | Event-specific data |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

```sql
ALTER TABLE runtime_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_events_org_access ON runtime_events
  FOR ALL USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_runtime_events_org_time ON runtime_events(org_id, created_at DESC);
-- 30-day retention (application-level cleanup via scheduled job)
```

### 5.4 Existing: `vps_health_snapshots`

Reuse for historical heartbeat data (30s granularity, 7-day retention). Add `runtime_id` FK:
```sql
ALTER TABLE vps_health_snapshots ADD COLUMN runtime_id UUID REFERENCES dedicated_runtimes(id);
```

### 5.5 New RPC: `mc_runtimes(p_org_id UUID)`

```sql
CREATE OR REPLACE FUNCTION mc_runtimes(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  description TEXT,
  provider TEXT,
  status TEXT,
  last_seen_at TIMESTAMPTZ,
  openclaw_version TEXT,
  cpu_percent NUMERIC,
  ram_percent NUMERIC,
  disk_percent NUMERIC,
  gpu_percent NUMERIC,
  worker_pending_events INT,
  worker_dead_letters INT,
  agent_count BIGINT,
  deployment_url TEXT,
  l2_deployment_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id, dr.display_name, dr.description, dr.provider, dr.status,
    dr.last_seen_at, dr.openclaw_version,
    dr.cpu_percent, dr.ram_percent, dr.disk_percent, dr.gpu_percent,
    dr.worker_pending_events, dr.worker_dead_letters,
    (SELECT COUNT(*) FROM ai_assistants WHERE runtime_id = dr.id)::BIGINT AS agent_count,
    dr.deployment_url, dr.l2_deployment_id, dr.created_at
  FROM dedicated_runtimes dr
  WHERE dr.org_id = p_org_id AND dr.status != 'revoked'
  ORDER BY dr.created_at DESC;
$$;
```

### 5.6 Modified RPC: `mc_agent_fleet`

Left join to `dedicated_runtimes`:
- Add `runtime_id UUID` (nullable)
- Add `runtime_name TEXT` (nullable)
- Add `runtime_status TEXT` (nullable)
- Add `runtime_provider TEXT` (nullable)

### 5.7 Modified View: `mc_feed_events_v`

UNION `runtime_events` into the feed view so dedicated agent events appear alongside SaaS events in the live feed.

---

## 6. API Routes

### 6.1 Runtime Management (Session auth, capability-gated)

| Route | Method | Purpose |
|---|---|---|
| `/api/runtimes` | GET | List org's runtimes via `mc_runtimes` RPC |
| `/api/runtimes` | POST | Create runtime → generate API key → call L2 launch (if available) → return runtime + key |
| `/api/runtimes/[id]` | GET | Runtime detail + L2 deployment status |
| `/api/runtimes/[id]` | DELETE | Revoke runtime → call L2 terminate (if available) → reject future heartbeats |
| `/api/runtimes/[id]/logs` | GET | Proxy to L2 `GET /v1/agents/{id}/logs` (only if L2 available) |

Auth: Session cookie + `hasCapability('runtime:dedicated')` check. In self-hosted mode, capability check always passes.

### 6.2 Worker Phone-Home (Runtime API key auth)

| Route | Method | Purpose |
|---|---|---|
| `/api/runtimes/heartbeat` | POST | System metrics (CPU/RAM/disk/queue) → update `dedicated_runtimes` live columns + `vps_health_snapshots` |
| `/api/runtimes/events` | POST | Batch feed events → `runtime_events` + feed view source tables |
| `/api/runtimes/approvals` | POST | Submit approval request → `mc_pending_approvals` |
| `/api/runtimes/approvals/pending` | GET | Poll for approval resolutions (2s interval when pending) |
| `/api/runtimes/health-scores` | POST | Submit hourly health scores → `mc_agent_health_scores` |
| `/api/runtimes/costs` | POST | Submit per-run cost data → `mc_agent_cost_tracking` |

### 6.3 Phone-Home Auth

```typescript
// All /api/runtimes/* phone-home routes:
// 1. Extract API key from Authorization: Bearer <key> header
// 2. Look up dedicated_runtimes where status != 'revoked'
// 3. bcrypt.compare(key, api_key_hash)
// 4. Check generation matches (reject stale heartbeats from old deployments)
// 5. If valid: proceed, update last_seen_at
// 6. If invalid: 401 Unauthorized
```

### 6.4 Heartbeat Write Coalescing

```typescript
// Every heartbeat (30s):
//   1. UPDATE dedicated_runtimes SET cpu_percent, ram_percent, disk_percent, ..., last_seen_at = NOW()
//   2. INCREMENT heartbeat_counter
//   3. IF heartbeat_counter % 5 === 0 → INSERT into vps_health_snapshots (every 2.5 min)
//   4. This reduces history table writes by 80% while keeping live metrics real-time
// Adopted from openclaw-mc write-amplification-aware heartbeats
```

### 6.5 Heartbeat Response

Returns 200 + any pending control actions:
```typescript
{
  status: 'ok',
  pendingActions: [
    { type: 'pause_agent', agentId: '...' },
    { type: 'resume_agent', agentId: '...' },
    { type: 'kill_run', agentId: '...', runId: '...' },
  ]
}
```

### 6.6 Zod Validation Schemas

Follow existing pattern in `src/lib/mission-control/schemas.ts`:

```typescript
// src/lib/mission-control/schemas.ts (MODIFY — add these schemas)

export const heartbeatSchema = z.object({
  runtimeId: z.string().uuid(),
  cpuPercent: z.number().min(0).max(100),
  ramPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  gpuPercent: z.number().min(0).max(100).optional(),
  pendingEvents: z.number().int().min(0),
  deadLetters: z.number().int().min(0),
  openclawVersion: z.string(),
  agentCount: z.number().int().min(0),
  uptimeSeconds: z.number().int().min(0),
})

export const runtimeEventSchema = z.object({
  agentId: z.string().uuid().optional(),
  eventType: z.enum(['tool_call', 'tool_result', 'error', 'message_received', 'message_sent', 'run_started', 'run_finished']),
  severity: z.enum(['info', 'warning', 'error']).default('info'),
  payload: z.record(z.unknown()).default({}),
})

export const runtimeEventsSchema = z.object({
  events: z.array(runtimeEventSchema).max(100), // batch limit
})

export const runtimeApprovalSchema = z.object({
  agentId: z.string().uuid(),
  toolName: z.string(),
  toolArgs: z.record(z.unknown()),
  runId: z.string(),
  timeoutMs: z.number().int().min(1000).max(600_000).default(300_000),
})
```

---

## 7. Capability System Changes

### 7.1 DeploymentMode Update

```typescript
// src/lib/mission-control/capabilities.ts (MODIFY)
export type DeploymentMode = 'saas' | 'self-hosted' | 'hybrid'
// Replaces: 'saas' | 'vps'
```

### 7.2 New Capability

```typescript
// src/lib/mission-control/capability-registry.ts (MODIFY — add entry)
{
  id: 'runtime:dedicated',
  label: 'Dedicated Runtimes',
  description: 'Deploy and monitor agents on dedicated infrastructure',
  module: 'system',
  modes: ['saas', 'self-hosted', 'hybrid'],
  minPlan: 'business', // ignored when self-hosted
}
```

### 7.3 Mode Array Updates

All existing capabilities with `modes: ['saas']` stay as-is. Capabilities with `modes: ['vps']` change to `modes: ['self-hosted', 'hybrid']`. Capabilities with `modes: ['saas', 'vps']` change to `modes: ['saas', 'self-hosted', 'hybrid']`.

### 7.4 Capability Hook Changes

```typescript
// src/hooks/use-capabilities.ts (MODIFY)

// Current (line ~30):
const mode = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || 'saas') as DeploymentMode

// After:
import { getDeploymentMode, isSelfHosted } from '@/lib/deployment-mode'
const mode = getDeploymentMode()

// hasCapability changes:
// Current: filters by mode + plan rank
// After: if isSelfHosted() → return true for all capabilities
```

---

## 8. Types

```typescript
// src/lib/mission-control/types.ts (MODIFY — add these types)

export type RuntimeProvider = 'railway' | 'akash' | 'phala' | 'io.net' | 'nosana' | 'docker' | 'manual'
export type RuntimeStatus = 'pending' | 'deploying' | 'connected' | 'stale' | 'offline' | 'failed' | 'revoked'

export interface DedicatedRuntime {
  id: string
  displayName: string
  description: string | null
  provider: RuntimeProvider
  status: RuntimeStatus
  lastSeenAt: string | null
  openclawVersion: string | null
  cpuPercent: number | null
  ramPercent: number | null
  diskPercent: number | null
  gpuPercent: number | null
  workerPendingEvents: number
  workerDeadLetters: number
  agentCount: number
  deploymentUrl: string | null
  l2DeploymentId: string | null
  createdAt: string
}

// Connection status derived from lastSeenAt
export type ConnectionStatus = 'connected' | 'stale' | 'offline'

export function getConnectionStatus(lastSeenAt: string | null): ConnectionStatus {
  if (!lastSeenAt) return 'offline'
  const elapsed = Date.now() - new Date(lastSeenAt).getTime()
  if (elapsed < 60_000) return 'connected'    // < 1 min
  if (elapsed < 300_000) return 'stale'        // 1-5 min
  return 'offline'                              // > 5 min
}

// Extend MCAgent with optional runtime info
// (add to existing MCAgent interface)
export interface MCAgentRuntimeInfo {
  runtimeId: string | null
  runtimeName: string | null
  runtimeStatus: RuntimeStatus | null
  runtimeProvider: RuntimeProvider | null
}
```

---

## 9. UX Design

### 9.1 System Page — "Runtimes" Section

Wrapped in `<CapabilityGate capability="runtime:dedicated">`. Self-hosted always visible, SaaS only for Business+.

```
┌─ Runtimes ─────────────────────────────────────────┐
│                                                     │
│ ☁ Lucid Cloud / This Instance      Always on       │
│   8 agents · $42.30 today                          │
│                                                     │
│ ◆ prod-worker          Railway      ● Connected    │
│   3 agents · 14% CPU · 2.1GB RAM · 42% disk       │
│   OpenClaw v2.4 · Last seen 12s ago                │
│                                                     │
│ ◆ gpu-worker           Akash        ● Connected    │
│   1 agent · A100 · 8% GPU · 4.2GB VRAM            │
│   OpenClaw v2.4 · Last seen 8s ago                 │
│                                                     │
│ ◆ staging              Docker       ○ Offline      │
│   2 agents · Last seen 2h ago                      │
│                                                     │
│ [+ Add Runtime]                                    │
└─────────────────────────────────────────────────────┘
```

Connection status: **Connected** (green ●) < 60s, **Stale** (amber ◐) 1–5 min, **Offline** (gray ○) 5+ min.

### 9.2 Fleet Table — Dedicated Badge

- SaaS agents: no badge (default, unlabeled)
- Dedicated agents: subtle `[Dedicated]` pill, muted color, matches `StatusBadge` visual language
- Offline runtime: agent shows "Unreachable" with tooltip explaining runtime is offline

### 9.3 Setup Wizard

3-step wizard leveraging L2 SDK (when available) or manual connect:

**Step 1: Choose Provider** (only if L2 available)
```
[Railway]   Managed PaaS, auto-scaling, easy
[Akash]     DePIN, GPU support, cost-effective
[Phala]     Confidential compute (TEE)
[io.net]    GPU marketplace
[Nosana]    Solana-native GPU
[Docker]    Self-managed (advanced)
```

**Step 2: Configure** — Name, description, provider credentials (stored encrypted)

**Step 3: Deploy** — Progress steps showing passport creation, provisioning, env injection, waiting for heartbeat

When L2 is NOT available: wizard shows "Manual Connect" — generates runtime ID + API key, shows env vars to set on the external worker.

### 9.4 Graceful Degradation (Offline Runtime)

| Time offline | What happens |
|---|---|
| 0–60s | No change |
| 1–5 min | Badge amber. Tooltip: "Last seen 3m ago" |
| 5+ min | Badge gray. Agent status: "Unreachable". Controls warn: "Action will take effect when runtime reconnects" |
| 1+ hour | Feed event: "Runtime 'prod-worker' offline for 1 hour" |

Never blocks SaaS functionality.

---

## 10. Components & Reuse

### 10.1 Existing Components to Reuse

| Existing | Path | Reuse for |
|---|---|---|
| `StatusBadge` | `src/components/mission-control/status-badge.tsx` | Runtime connection status (green/amber/gray) |
| `HealthScoreBadge` | `src/components/mission-control/health-score-badge.tsx` | Runtime health display |
| `KPICard` | `src/components/mission-control/kpi-card.tsx` | Runtime metrics (CPU, RAM, disk) |
| `EmptyState` | `src/components/mission-control/empty-state.tsx` | "No runtimes" state |
| `CapabilityGate` | `src/components/mission-control/capability-gate.tsx` | Gate runtimes panel to `runtime:dedicated` |
| `useRealtimeQuery` | `src/hooks/use-realtime-query.ts` | Runtime list polling + Supabase Realtime |
| `useCapabilities` | `src/hooks/use-capabilities.ts` | Mode + plan check (extended for 3 modes) |
| `ErrorService` | `src/lib/errors.ts` | Error handling in API routes |
| Zod schemas | `src/lib/mission-control/schemas.ts` | Heartbeat/event validation |
| Color maps | `src/lib/mission-control/constants.ts` | Status colors, polling intervals |
| shadcn | `Dialog`, `Sheet`, `Tabs`, `Progress`, `Badge`, `Tooltip`, `Card` | Wizard, cards, badges |

### 10.2 New Components

| Component | Path | Purpose |
|---|---|---|
| `RuntimeBadge` | `src/components/mission-control/runtime-badge.tsx` | `[Dedicated]` pill reusing `StatusBadge` visual pattern |
| `ConnectionStatus` | `src/components/mission-control/connection-status.tsx` | Reusable green/amber/gray dot (derived from `last_seen_at`) |
| `RuntimesPanel` | `src/components/mission-control/system/runtimes-panel.tsx` | System page section (wrapped in `CapabilityGate`) |
| `RuntimeCard` | `src/components/mission-control/system/runtime-card.tsx` | Single runtime with `KPICard` for metrics |
| `RuntimeSetupWizard` | `src/components/mission-control/system/runtime-setup-wizard.tsx` | 3-step wizard (shadcn `Dialog` + `Tabs`) |
| `ProviderPicker` | `src/components/mission-control/system/provider-picker.tsx` | Provider selection grid |

### 10.3 Modified Components

| Component | Path | Change |
|---|---|---|
| `AgentListItem` | `src/components/mission-control/command-center/agent-list-item.tsx` | Add `RuntimeBadge` when `runtime_id` present (capability-gated) |
| `AgentFleetClient` | `src/app/(app)/[workspace-slug]/mission-control/agents/agents-fleet-client.tsx` | Show badge when org has dedicated runtimes |
| `SystemClient` | `src/app/(app)/[workspace-slug]/mission-control/system/system-client.tsx` | Add `RuntimesPanel` (wrapped in `CapabilityGate`) |
| `AgentNode` | `src/components/mission-control/canvas/agent-node.tsx` | Optional runtime indicator dot |
| `LiveFeedPane` | (feed component) | Include `runtime_events` in feed query |

### 10.4 New Hooks

| Hook | Purpose | Pattern |
|---|---|---|
| `useRuntimes(orgId)` | Fetch runtimes with 30s polling | Reuses `useRealtimeQuery` (same as fleet/feed hooks) |
| `useRuntimeStatus(lastSeenAt)` | Derive connection status from timestamp | Pure function (`getConnectionStatus`), no state needed |

---

## 11. Safety & Security

### 11.1 Runtime API Key

- Generated on runtime creation: `crypto.randomBytes(32).toString('hex')`
- Stored as bcrypt hash in `dedicated_runtimes.api_key_hash`
- Returned ONCE to the user during creation (never stored plaintext)
- L2 auto-injects as `LUCID_RUNTIME_KEY` env var on the deployed worker
- Revocation: set `status = 'revoked'`, all future heartbeats rejected

### 11.2 No Direct DB Access

Dedicated workers never get Supabase credentials. All data flows through REST API routes with:
- API key validation (bcrypt compare)
- Zod schema validation on all inputs
- Org-scoped RLS on all tables
- Batch limits (max 100 events per POST)
- Rate limiting: 2 heartbeats/min, 12 event batches/min per runtime

### 11.3 Approval Security

- Dedicated workers submit approval requests via REST → stored in same `mc_pending_approvals` table
- Worker polls for resolution (no push — can't trust outbound connections to dedicated workers)
- Approval resolution is org-scoped (RLS prevents cross-org resolution)
- Timeout enforced server-side (default 5 min) — auto-deny on expiry

### 11.4 Self-Hosted Security

- Self-hosted mode trusts the local database (same as SaaS worker behavior)
- Entitlement bypass is env-var gated (`NEXT_PUBLIC_DEPLOYMENT_MODE=self-hosted`)
- Cannot be activated in SaaS by a user — requires server-level env var

---

## 12. File Layout

### 12.1 Files to Create

| File | Purpose |
|---|---|
| **Database** | |
| `supabase/migrations/20260322200000_dedicated_runtimes.sql` | Tables + RLS + RPCs + indexes |
| **Shared** | |
| `src/lib/deployment-mode.ts` | `getDeploymentMode()`, `isSelfHosted()`, `isL2Available()` |
| **API Routes** | |
| `src/app/api/runtimes/route.ts` | GET (list) + POST (create) |
| `src/app/api/runtimes/[id]/route.ts` | GET (detail) + DELETE (revoke) |
| `src/app/api/runtimes/[id]/logs/route.ts` | GET (proxy L2 logs) |
| `src/app/api/runtimes/heartbeat/route.ts` | POST (heartbeat receiver) |
| `src/app/api/runtimes/events/route.ts` | POST (batch event receiver) |
| `src/app/api/runtimes/approvals/route.ts` | POST (submit approval) |
| `src/app/api/runtimes/approvals/pending/route.ts` | GET (poll resolutions) |
| `src/app/api/runtimes/health-scores/route.ts` | POST (health score submission) |
| `src/app/api/runtimes/costs/route.ts` | POST (cost data submission) |
| **UI Components** | |
| `src/components/mission-control/runtime-badge.tsx` | `[Dedicated]` pill |
| `src/components/mission-control/connection-status.tsx` | Green/amber/gray dot |
| `src/components/mission-control/system/runtimes-panel.tsx` | System page section |
| `src/components/mission-control/system/runtime-card.tsx` | Runtime metrics card |
| `src/components/mission-control/system/runtime-setup-wizard.tsx` | Setup wizard |
| `src/components/mission-control/system/provider-picker.tsx` | Provider grid |
| **Hooks** | |
| `src/hooks/use-runtimes.ts` | Runtime data hook |
| **Worker** | |
| `worker/src/runtime/data-sink.ts` | DataSink interface + implementations |
| `worker/src/runtime/heartbeat.ts` | Heartbeat loop |
| `worker/src/runtime/event-reporter.ts` | Batched event reporting |
| `worker/src/runtime/approval-client.ts` | Approval flow via DataSink |

### 12.2 Files to Modify

| File | Change |
|---|---|
| `src/lib/mission-control/types.ts` | Add `DedicatedRuntime`, `RuntimeStatus`, `RuntimeProvider`, `ConnectionStatus`, `MCAgentRuntimeInfo` |
| `src/lib/mission-control/capabilities.ts` | `DeploymentMode = 'saas' \| 'self-hosted' \| 'hybrid'`, add `'runtime:dedicated'` |
| `src/lib/mission-control/capability-registry.ts` | Add `runtime:dedicated` entry, update mode arrays |
| `src/lib/mission-control/schemas.ts` | Add heartbeat, event, approval Zod schemas |
| `src/lib/mission-control/constants.ts` | Add runtime status colors, connection thresholds |
| `src/hooks/use-capabilities.ts` | Self-hosted bypass, use `getDeploymentMode()` |
| `src/lib/entitlements/evaluate.ts` | Self-hosted bypass for all plan checks |
| `src/lib/db/mission-control.ts` | Add runtime query functions (follow ErrorService pattern) |
| `src/components/mission-control/command-center/agent-list-item.tsx` | Add `RuntimeBadge` |
| `src/app/(app)/[workspace-slug]/mission-control/system/system-client.tsx` | Add `RuntimesPanel` |
| `src/app/(app)/[workspace-slug]/mission-control/agents/agents-fleet-client.tsx` | Runtime badge |
| `worker/src/config.ts` | Add `IS_DEDICATED_RUNTIME`, `RUNTIME_ID`, `RUNTIME_API_KEY`, `CONTROL_PLANE_URL` |
| `worker/src/index.ts` | Init DataSink, start heartbeat/reporter when dedicated |
| `worker/src/processors/inbound.ts` | Use DataSink for events + approvals |

---

## 13. Not In This Slice

- **Multi-cluster orchestration**: Agents can't be moved between runtimes. Manual reassignment only.
- **Auto-scaling**: L2 provides scaling primitives, but MC doesn't trigger them automatically.
- **Custom Docker images**: Workers use the standard `@lucid-fdn/agent-runtime` base image. Custom images deferred.
- **Log aggregation**: Container logs proxied from L2 on-demand. No persistent log storage in Lucid.
- **Billing for runtime compute**: SaaS costs tracked, but no metering of customer infrastructure costs.
- **Runtime-to-runtime networking**: Dedicated runtimes can't communicate directly with each other.
- **WebSocket phone-home**: REST polling only. WebSocket upgrade deferred until traffic justifies it.

---

## 14. Implementation Phases

### Phase 1: Foundation (~2 days)
1. `src/lib/deployment-mode.ts` — shared utility
2. Update `DeploymentMode` to 3 modes in `capabilities.ts`
3. Update `use-capabilities.ts` — self-hosted bypass
4. Update `evaluate.ts` — self-hosted entitlement bypass
5. Migration: `dedicated_runtimes` + `runtime_events` tables, `runtime_id` on `ai_assistants`, RPCs
6. Types: `DedicatedRuntime`, `RuntimeStatus`, `RuntimeProvider`, extend `MCAgent`
7. Capability: `runtime:dedicated` in registry
8. API routes: `/api/runtimes` CRUD
9. API routes: `/api/runtimes/heartbeat` receiver
10. DB queries: `mc_runtimes` RPC, extend `mc_agent_fleet` with runtime join

### Phase 2: Phone-Home Endpoints (~2 days)
1. `/api/runtimes/events` — batch event ingestion
2. `/api/runtimes/approvals` — submit + poll
3. `/api/runtimes/health-scores` — ingestion
4. `/api/runtimes/costs` — ingestion
5. Feed view: UNION `runtime_events` into `mc_feed_events_v`

### Phase 3: UI (~2 days)
1. `ConnectionStatus` + `RuntimeBadge` components
2. `RuntimeCard` + `RuntimesPanel` on System page
3. `ProviderPicker` + `RuntimeSetupWizard`
4. Mode-adaptive labels
5. Modify fleet table for badge
6. `useRuntimes` hook

### Phase 4: Worker DataSink (~2 days)
1. `DataSink` interface + both implementations
2. Config env vars
3. Heartbeat loop
4. Event reporter
5. Approval client
6. Modify `inbound.ts`
7. Graceful shutdown

### Phase 5: Polish (~1 day)
1. Runtime online/offline feed events
2. Agent "Unreachable" status
3. Controls bar warnings for unreachable agents
4. Container logs viewer (proxy L2 when available)
5. Runtime detail page with historical metrics

---

## 15. Verification

### SaaS Mode
1. **Plan gating**: Free/Pro user → zero runtimes UI anywhere
2. **Deployment**: Business+ clicks "Add Runtime" → selects Railway → L2 deploys → "Deploying" → "Connected"
3. **Heartbeat**: Worker starts → heartbeat within 30s → System page shows CPU/RAM/disk
4. **Fleet integration**: Dedicated agents show `[Dedicated]` badge
5. **Live feed**: Tool calls from dedicated agents in Command Center feed
6. **Approvals**: Dedicated agent elevated tool → approval card → approve → executes
7. **Offline**: Stop worker → 5 min → "Offline", agents "Unreachable"
8. **Reconnection**: Restart → heartbeat resumes → "Connected"
9. **Revocation**: Delete runtime → L2 terminates → heartbeats rejected

### Self-Hosted Mode
10. **All features**: `NEXT_PUBLIC_DEPLOYMENT_MODE=self-hosted` → all capabilities enabled
11. **UX labels**: "This Instance" instead of "Lucid Cloud"
12. **No L2**: Without `LUCID_L2_GATEWAY_URL` → wizard shows manual setup
13. **With L2**: With `LUCID_L2_GATEWAY_URL` → full automated deployment wizard

### DataSink
14. **SupabaseDataSink**: SaaS worker writes directly to DB, events appear in feed
15. **RestDataSink**: Dedicated worker phones home via REST, same events appear in feed

### General
16. `npm run typecheck` passes with all new code
17. `npm run test` — existing MC tests still pass (88 tests)
