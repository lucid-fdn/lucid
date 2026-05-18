# Lucid Worker

Railway-deployed Node.js service that runs AI agent orchestration, channel delivery, Routine execution, Pulse workers, and platform background jobs.

## Quick Start

```bash
npm install
npm run dev          # Express server on :3100
npm run typecheck    # tsc --noEmit
npm run test -- --run  # Vitest (all tests)
```

## Architecture

```
index.ts (entry point)
  ├── Express HTTP server (:3100)
  │   ├── /health, /metrics          — Observability
  │   ├── /trigger                   — Webhook: enqueue inbound/outbound events
  │   └── /stream                    — Agent chat streaming (SSE)
  │
  ├── Orchestration (mutually exclusive)
  │   ├── Pulse (FEATURE_PULSE=true) — Redis Streams + XREADGROUP BLOCK + TTL leases
  │   └── Polling (default)          — setInterval loops (5s inbound, 3s outbound)
  │
  ├── Routine execution              — scheduled/manual product work via Pulse + worker adapters
  ├── Cron registry                  — platform maintenance jobs (health scores, revenue, cleanup)
  └── Graceful shutdown              — Drain in-flight → flush OTel/Sentry → exit
```

## Subsystems

| Directory | Purpose | README |
|-----------|---------|--------|
| `src/pulse/` | Event-driven orchestration engine (Redis Streams + XREADGROUP BLOCK) | [README](src/pulse/README.md) |
| `src/polling/` | Legacy polling fallback (circuit breaker degraded mode) | [README](src/polling/README.md) |
| `src/agent/` | Agent runtime: OpenClaw integration, tool surface, model routing | [README](src/agent/README.md) |
| `src/channels/` | Channel adapters: Telegram, Discord, Slack, WhatsApp, Web | [README](src/channels/README.md) |
| `src/cron/` | Platform maintenance job definitions and registry, not product routines | [README](src/cron/README.md) |
| `src/routines/` | Routine execution adapters and receipt writers | [README](src/routines/README.md) |
| `src/runtime/` | Runtime seam: DataSink, heartbeat, broadcast, event reporting, capability heartbeat, management command execution, EHV commands | [README](src/runtime/README.md) |
| `src/runtime-adapters/` | OpenClaw/Hermes adapter identity, probes, transcript parser status, services, and capability surfaces | — |
| `src/processors/` | Event processing: inbound, outbound, scheduled, relay | — |
| `src/memory/` | Memory pipeline: extract, dedupe, embed, encrypt, store | — |
| `src/skills/` | Domain skill bundles (Polymarket, Hyperliquid) | [README](src/skills/README.md) |
| `src/pm-sync/` | PM sync adapters: Linear, Jira, Asana, Trello, Monday. Linear Agents API. | — |
| `src/guards/` | Deduplication, rate limiting | — |
| `src/crypto/` | AES-GCM encryption service | — |
| `src/observability/` | OTel tracing, metrics, Sentry | — |
| `src/services/` | Shared infra: DEX aggregator, RPC fallback, session signer | — |
| `src/jobs/` | Job handlers (summary generation) | — |

## Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `FEATURE_PULSE` | `false` | Redis queue orchestration (replaces polling) |
| `FEATURE_AGENT_RUNTIME` | `false` | Agent loop on shared worker (always `true` for dedicated) |
| `FEATURE_CONVERSATION_SUMMARY` | `false` | Rolling summary + recent turns context |
| `FEATURE_TOOL_CACHE` | `true` | Read-only tool result caching |
| `FEATURE_MODEL_ROUTING` | `false` | Deterministic fast/strong model routing |
| `FEATURE_RUNTIME_V2` | `false` | v2 runtime seam (Gateway switchability) |
| `FEATURE_REST_MESSAGE_RELAY` | `false` | C1 REST relay for dedicated runtimes |
| `FEATURE_NATIVE_CHANNELS` | `false` | C2a self-sovereign channels (dedicated only) |
| `FEATURE_REDIS_INGEST` | `false` | Redis Streams buffer for runtime telemetry |
| `FEATURE_LINEAR_AGENT` | `false` | Linear Agents API (two-way agent collaboration) |

## Production Process Topology

The worker is intentionally split by process mode and role. This keeps sockets,
queue consumers, maintenance scans, and browser sessions from competing inside
one Railway container.

Recommended production services:

| Service | `WORKER_MODE` | `WORKER_ROLE` | Owns |
|---------|---------------|---------------|------|
| Channels | `channels` | `interactive_gateway` | Slack/Discord socket gateways, channel admin probes, fast inbound enqueue |
| Worker | `worker` | `interactive` | `/trigger`, `/stream`, Pulse inbound/outbound workers, low-latency chat delivery |
| Automation | `worker` | `automation` | Routine wake scanner/execution, DAG steps, retry drainer, orphan detector, cleanup, platform cron jobs |
| Browser | `browser` | `gateway` | isolated Browser Operator HTTP gateway and Playwright/browser-provider sessions |

Compatibility modes:

- `WORKER_MODE=discord` and `WORKER_MODE=slack` are useful for single-channel gateway deploys.
- `WORKER_MODE=all` is local/dev or simple preview mode. Production logs warn when `NODE_ENV=production` and `WORKER_MODE=all`.
- `WORKER_ROLE=all` remains available for local/dev combined runs, but should not be used for latency-sensitive production services.

Loop ownership is exposed on `/metrics` under `loop_ownership` so deploys can be
audited without reading startup logs.

Pulse queue metrics distinguish stream history from active backlog:

- `queue_stream_length_*` / legacy `queue_depth_*`: Redis stream length after trimming. This is useful for history/retention checks, not pressure.
- `queue_pending_*`: delivered-but-unacked consumer-group entries.
- `queue_lag_*`: Redis consumer-group lag for entries not yet delivered.
- `queue_backlog_*`: pressure signal used by interactive backlog monitors (`pending + lag`, or stream length only when the consumer group is missing).
- `queue_consumers_*` and `queue_group_missing_streams_*`: fleet/consumer-group health signals.

## Agent Ops Browser Operator

Browser Operator is engine-neutral at the Agent Ops layer. Existing `BROWSER_QA_*`
env names remain for compatibility because Browser QA was the first shipped
workflow. Set `BROWSER_QA_CONTROL_URL` on a browser-capable runtime to let
QA/canary/design-review plus cross-vertical browser workflows collect real
screenshots, console logs, network logs, performance metrics, and snapshots.
OpenClaw-compatible browser control is supported today; Hermes/future engines
can expose the same HTTP contract without changing workflow definitions.

Provider selection is also engine-neutral:

- `BROWSER_QA_PROVIDER=lucid-managed` uses the generic browser-control contract.
- `BROWSER_QA_PROVIDER=openclaw-compatible` uses the legacy-compatible HTTP shape.
- `BROWSER_QA_PROVIDER=hermes` uses the same provider contract against a Hermes browser endpoint.
- `BROWSER_QA_PROVIDER=steel` calls a remote Steel Browser service through `STEEL_BROWSER_URL` and `STEEL_API_KEY`.
- `BROWSER_QA_PROVIDER=playwright`, `browserless`, and `stagehand` are intentionally blocked in shared workers; use the isolated browser gateway below.

The isolated `WORKER_MODE=browser` gateway chooses the actual browser backend with
gateway-only envs:

- `BROWSER_QA_GATEWAY_PROVIDER=playwright` launches local Chromium inside the browser service.
- `BROWSER_QA_GATEWAY_PROVIDER=browserless` connects to `BROWSERLESS_WS_URL` with optional `BROWSERLESS_TOKEN`.
- `BROWSER_QA_GATEWAY_PROVIDER=browserbase` connects to `BROWSERBASE_WS_URL` with optional `BROWSERBASE_API_KEY`.
- `BROWSER_QA_GATEWAY_PROVIDER=steel` connects to `STEEL_CDP_WS_URL` with optional `STEEL_API_KEY`; `STEEL_BROWSER_URL` remains the API/provider endpoint for non-gateway Steel provider calls.
- `BROWSER_QA_GATEWAY_PROVIDER=remote-cdp` connects to `REMOTE_CDP_WS_URL` with optional `REMOTE_CDP_TOKEN`.
- `BROWSER_OPERATOR_DEFAULT_PROVIDER=playwright` keeps Lucid-managed Playwright as the default gateway backend.
- `BROWSER_OPERATOR_EXTERNAL_PROVIDERS_ENABLED=false` prevents Browserbase, Steel, and Browserless envs from accidentally taking production traffic.
- `BROWSER_OPERATOR_BYO_PROVIDERS_ENABLED=false` prevents customer/BYO `remote-cdp` routing until explicitly released.
- `BROWSER_OPERATOR_PREMIUM_FALLBACK_ENABLED=false` keeps premium provider fallback disabled; only read-only public work may use it when enabled.
- `BROWSER_QA_MAX_CONCURRENCY_PER_ORG=2`, `BROWSER_QA_LEASE_WAIT_TIMEOUT_MS=5000`, and `BROWSER_QA_MEMORY_PRESSURE_LIMIT_MB=0` tune the Lucid browser pool. The gateway exposes `/pool-health` with active leases, queue depth, wait latency, pressure, crash count, and estimated active cost.
- `BROWSER_QA_ACTION_LAYER=stagehand` routes high-level extraction/action requests to `STAGEHAND_CONTROL_URL` with optional `STAGEHAND_API_KEY`.
- `BROWSER_QA_ACTION_LAYER=browser-use` routes high-autonomy browser actions to `BROWSER_USE_CONTROL_URL` with optional `BROWSER_USE_API_KEY`.
- `BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED=false` keeps Lucid-managed raw credentials disabled by default.
- `BROWSER_OPERATOR_FEATURE_FLAGS=browser_operator_raw_credentials` is additionally required before a raw credential runtime ref can be used.

Do not run local Chrome/Playwright inside the shared worker process. Browser Operator
should use a remote gateway/session service in shared SaaS, or an explicitly
isolated browser-capable dedicated runtime.

Browser gateway safety defaults:

- Private/local network targets are blocked unless `BROWSER_QA_ALLOW_PRIVATE_NETWORK=true`.
- Screenshots are capped by `BROWSER_QA_MAX_SCREENSHOT_BYTES`.
- Screenshots are written through `BROWSER_QA_ARTIFACT_STORE` (`local` or `supabase`) and returned as `/artifacts/...` or `BROWSER_QA_PUBLIC_BASE_URL` URLs, not inline base64 payloads.
- Local artifacts use `BROWSER_QA_ARTIFACT_DIR`; durable Supabase artifacts use `BROWSER_QA_ARTIFACT_BUCKET` and stay behind the gateway's authenticated artifact route.
- Sessions are capped by `BROWSER_QA_MAX_CONCURRENCY` and `BROWSER_QA_SESSION_TTL_SECONDS`.
- Browser sessions emit provider-agnostic usage rows to `agent_ops_browser_qa_usage_events` when `orgId` and `runId` are durable UUIDs.
- Per-run durable quotas are enforced from plan limits (`browser_qa_sessions_per_run`, `browser_qa_screenshots_per_run`) with `BROWSER_QA_MAX_SESSIONS_PER_RUN` and `BROWSER_QA_MAX_SCREENSHOTS_PER_RUN` as self-hosted/local fallbacks.
- The shared `browser-qa-retention` cron expires old sessions, removes retained artifacts after `BROWSER_QA_ARTIFACT_RETENTION_DAYS`, and deletes old Browser Operator usage rows.
- Gateway auth uses `BROWSER_QA_GATEWAY_TOKEN`, falling back to `BROWSER_QA_CONTROL_TOKEN` or `WORKER_TRIGGER_SECRET`.
- Runtime packets are rejected if they contain `secret_ref`, password/token/API-key fields, or raw credential refs without the explicit raw-credential flag and consent metadata.
- Low-risk actions (`click`, `type`, `select`, `scroll`) execute in the isolated gateway. Medium/high-risk actions require an approved action state; sensitive auth/payment selectors require human takeover.

For an isolated Lucid-managed gateway, run the worker as `WORKER_MODE=browser`.
That mode exposes the browser-control HTTP contract used by Agent Ops:

- `GET /` status
- `GET /provider-health`
- `POST /start`
- `POST /sessions`
- `GET /sessions/:sessionKey`
- `POST /sessions/:sessionKey/actions`
- `GET /sessions/:sessionKey/replay`
- `POST /tabs/open`
- `POST /navigate`
- `POST /act` for `wait`, `evaluate`, `stagehand`, `extract`, `click`, `type`, `select`, `scroll`, and approved `submit`
- `POST /credential-access/validate`
- `POST /accounts/:accountId/open`
- `POST /accounts/:accountId/refresh`
- `POST /purchase-runs`, `/purchase-runs/:id/policy-check`, `/purchase-runs/:id/execute`, and `/purchase-runs/:id/cancel` as fail-closed commerce-safe handoff endpoints
- `GET /snapshot`
- `POST /screenshot`
- `GET /console`
- `GET /errors`
- `GET /requests`
- `GET /artifacts/...`

Use `worker/Dockerfile.browser` for the browser gateway image so Chromium and
its system dependencies are installed outside the shared worker image.

Provider smoke:

```bash
npm run agent-ops:browser-provider-smoke -- --require-live --run-session --target https://www.lucid.foundation
npm run agent-ops:browser-provider-smoke -- --expect-provider browserless --expect-action-layer stagehand
```

## Deployment Modes

| Mode | Config | Orchestration | Channels |
|------|--------|--------------|----------|
| **Shared SaaS** | `REDIS_URL` set | Pulse (ioredis TCP, Railway Redis) or polling | All channels via outbound events |
| **Self-Hosted** | `REDIS_URL` set | Pulse (ioredis TCP, docker-compose Redis) or polling | All channels via outbound events |
| **Dedicated C1** | `IS_DEDICATED_RUNTIME=true`, `LUCID_DEDICATED_TRANSPORT_MODE=relay` | Relay transport to Pulse-backed control-plane claims | Control plane delivers |
| **Dedicated Native Pulse** | `IS_DEDICATED_RUNTIME=true`, `LUCID_DEDICATED_TRANSPORT_MODE=native_pulse` | Native Pulse consumer with the same lease semantics | Depends on channel ownership/runtime mode |
| **Dedicated C2a** | `FEATURE_NATIVE_CHANNELS=true` | runtime-owned channels, relay or native Pulse depending on transport mode | Runtime delivers directly |
| **External Agents** | Webhook protocol | HTTP callback to Nerve | Any channel |

See `docs/architecture/nerve.md` for the universal orchestration roadmap (Nerve — extends Pulse to all deployment modes).

## Runtime Capability Plane

OpenClaw, Hermes, shared, dedicated, and BYO/local runtimes report through the same capability contract. Heartbeats can include:

- adapter identity
- native capabilities
- runtime services
- adapter probe summaries
- transcript parser status
- runtime command spec
- Engine Home policy

Workers execute durable management commands from `runtime_management_commands` and ACK the lifecycle back to Mission Control:

- `adapter.probe`
- `capability.refresh`
- `runtime.services.inspect`
- `transcript.parser.test`
- `runtime.config.refresh`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

The command path is outside the chat hot path. Capability discovery is cached and EHV work runs only on explicit operator command, mutation/review workflow, schedule, import/export, or rollback.

Production verification record: `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.

## Managed Runtime Safety

Lucid-operated dedicated runtime UI/API responses must stay sanitized:

- no raw environment snapshots or secret values
- no runtime API keys
- no raw provider errors
- no provider operation identifiers
- no image refs/digests in browser payloads
- no TrustGate/LiteLLM internal routing errors in chat output

Use:

```bash
npm run runtime:operator-safety
npm run runtime:capability-drift
```

Managed Hermes launches reject explicit deprecated Hermes image overrides. Empty-body managed re-home resolves through the canonical Lucid worker image line so stale Hermes-specific image config cannot block operator recovery.

## Testing

```bash
npm run test -- --run                           # Full suite (~2600 tests)
npm run test -- --run src/pulse/__tests__/       # Pulse only (~170 tests)
npm run test -- --run src/polling/__tests__/     # Polling fallback
npm run test -- --run src/agent/__tests__/       # Agent runtime
npm run test -- --run src/skills/polymarket/     # Polymarket skill (~700 tests)
```
