# Runtime Parity Verification - 2026-05-08

This is the current production verification record for the OpenClaw/Hermes runtime parity work shipped during the May 2026 runtime push. It supersedes the 2026-05-07 note for final production-readiness status.

## Scope

- Engines: Hermes and OpenClaw.
- Runtime tiers: Lucid shared, Lucid dedicated, and BYO/local.
- Control surfaces: Mission Control Runtime Detail, runtime maintenance, management commands, mutation review, adapter probes, parser tests, runtime services, EHV/HHV/OHV flows, Provider Keys, assistant inference routing, and chat.
- TrustGate modes: Auto, Lucid managed, and BYOK only.

## Architecture Outcome

- Lucid is engine-agnostic at the product/control-plane boundary. Product code reads capabilities, services, parser status, probe status, EHV policy, and command lifecycle instead of branching on engine names where a capability can express the behavior.
- Lucid is runtime-agnostic across shared, dedicated, and BYO/local. Runtime differences are represented as runtime flavor, channel ownership, execution target, policy, and adapter authority.
- Shared Lucid systems remain centralized: channels, shared skills/plugins, Knowledge/memory policy, TrustGate/BYOK, access control, approvals, audit, billing, Mission Control, and mutation review.
- Engine-local value is preserved through native capability reporting:
  - Hermes: home state, local-first controls, checkpoints, model discovery/profiles, quota windows, transcript parser, Kanban projection, and reserved dreaming discovery.
  - OpenClaw: native tools, sessions, memory/skills/plugins behavior, native/channel diagnostics, browser/media/node capabilities, and OpenClaw runtime metadata.
- Engine memory virtualization is the governed bridge for engine-local state. Hermes HHV and OpenClaw OHV use snapshot, diff, export, import, rollback, and review contracts instead of leaking engine-specific files into shared product state.
- Runtime management commands are durable, auditable, and visible: `queued`, `sent`, `accepted`, `rejected`, `needs_user_action`, `applied`, `failed`, or `expired`.

## Runtime Maintenance

Re-home is a first-class runtime maintenance action.

- Operator/API route: `POST /api/runtimes/:id/maintenance/rehome?org_id=:orgId`
- Generic compatibility route: `/api/runtimes/:id/maintenance` still accepts `{ "action": "rehome" }`
- Database action: `runtime_maintenance_jobs.action = "rehome"`
- Provider detail: `result_payload.mode = "l2-rehome"` describes the L2 orchestration path only; it is not a compatibility redeploy.
- Empty-body Hermes re-home now resolves to the canonical Lucid worker image for managed launches even if old Hermes image config is stale.
- Explicit deprecated Hermes image overrides are still rejected.

Latest verified Hermes dedicated re-home:

- Result: success.
- Latest job action: `rehome`.
- Latest job status: `succeeded`.
- Runtime status after re-home: `connected`.
- Capability report after re-home: refreshed.
- Maintenance error: none.

## Production Runtime Command Matrix

Final production command matrix was run against:

| Engine | Runtime tier | Result |
| --- | --- | --- |
| Hermes | Lucid dedicated | Passed |
| OpenClaw | Lucid dedicated | Passed |

Commands verified for both engines:

| Command | Hermes | OpenClaw |
| --- | --- | --- |
| `adapter.probe` | `applied`, ACKed, no error | `applied`, ACKed, no error |
| `transcript.parser.test` | `applied`, ACKed, no error | `applied`, ACKed, no error |
| `runtime.services.inspect` | `applied`, ACKed, no error | `applied`, ACKed, no error |
| `engine_home.snapshot` | `applied`, ACKed, no error | `applied`, ACKed, no error |
| `engine_home.diff` | `applied`, ACKed, no error | `applied`, ACKed, no error |
| `engine_home.export` | `applied`, ACKed, no error, inline archive available | `applied`, ACKed, no error, inline archive available |
| `engine_home.rollback` | `applied`, ACKed, no error | `applied`, ACKed, no error |

Observed EHV summaries:

- Hermes dedicated home snapshot/export/rollback covered 3 entries.
- OpenClaw dedicated home snapshot/export/rollback covered 0 entries, which is expected for the verified empty managed home.

## BYO/Local Verification

BYO/local runtimes were smoke-tested with temporary runtime records, then revoked after verification.

- Hermes BYO:
  - heartbeat: passed
  - capability report: passed
  - management commands: applied
  - chat path: passed
  - EHV snapshot/diff/export: passed
  - rollback: skipped only when export was too large for inline archive; managed Hermes rollback was verified with inline archive
- OpenClaw BYO:
  - heartbeat: passed
  - capability report: passed
  - management commands: applied
  - chat path: passed
  - EHV snapshot/diff/export/rollback: passed

BYO rules remain:

- Local secrets, local binaries, process control, and machine-specific probes can be runtime-authoritative.
- Lucid sends signed requests and records accepted/refused/needs-user-action/applied states.
- BYO UI may show user-owned endpoint and local adapter metadata, but raw environment snapshots remain hidden.

## TrustGate And BYOK Verification

TrustGate/BYOK routing was verified through UI/API and chat flows.

- Provider Keys page:
  - empty state
  - invalid key validation
  - valid OpenAI key add
  - active/inactive toggle
  - delete key
  - TrustGate sync success/failure handling
- Assistant inference modes:
  - Auto
  - Lucid managed
  - BYOK only
  - reload persistence
- Runtime/chat:
  - TrustGate routing mode is carried through assistant policy at `policy_config.trustgate.inference_mode`
  - runtime choice does not bypass TrustGate, budget, approval, or audit policy

The optional typed `ai_assistants.inference_mode` migration is additive. The production source of truth remains `policy_config.trustgate.inference_mode`.

## Mission Control UI/UX Verification

Runtime Detail was verified for Hermes and OpenClaw dedicated runtimes after final command matrix execution.

Visible and correct:

- connection status
- runtime flavor and relay execution model
- runtime capabilities
- engine-native feature list
- adapter identity
- Engine memory policy
- parser status
- runtime services
- management command controls
- recent command rows with `applied` ACK states
- health history

Mutation review was verified earlier in this runtime push for Hermes and OpenClaw candidates.

## Client Redaction And Operator Safety

Client-facing runtime data for Lucid-operated runtimes is sanitized.

Must stay server-side:

- raw environment values and env snapshots
- runtime API keys
- provider operation identifiers
- raw image refs and image digests
- internal deployment identifiers
- raw provider deployment URLs for Lucid-operated dedicated runtimes
- raw provider errors and infrastructure logs
- TrustGate/LiteLLM internal routing errors

Verified UI/API redaction:

- Runtime Detail did not expose provider/env/image/internal identifiers.
- Dedicated runtime errors are Lucid-branded.
- Runtime gateway/provider failures are sanitized before reaching chat output.
- `runtime:operator-safety` passed.

## Deployment And Gates

Latest code pushed to `main`:

- `69cb838f` - blocked deprecated Hermes runtime images.
- `9b43b8b4` - sanitized runtime gateway errors.
- `1d453f9b` - hardened managed runtime launch image resolution.

Verified gates:

- root typecheck: passed
- worker typecheck: passed
- focused image/planner tests: passed
- runtime operator safety gate: passed
- runtime capability drift gate: passed
- GitHub OpenClaw Integration Gates for `1d453f9b`: passed
- Agent SaaS production deployment for `1d453f9b`: success
- Railway live production service status: success

Operational nuance:

- Production readiness was validated from the live deployment status and runtime/product smoke results. GitHub deployment-status metadata is a secondary mirror and should be investigated only if it diverges from live service health.

## Static Drift Gates

Keep these gates blocking:

- no provider/env/log leakage in managed runtime UI
- no unsupported maintenance action drift
- no hardcoded shared runtime source in runtime execution paths
- no hardcoded shared runtime flavor in runners
- no durable global `HERMES_HOME` writes from shared runtime paths
- no worker-local compatibility tables drifting from `packages/runtime-compat`
- no `openclawVersion` as the primary runtime identity in UI
- no deprecated Hermes image tags accepted for explicit managed runtime launch overrides

## Source Of Truth Files

- Runtime contracts: `contracts/runtime-capability.ts`, `contracts/runtime-execution.ts`, `contracts/engine-home.ts`
- Runtime compatibility: `packages/runtime-compat`
- Adapter SDK: `packages/runtime-adapter-sdk`
- Adapter manifests: `packages/runtime-adapters`
- Engine home package: `packages/engine-home`
- Agent bridge SDK: `packages/agent-bridge`
- BYO/operator CLI: `packages/bridge-cli`
- Worker runtime execution: `worker/src/runtime`, `worker/src/runtime-adapters`, `worker/src/agent/engines`
- Mission Control runtime UI: `src/app/(app)/[workspace-slug]/mission-control/system/runtimes/[runtime-id]/runtime-detail-client.tsx`
- Runtime redaction: `src/lib/mission-control/runtime-client-sanitize.ts`
- Runtime maintenance: `src/lib/runtimes/maintenance`, `src/app/api/runtimes/[id]/maintenance`
