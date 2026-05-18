# @lucid/bridge-cli

CLI for connecting agents and BYO/local runtimes to Lucid Mission Control. Separate package from the SDK (`@lucid/agent-bridge`).

`lucid-runtime` is the canonical operator command. `lucid-bridge` remains a backwards-compatible alias for older docs and scripts.

## Install

```bash
npm install -D @lucid/bridge-cli
```

## Commands

```bash
lucid-runtime init              # Create BYO runtime, generate .env.lucid
lucid-runtime status <id>       # Check runtime connection status
lucid-runtime list              # List BYO runtimes
lucid-runtime env [file]        # Display env vars from .env.lucid
lucid-runtime run               # Start the local/BYO bridge
lucid-runtime capabilities <id> # Show engine/adapter capabilities
lucid-runtime services <id>     # Show runtime services
lucid-runtime probe <id>        # Queue an adapter probe command
lucid-runtime command <id> <t>  # Queue a runtime command
lucid-runtime commands <id>     # Show management command history
```

Examples:

```bash
lucid-runtime command <id> transcript.parser.test --payload '{"fixture":"user: hello\nassistant: hi"}'
lucid-runtime command <id> runtime.services.inspect
lucid-runtime command <id> engine_home.snapshot
lucid-runtime command <id> engine_home.diff
lucid-runtime command <id> engine_home.export --payload '{"includeContents":true}'
lucid-runtime command <id> capability.refresh
```

Rollback requires an engine-home archive and explicit confirmation:

```bash
lucid-runtime command <id> engine_home.rollback --payload '{"confirm":true,"clean":false,"archive":{...}}'
```

Hermes examples:

```bash
lucid-runtime init --engine hermes --name "hermes-agent"
lucid-runtime run --engine hermes --prompt "Reply with ok"
lucid-runtime init --engine hermes --name "hermes-agent" --migrate-openclaw --migrate-dry-run
```

For BYO / `C2a`, that generates a Hermes-oriented `.env.lucid` with:

- `LUCID_ENGINE=hermes`
- `LUCID_BRIDGE_MODE=observe`
- `HERMES_COMMAND=hermes`
- `HERMES_ARGS_JSON=["chat"]`

OpenClaw examples:

```bash
lucid-runtime init --engine openclaw --name "openclaw-agent"
lucid-runtime run --engine openclaw --prompt "Reply with ok"
```

`lucid-runtime run` is the product BYO entrypoint. It starts the engine-agnostic
`@lucid/agent-bridge`, reports adapter identity/capabilities/services/EHV policy,
executes queued management commands, and ACKs them back to Mission Control. For
Hermes it uses `HERMES_COMMAND` or `hermes` by default. For OpenClaw it uses
`OPENCLAW_RUNTIME_COMMAND`, `OPENCLAW_COMMAND`, `openclaw`, or the local
repo-bundled `packages/openclaw-core/openclaw.mjs` when developing inside
LucidMerged.

One-shot and smoke paths:

```bash
lucid-runtime run --smoke --duration-ms 5000
lucid-runtime run --engine hermes --oneshot "Summarize your status"
lucid-runtime run --engine openclaw --args '["agent","--local","--message","{prompt}","--json"]' --prompt "Status"
```

Pass `--agent-id <assistant-uuid>` when you want observe-mode run telemetry attached
to a real Lucid assistant. Smoke runs without an assistant id only prove bridge
heartbeat, capability reporting, and command ACK wiring; they do not emit fake
assistant events.

Hermes `C2a` uses the same runtime compatibility contract as OpenClaw: Lucid records the runtime's advertised adapter identity, supported execution targets, channel ownership, parser support, command surface, services, and EHV policy. Native channel ownership is enabled only when the selected engine/runtime adapter advertises support and the control plane accepts that capability.

BYO/local policy remains runtime-authoritative. A runtime can accept, reject, apply, fail, or return `needs_user_action` for a queued command. Mission Control and this CLI show that lifecycle instead of assuming Lucid can mutate local machines unilaterally.

Hermes can also bootstrap from an existing OpenClaw profile during first start:

```bash
lucid-runtime init \
  --engine hermes \
  --name "hermes-agent" \
  --migrate-openclaw \
  --migrate-preset user-data \
  --migrate-source ~/.openclaw \
  --migrate-workspace-target "$PWD"
```

That writes Hermes migration env vars into `.env.lucid`, including:

- `HERMES_MIGRATE_OPENCLAW=true`
- `HERMES_MIGRATE_PRESET=user-data|full`
- `HERMES_MIGRATE_DRY_RUN=true|false`
- `HERMES_MIGRATE_OVERWRITE=true|false`
- optional source/workspace/skill conflict settings

For Lucid-managed `C1`, the runtime package uses:

- `LUCID_ENGINE=hermes`
- `LUCID_BRIDGE_MODE=full`
- the same Hermes CLI command/toolset envs

Shared Hermes is handled inside the Lucid worker via the engine runner seam rather than `lucid-runtime init`.

## Verification

The latest OpenClaw/Hermes runtime parity, BYO smoke, TrustGate/BYOK, EHV command matrix, and Mission Control UI verification record is:

```text
docs/platform/mission-control/runtime-parity-verification-2026-05-08.md
```

## Authentication

All commands (except `env`) require auth. Resolution order:

1. `--token <token>` flag
2. `LUCID_TOKEN` env var
3. `~/.lucid/credentials.json` (from `lucid login`)

Control plane URL: `--url` flag > `LUCID_CONTROL_PLANE_URL` env > credentials file > `https://lucid.foundation`.

## CI/CD

```bash
LUCID_TOKEN=$TOKEN npx lucid-runtime init --name "prod-agent" --json
```

See `@lucid/agent-bridge` README for full documentation.
