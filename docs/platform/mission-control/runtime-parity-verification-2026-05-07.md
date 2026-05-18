# Runtime Parity Verification - 2026-05-07

> Superseded for final production status by [Runtime parity verification 2026-05-08](./runtime-parity-verification-2026-05-08.md). This file remains as the first full-pass record.

This note records the production-readiness pass for the Hermes/OpenClaw runtime parity work, engine memory virtualization, BYOK routing, and Mission Control runtime UX.

## Scope

- Engines: Hermes and OpenClaw.
- Runtime tiers: Lucid shared, Lucid dedicated, and BYO.
- Control surfaces: Mission Control runtime list/detail, mutation review, adapter probes, parser tests, services, EHV views, assistant settings, and chat.
- TrustGate modes: Auto, Lucid managed, and BYOK only.

## Architecture Outcome

- Runtime execution is engine-neutral at the control-plane boundary.
- Shared Lucid capabilities stay centralized: channels, skills/plugins, memory policy, TrustGate routing, runtime compatibility, and operator review.
- Engine-local state crosses runtime boundaries through EHV snapshots, diffs, commits, rollback, export, and import instead of Hermes- or OpenClaw-specific file assumptions.
- Runtime adapters report identity, execution targets, parser support, command surfaces, probe summaries, and management capabilities through heartbeat/status contracts.
- BYO runtimes can keep local authority for secrets, native files, process control, and machine-specific probes while still exposing accepted/rejected/needs-user-action states to Lucid.

## Client Data Contract

Mission Control must not expose Lucid-operated infrastructure internals to the browser.

- Lucid shared and dedicated runtimes show Lucid-branded status and capability data.
- Lucid dedicated runtimes hide provider-specific deployment URLs, provider operation identifiers, image references, raw environment snapshots, and internal deployment errors from client responses.
- BYO runtimes may show user-owned endpoint and local adapter metadata because that infrastructure is owned by the workspace operator.
- Runtime logs shown in the UI are sanitized and Lucid-branded. Environment variable names, secret-shaped values, and provider internals must stay server-side.
- `runtime-client-sanitize.ts` is the shared client redaction layer for `/api/runtimes` and `/api/runtimes/:id`.

## Verified Flows

| Area | Coverage |
| --- | --- |
| BYOK provider keys | Empty state, invalid key validation, valid OpenAI key add, deactivate, reactivate, delete |
| Assistant inference mode | Auto, Lucid managed, BYOK only, reload persistence |
| TrustGate routing | Assistant policy persists through `policy_config.trustgate.inference_mode`; typed column migration is additive |
| Hermes chat | Real UI message round trip with deterministic response token |
| OpenClaw chat | Real UI message round trip with deterministic response token |
| Hermes mutations | Pending mutation candidate reviewed and approved from Mission Control |
| OpenClaw mutations | Fresh mutation candidate inserted and rejected from Mission Control |
| Runtime list/detail | Shared, dedicated, and BYO rows render without OpenClaw-primary identity assumptions |
| Dedicated runtime redaction | Runtime list/detail API and UI do not expose raw environment snapshots or provider internals |
| Runtime labels | Lucid-operated runtimes display Lucid Cloud; unknown runtime versions do not render as `vunknown` |
| Build/typecheck | Root typecheck/build and worker typecheck/build pass after the parity and sanitizer changes |

## Production Deployment Record

- App: deployed to `www.lucid.foundation` after the runtime sanitizer update.
- Worker: Railway deployment completed successfully after runtime log sanitization.
- Public/private route behavior: public site returns 200; authenticated Mission Control routes redirect to login when no operator session is present.

## Operational Follow-Up

- Repeat authenticated production click-through after an operator session is available in the production browser.
- Monitor production runtime logs for sanitizer regressions and add new redaction fixtures when new provider fields are introduced.
- Keep runtime compatibility tests blocking on OpenClaw/Hermes parity, unknown-engine fallback, hardcoded shared runtime sources, and browser-visible dedicated-runtime internals.
