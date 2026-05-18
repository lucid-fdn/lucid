# @lucid/runtime-compat

Shared compatibility helpers for Lucid runtimes.

This package is the guardrail against hardcoded engine/runtime assumptions. It defines how engines, runtime flavors, channel ownership, and execution targets fit together.

## Runtime Axes

- Engine: OpenClaw, Hermes, Lucid, future engines.
- Runtime flavor: shared, Lucid dedicated/C1 managed, BYO/local/C2a.
- Channel ownership: Lucid relay, runtime native, or hybrid where supported.
- Execution target: shared worker, dedicated worker, local/BYO process, future adapter targets.

## Rules

- Unknown engines should fail loudly instead of silently falling back to OpenClaw.
- Runtime-native channels require explicit adapter/control-plane support.
- Shared Hermes must not write durable global `HERMES_HOME`.
- Product code should consume capability descriptors instead of maintaining worker-local compatibility tables.

## Gates

Run:

```bash
npm run runtime:capability-drift
```

The gate blocks regressions such as hardcoded shared event sources, hardcoded shared runtime flavor in runners, global Hermes home writes, worker-local compatibility drift, and OpenClaw-primary runtime identity in UI.

## Verification

Current production verification: `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.
