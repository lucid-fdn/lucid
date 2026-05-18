# Dedicated Runtimes

For the canonical current-state channel architecture across shared workers and dedicated runtimes, see `docs/platform/agents/channels.md`.

Dedicated Runtimes let you run agents on your own infrastructure while managing them from the same Mission Control dashboard. Your agents run on Railway, Akash, Docker, or any other platform — Lucid's control plane monitors and controls them remotely.

For the latest runtime parity and Mission Control verification record, see [Runtime parity verification 2026-05-08](./runtime-parity-verification-2026-05-08.md).

## Why Dedicated Runtimes?

- **Data sovereignty** — Keep agent processing in your own infrastructure
- **Performance** — Deploy closer to your users or data sources
- **Cost control** — Use your own compute resources
- **Compliance** — Meet regulatory requirements for data processing location
- **Scale** — Run workloads that exceed shared infrastructure limits

## How It Works

```
Your Infrastructure (Railway/Akash/Docker/etc.)
  └── Dedicated Worker (with LUCID_RUNTIME_ID + LUCID_RUNTIME_KEY)
        ├── Sends heartbeats every 30 seconds
        ├── Reports events (tool calls, errors, completions)
        ├── Submits approval requests
        └── Polls for approval decisions

Lucid Control Plane
  ├── Receives heartbeats → updates connection status
  ├── Receives events → shows in Mission Control live feed
  ├── Receives approvals → shows approval cards
  └── Sends approval decisions → worker resumes/stops
```

Tooling note:

- dedicated runtimes use the same prepared tool-manifest contract as shared and BYO runtimes
- deployment only changes routing, transport ownership, and credential execution boundaries
- tool schema preparation stays canonical and engine-agnostic

See [Tool Manifest Pipeline](../plugins/tool-manifests.md) for the current manifest pipeline.

## Runtime Ownership Paths

Lucid uses one runtime model with three product paths:

- **Lucid Cloud**: shared Lucid-operated runtime. No runtime record or infrastructure setup is required.
- **Dedicated Lucid runtime**: isolated Lucid-operated runtime. The API uses the managed provider path and currently targets Railway through the L2 deployment layer.
- **Bring your own runtime**: user-owned runtime. This has two setup modes:
  - **Run manually**: creates a runtime record and returns pairing environment variables. The user runs the runtime on their own machine or infrastructure. No provider infrastructure is deployed.
  - **Deploy to provider**: creates a BYO runtime record and sends the selected provider target to the L2 deployment layer. Supported targets come from `BYO_PROVIDERS`: Railway, Akash, Phala, io.net, Nosana, Docker, and Manual.

The application does not call each provider directly from the UI. The intended abstraction is:

```text
Lucid UI -> /api/runtimes -> L2 runtime deployment/control layer -> provider target
```

Client visibility rules:

- Lucid-operated shared and dedicated runtimes show Lucid-branded status, not provider internals.
- Dedicated runtime API responses must not expose raw environment snapshots, provider operation identifiers, image references, deployment URLs, or internal provider errors to the browser.
- BYO runtimes may show user-owned endpoint and adapter metadata, but raw environment snapshots remain hidden.

The shared builder runtime panel and existing agent runtime panel must both pass the selected runtime provider through `RuntimeBlueprint.provider`. They must not hardcode BYO to `manual`.

## L2 Passport Ownership

Runtime deployment is not allowed to force a wallet connection before infrastructure can launch. L2 passport ownership is tracked separately from runtime deployment:

- `user_wallet`: the passport is already owned by a user wallet. Wallet-native features are available.
- `workspace_custody`: Lucid resolved a workspace/platform wallet for the launch. The passport is valid and can be claimed later.
- `platform_default`: no workspace wallet was available, so L2 used its configured platform owner. This is still claimable later.

The app persists:

- `l2_passport_owner`
- `l2_owner_mode`
- `l2_claim_status`
- `l2_claimed_by_user_id`
- `l2_claimed_at`

Runtime launch and runtime operation can proceed in custody/platform mode. Web3-native actions are gated until the passport is claimed by a verified user wallet:

- passport claim
- on-chain ownership transfer
- staking
- payouts
- token-gated access
- on-chain reputation writes

Claim flow:

```text
Runtime row with l2_passport_id
  -> user signs a message containing the passport id
  -> app calls /api/runtimes/:id/passport-claim
  -> L2 verifies the wallet signature
  -> L2 transfers passport ownership
  -> app marks the runtime as user_wallet + claimed
```

Production L2 must expose a wallet-shaped platform owner through the canonical `LUCID_PLATFORM_WALLET` env var if launches without an explicit owner are allowed. Development may use the dev-only default owner.

## Channel Modes

Dedicated runtimes support two channel modes:
- `relay` — control plane owns channel delivery and credential decryption
- `native` — runtime owns channel transports directly

The detailed per-channel support matrix lives in `docs/platform/agents/channels.md`.

## Supported Providers

| Provider | Description |
|----------|------------|
| **Railway** | Managed PaaS with easy deployment |
| **Akash** | Decentralized cloud computing |
| **Phala** | Confidential computing (TEE) |
| **io.net** | Distributed GPU compute |
| **Nosana** | Decentralized CI/CD and compute |
| **Docker** | Self-hosted container runtime |
| **Manual** | Any infrastructure with HTTP access |

## Setting Up a Dedicated Runtime

### Step 1: Add Runtime in Mission Control

1. Go to **Mission Control > System**
2. Click **Add Runtime**
3. Select your provider
4. Give it a name and description
5. Click **Create** — this generates an API key

### Step 2: Deploy the Worker

Deploy the Lucid worker on your chosen infrastructure with these environment variables:

| Variable | Value |
|----------|-------|
| `IS_DEDICATED_RUNTIME` | `true` |
| `RUNTIME_ID` | The ID from Step 1 |
| `RUNTIME_API_KEY` | The API key from Step 1 |
| `CONTROL_PLANE_URL` | `https://lucid.foundation` |

### Step 3: Verify Connection

Once the worker starts, it sends heartbeats to the control plane. In Mission Control, you'll see:
- **Green dot** — Connected (heartbeat within last 60 seconds)
- **Amber dot** — Stale (1-5 minutes since last heartbeat)
- **Gray dot** — Offline (no heartbeat for 5+ minutes)

### Step 4: Assign Agents

Assign agents to your dedicated runtime from the agent's detail page. Assigned agents process messages through your infrastructure instead of the shared Lucid worker.

## Monitoring

### Runtime Detail Page

Click a runtime in the System page to see:
- **Connection status** — Live heartbeat status
- **Resource usage** — CPU, RAM, disk (reported by worker)
- **Health history** — 30-day metric trends
- **Assigned agents** — Which agents run on this runtime
- **Events** — Runtime-specific event log
- **Environment Variables** — Write-only secrets editor
- **Custom Domains** — Domain management with SSL status
- **Healthcheck Config** — Path, interval, and timeout settings
- **Maintenance** — Provider-agnostic maintenance actions and recent rollout history
- **Capabilities and commands** — Adapter identity, engine-native capabilities, runtime services, parser/probe status, EHV policy, and recent management command ACK states

### Maintenance Model

Maintenance is triggered from the Mission Control UI, but it is executed by the control plane on the server side. The browser never talks to Railway or another provider directly.

Current architecture:
- **Mission Control UI** — Operator visibility and action trigger
- **Lucid control plane** — Auth, policy checks, maintenance job creation, audit trail
- **Provider adapter** — Executes the provider-specific operation

The current first adapter is Lucid-L2, which can manage Railway and future provider backends behind one control-plane contract. The maintenance API is provider-agnostic so the UI does not need to change when Lucid adds another infrastructure backend.

Runtime maintenance jobs currently track:
- action (`reconcile`, `redeploy`, `restart`, `rollback`, `rehome`)
- provider operation identifiers in the server-side audit trail
- target image metadata in the server-side audit trail
- requestor
- success/failure state
- latest maintenance timestamps and errors on the runtime row

Design rule:
- the frontend is a control surface
- the backend owns maintenance orchestration
- the provider adapter owns provider-specific execution
- managed-runtime UI/API responses show Lucid-branded diagnostics only; provider names, raw provider errors, image refs, environment values, and internal deployment identifiers stay server-side

`rehome` is the operator-safe recovery path when an older managed runtime is attached to infrastructure that the current Lucid provider credentials cannot mutate. It launches a fresh Lucid-managed deployment from the canonical runtime image and environment, then rotates the runtime key only after the replacement deployment is accepted. This keeps the existing runtime valid if launch fails and gives operators a clean path to move long-lived runtimes onto the current managed image line.

Operators use the first-class re-home endpoint, `POST /api/runtimes/:id/maintenance/rehome?org_id=:orgId`. The generic maintenance endpoint still accepts `{ "action": "rehome" }` for compatibility, but UI/operator flows call the dedicated route so confirmation copy, audit wording, and access checks stay explicit.

`20260507190000_runtime_maintenance_rehome_action.sql` makes `rehome` a first-class `runtime_maintenance_jobs.action` value. Operator re-home requests now persist as `action = "rehome"` while the provider detail keeps `result_payload.mode = "l2-rehome"` to describe the L2 orchestration path.

Once the provider accepts the replacement launch, the re-home maintenance job is marked `succeeded`; follow-up liveness is tracked separately through runtime heartbeat and capability timestamps.

Operational guardrails:

- Empty-body managed Hermes re-home resolves through the canonical Lucid worker image line. This prevents stale Hermes-specific image configuration from blocking operator recovery.
- Explicit deprecated Hermes image overrides are still rejected.
- Re-home rotates the runtime key only after the replacement launch is accepted.
- Client responses expose sanitized Lucid diagnostics; raw provider errors, image refs, operation ids, and env data remain server-side.

Production verification:

- Hermes dedicated re-home was live-smoked on 2026-05-08 with native `action = "rehome"`, succeeded status, fresh heartbeat, fresh capability report, and no maintenance error.
- Hermes and OpenClaw dedicated runtimes both ACKed `adapter.probe`, `transcript.parser.test`, `runtime.services.inspect`, `engine_home.snapshot`, `engine_home.diff`, `engine_home.export`, and `engine_home.rollback` as `applied`.

### Relay Completion Contract

For `relay` dedicated runtimes, all channels complete through the same control-plane path:
- runtime calls `POST /api/runtimes/messages/complete-inbound`
- control plane persists transcript + outbound event + delivery
- conversations are resolved through the canonical 4-arg `get_or_create_conversation(...)` RPC
- cost tracking uses canonical `mc_agent_cost_tracking.tokens_input` / `tokens_output`

Error semantics:
- `404` only for a truly missing inbound event
- `403` for runtime/org ownership mismatch
- `500` for DB, schema, or query failures

This contract is channel-agnostic. Telegram, Discord, Slack, Teams, WhatsApp, and Web all use the same relay completion semantics when they run through a dedicated relay runtime.

### Environment Variables

Manage runtime environment variables with a write-only security model:

- **Write-only** — You can set and update variables, but actual values are never stored in the Lucid control plane. The L2 Gateway is the source of truth.
- **Sensitive auto-detection** — Variables matching patterns like `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD` are automatically masked in the UI.
- **Bulk add** — Add multiple key-value pairs at once. Press Enter or click Add to queue, then Save to push all changes.
- **Existing vars** — Shows a metadata table of currently set variables (key names and masked indicators only).

Capability gate: `configuration.envUpdate` (Business+ on SaaS, all plans on self-hosted).

### Custom Domains

Attach custom domains to your dedicated runtime:

- **Domain list** — Shows all attached domains with SSL certificate status (valid/pending/expired).
- **Add domain** — Enter a domain name and click Add. You'll need to configure DNS to point to your runtime's IP.
- **Remove domain** — Click the trash icon to detach a domain.
- **Refresh** — Re-fetch domain status from the provider.

Capability gate: `configuration.customDomains` (Business+ on SaaS, all plans on self-hosted).

### Healthcheck Configuration

Configure how the control plane monitors your runtime's health:

- **Path** — The HTTP path to ping (e.g., `/healthz`). Must return 200 for healthy status.
- **Interval** — How often to check, in seconds (default: 30).
- **Timeout** — How long to wait before marking a check as failed, in seconds (default: 5).
- **Dirty tracking** — Save button is disabled until you change a value, preventing accidental no-op updates.

Capability gate: `observability.healthcheckConfig` (Business+ on SaaS, all plans on self-hosted).

### Redis Ingest Buffer

At scale (200+ runtimes), direct Postgres writes from every heartbeat, event, and cost report become a bottleneck. The Redis Streams ingest buffer absorbs this write pressure:

```
Runtime Workers (200+)
  ├── Heartbeat → Redis Hash (rt:{id}:live, 5min TTL)
  ├── Events   → Redis Stream (rt:events, MAXLEN 10K)
  └── Costs    → Redis Stream (rt:costs, MAXLEN 5K)
                    ↓ drain every 5s (lock-protected)
              Shared Worker drains → batch Postgres writes
```

**Key properties:**
- **~88% write reduction** — coalesced batch writes instead of per-runtime individual writes
- **Feature-flagged** — `FEATURE_REDIS_INGEST` (default `false`). Set to `true` on both Vercel and Railway to enable
- **Graceful degradation** — if Redis is unavailable, all routes fall back to direct Postgres writes automatically
- **Idempotent** — events use `ON CONFLICT (ingest_event_id) DO NOTHING`, costs use window-based dedupe
- **Observable** — IngestHealthPanel in System page shows stream depth, drain lag, fallback count

**Monitoring thresholds:**
| Metric | Warning | Critical |
|--------|---------|----------|
| Event stream depth | >5,000 | >20,000 |
| Cost stream depth | >2,000 | >10,000 |
| Oldest entry age | — | >30s |
| Drain cycle duration | >3s | — |

### Offline Buffer

Each dedicated runtime has an in-memory ring buffer (1000 entries) for telemetry. If the control plane is unreachable:
- Heartbeats, events, and costs are buffered locally
- On reconnection, the buffer flushes oldest-first with exponential backoff
- Dropped entries are reported in the next successful heartbeat
- Business mutations (approvals, deploys) are never buffered — they fail fast

### Same Dashboard, Different Infrastructure

The key principle: **same fleet, same feed, same controls — regardless of where the worker runs.** Dedicated runtime events appear in the same live feed as shared infrastructure events. Approvals work the same way. Cost tracking works the same way.

## Availability

Dedicated Runtimes are available on Business plans and above. Self-hosted deployments have access to all runtime features regardless of plan tier.
