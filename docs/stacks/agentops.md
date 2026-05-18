# AgentOps Stack

**Status:** Active
**Stack ID:** `agentops`

AgentOps is the operational substrate for Lucid. It turns agent, team, runtime, app, workflow, and commerce activity into traceable events that operators can inspect, approve, remediate, and replay.

AgentOps is not the UI. Mission Control is the UI. AgentOps is the data and action layer underneath it.

## Owns

- Trace identifiers and run correlation.
- Feed event normalization.
- Runtime health and heartbeats.
- Cost telemetry.
- Approval lifecycle events.
- Incidents, remediation candidates, and operational proof.
- App-scoped operator feed surfaces.
- Runtime capability registry surfaces.
- Managed pack install/reconcile/fork/uninstall audit.
- Channel-native command normalization.

## Does Not Own

- Business side effects.
- Provider SDK calls.
- Mission Control page layout.
- Agent planning logic.

## Current Surfaces

- `contracts/agentops.ts`: shared event taxonomy, class lookup, and stack-owner lookup.
- `contracts/events.ts`: shared event shapes.
- `packages/agent-bridge/`: BYO runtime heartbeat, events, approvals, costs, message relay.
- `src/lib/app-service/runtime-gateway/agentops.ts`: app-scoped AgentOps gateway surface.
- `src/lib/app-service/observability.ts`: App Service spans and metrics.
- `src/lib/agent-ops/capability-source.ts`: generated capability matrix source of truth.
- `src/lib/agent-ops/external-host-packs.ts`: generated host-pack and Claude/Codex/Cursor/OpenClaw/Hermes instruction source.
- `src/lib/agent-ops/release-quality-gates.ts`: release gate contract.
- `src/lib/agent-ops/lucid-packs.ts`: managed pack manifests, reconcile semantics, fork/uninstall governance.
- `worker/src/agent/runtime-tools/feed-events.ts`: worker feed event utilities.
- `worker/src/agent-ops/browser-operator/`: procedure runner, Trust Shield, and handoff execution layer.
- `src/app/api/mission-control/feed/`: Mission Control feed API family.
- `src/app/(app)/[workspace-slug]/mission-control/agent-ops/`: run detail, packs, eval receipts, mode/notices, Browser Operator, and quality evidence.
- `docs/generated/`: generated capability matrix, host packs, and installer manifests.

## Integration Rules

- Every stack that performs meaningful work should emit an AgentOps event with a stable trace/run/request identifier.
- AgentOps events must be redacted before persistence or public/operator return.
- Provider-specific webhook payloads must be normalized before they enter AgentOps.
- AgentOps should contain enough context to debug, but not enough to replay secrets.
- Mission Control reads AgentOps; it should not reconstruct operational truth from UI state.
- Runtime behavior should branch on declared capabilities and runtime profiles, not engine names.
- Host packs are distribution UX; they must mirror Agent Ops method without becoming an alternate source of workflow truth.
- Lucid Pack resources archive on uninstall and fork on local edit when policy requires it; do not delete history needed for replay.

## Event Classes

- Runtime lifecycle: heartbeat, online/offline, degraded, restart, update.
- Run lifecycle: accepted, started, tool_call, completed, failed, cancelled.
- Approval lifecycle: requested, approved, denied, expired.
- Team lifecycle: team/crew run started/completed/failed, member started/completed/failed.
- Commerce lifecycle: intent created, policy decision, approval, credential issued, provider event, reconciliation mismatch.
- App Service lifecycle: generation, build, deploy, public request, operator action, abuse/rate-limit event.
- Provider lifecycle: provider health, rate limit, circuit, external deployment.
- Trust/security lifecycle: auth failure, policy denial, unsafe report, abuse signal.
- Data lifecycle: receipt, passport, epoch anchoring.
- Knowledge lifecycle: claim created/updated/superseded/resolved/archived, Think output, import preview/commit, source doctor, embedding doctor, semantic claim conflict.
- Pack lifecycle: install, reconcile, drift, fork, uninstall archive.
- Browser Operator lifecycle: procedure run, Trust Shield denial/warning, handoff requested/resolved/resumed.
- Channel lifecycle: normalized command accepted, report sent, launch failed, provider delivery state.

New event types should be added to `contracts/agentops.ts` first, then consumed by Mission Control, runtimes, or stack-specific event emitters.

## Current Gate Expectations

- `npm run agent-ops:capability-docs:check` verifies generated public and Claude/host-pack docs.
- `npm run agent-ops:quality-gates -- --dry-run` verifies shared release-gate definitions.
- Authenticated E2E should cover Workspace Brain, Project Brain, Team Context, Agent Operating Context, Commerce context attachment, Daily Intel, and pack fork UI when those surfaces change.
- Worker stress should cover Browser Operator procedures, Trust Shield checks, handoff behavior, channel commands, and runtime capability reporting when execution code changes.

## Backlog Direction

- Keep the shared taxonomy in sync with runtime route schemas and bridge types.
- Keep Mission Control run detail consuming every new primitive: run modes, notices, eval receipts, Knowledge Think output, claims used/created, pack drift, and system gap doctors.
- Expand live channel smoke coverage as providers become available.
- Add redaction tests for commerce/provider events and pack/import payloads whenever new provider payload shapes are introduced.
