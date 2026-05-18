# Runtime Stack

**Status:** Active
**Stack ID:** `runtime`

Runtime is the engine-neutral execution layer. It lets Lucid run agents through the shared worker, OpenClaw, Hermes, dedicated runtimes, and BYO runtimes without letting one engine define the whole platform.

The runtime stack is agnostic by contract and capability-aware at execution time. Shared, dedicated, and BYO/local runtimes use the same control-plane vocabulary, while engines advertise native capabilities such as Hermes Curator/Kanban/checkpoints or OpenClaw native channel receipts/diagnostics.

## Owns

- Runtime protocol and heartbeat semantics.
- Agent tool execution boundary.
- Engine adapters.
- Shared worker execution loops.
- Dedicated runtime and BYO runtime bridge behavior.
- Runtime capability reporting.

## Does Not Own

- Operator UI.
- Provider SDK side effects.
- Commerce ledger state.
- General auth policy.

## Current Surfaces

- `worker/src/agent/`: worker-side agent loop, tools, engines, runtime adapters.
- `worker/src/runtime/` and `worker/src/runtime-adapters/`: runtime surfaces.
- `packages/agent-bridge/`: BYO runtime SDK.
- `packages/bridge-cli/`: BYO/runtime operator CLI for capability, service, probe, and command workflows.
- `packages/hermes-runtime/`, `packages/openclaw-runtime/`, `packages/runtime-compat/`, `packages/engine-home/`: runtime packages.
- `src/lib/runtimes/`: control-plane runtime helpers.
- `src/lib/mission-control/runtime-client-sanitize.ts`: browser-facing runtime redaction for Lucid-operated runtimes.
- `contracts/runtime-capability.ts`: shared adapter identity, native capability, runtime service, probe/parser, command, and EHV policy contract.

## Integration Rules

- Runtime tools should call internal Lucid APIs for sensitive side effects.
- Runtime tools must not import provider SDKs for Commerce, billing, auth, or external deployment.
- Engine-specific objects must not leak into shared contracts.
- Every runtime action that matters should emit AgentOps events.
- Runtime identity must be derived from verified runtime keys, not request bodies.
- Runtime-local home state must cross engine/runtime boundaries through EHV snapshots, diffs, and archives rather than engine-specific file assumptions. EHV snapshots must be bounded and non-following: symlinks are recorded as metadata, external symlinks are not followed or restored, large files are represented by metadata instead of raw content, and command ACKs return summaries rather than unbounded home payloads.

## Agent Commerce Rules

- Agent Commerce tools live at the runtime boundary but execute through Commerce internal APIs.
- Runtime receives decisions and safe references, not raw credentials.
- Spend request idempotency key should include runtime/run/tool-call context.
- Approval-required commerce tools must integrate with Trust and Mission Control.

## Backlog Direction

- Add engine-neutral commerce runtime tools.
- Add stack ID tagging to runtime events.
- Keep OpenClaw/Hermes/BYO runtime compatibility tests for new tool surfaces.
- Wire EHV snapshots into shared Hermes HHV, then add dashboard/API review and dedicated/BYO sync.
- Use the implemented runtime capability plane so multiagent teams can route by required capability instead of engine name.
- Runtime management commands are now executable by workers for probes, parser tests, services inspection, config refresh, and bounded EHV snapshot/diff/export/rollback.
- Run `npm run runtime:operator-safety` with runtime UI/API changes to block managed-provider leakage, unsupported maintenance-action drift, and re-home endpoint regressions.
- Run `npm run runtime:capability-drift` with broad runtime changes to block hardcoded shared-source/runtime regressions and OpenClaw-primary identity drift.
- Keep Lucid team/work boards as the source of truth; project engine-native boards such as Hermes Kanban into Lucid work items through adapters.

## Verification Notes

- Latest runtime parity, TrustGate/BYOK, Mission Control, re-home, command matrix, and sanitizer verification: [Runtime parity verification 2026-05-08](../platform/mission-control/runtime-parity-verification-2026-05-08.md).
- Next implementation plan: [Runtime Capability Plane, OpenClaw/Hermes Native Parity](../plans/2026-05-07-runtime-capability-plane-openclaw-hermes-plan.md).
