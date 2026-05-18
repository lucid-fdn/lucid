# @lucid/hermes-runtime

Lucid-owned Hermes runtime wrapper for both:

- `C1` managed runtimes using Lucid relay + `@lucid/agent-bridge` full mode
- `C2a` / BYO runtimes using observe mode

This package does not embed Hermes into the Node process. It shells out to the
Hermes CLI and uses `@lucid/agent-bridge` for Mission Control connectivity.

Current support level:
- Lucid dedicated/C1 relay: production-smoked through Mission Control re-home, heartbeat, capability report, parser/probe/services, chat, and EHV command matrix.
- BYO/local observe/full bridge: smoke-tested for heartbeat, command ACKs, and chat path.
- `runtime_native` channels: capability-gated. Do not assume support unless the adapter advertises it and the control plane accepts it.
- token usage: estimated from prompt/response text until Hermes exposes authoritative usage

Hermes local-first behavior is preserved through HHV/EHV. Lucid observes, snapshots, diffs, exports, rolls back, and reviews home-state changes through the generic Engine Home contract rather than replacing Hermes home state with Lucid shared memory.

See `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md` for the latest production verification record.

## Environment

Required:

```bash
LUCID_RUNTIME_ID=...
LUCID_RUNTIME_KEY=...
LUCID_CONTROL_PLANE_URL=https://lucid.foundation
```

Optional:

```bash
LUCID_BRIDGE_MODE=observe            # observe (C2a) or full (C1)
HERMES_COMMAND=hermes
HERMES_ARGS_JSON=["chat"]
HERMES_ARGS=chat
HERMES_WORKDIR=/app
HERMES_ENGINE_VERSION=hermes
HERMES_RUNTIME_VERSION=lucid-hermes-runtime/0.1.0
HERMES_MODEL=openai/gpt-4.1
HERMES_TOOLSETS=skills,web
PORT=3000
HERMES_TIMEOUT_MS=90000
HERMES_MIGRATE_OPENCLAW=false
HERMES_MIGRATE_PRESET=user-data
HERMES_MIGRATE_DRY_RUN=false
HERMES_MIGRATE_OVERWRITE=false
HERMES_MIGRATE_SOURCE=/root/.openclaw
HERMES_MIGRATE_WORKSPACE_TARGET=/workspace
HERMES_MIGRATE_SKILL_CONFLICT=rename
```

`HERMES_ARGS_JSON` is preferred because it avoids shell-splitting ambiguity.

`HERMES_ARGS*` is used only in `observe` mode. In `full` mode the runtime
starts an HTTP server, answers `/stream`, and invokes `hermes chat -q ...`
per request / relay packet.

The runtime enforces `HERMES_TIMEOUT_MS` for each Hermes CLI invocation and
returns estimated token usage to `@lucid/agent-bridge` for Mission Control cost tracking.

## OpenClaw migration

If `HERMES_MIGRATE_OPENCLAW=true`, the wrapper runs `hermes claw migrate`
before starting the Lucid bridge. Lucid models this as runtime bootstrap config,
and the wrapper emits structured runtime events for migration started/completed/failed.
This is intended for first-boot migration of:

- persona and memory files
- user skills
- approval allowlists
- provider and messaging settings
- workspace instructions

Typical safe defaults for Lucid-managed or BYO bootstrap are:

```bash
HERMES_MIGRATE_OPENCLAW=true
HERMES_MIGRATE_PRESET=user-data
HERMES_MIGRATE_DRY_RUN=false
```

Use `HERMES_MIGRATE_DRY_RUN=true` to preview migration behavior without mutating
the Hermes profile.

## Runtime capabilities and management commands

The wrapper/worker reports Hermes through the runtime capability plane:

- adapter identity
- engine home policy
- native capabilities such as Hermes home, checkpoints, local-first controls, model discovery/profiles, quota windows, transcript parser, Kanban projection, and reserved dreaming discovery
- runtime services such as Hermes bridge and home projector
- adapter probe status
- transcript parser status

The worker command executor supports:

- `adapter.probe`
- `capability.refresh`
- `runtime.services.inspect`
- `transcript.parser.test`
- `runtime.config.refresh`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

Managed Hermes re-home uses the canonical Lucid worker image line. Explicit deprecated Hermes image overrides are rejected, while empty-body managed re-home falls back to the approved worker image so stale image configuration cannot block recovery.

## Build

```bash
npm install
npm run build
```

## Docker

This package includes a reference Dockerfile that installs Hermes via `uv`,
builds `@lucid/agent-bridge`, and starts the Lucid Hermes wrapper:

```bash
docker build -f packages/hermes-runtime/Dockerfile -t lucid-hermes-runtime .
```
