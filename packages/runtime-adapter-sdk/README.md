# @lucid/runtime-adapter-sdk

SDK helpers for building and testing Lucid runtime adapters.

Use this package when implementing first-party or external adapters for Hermes, OpenClaw, or future engines. The SDK keeps adapter reports aligned with the shared runtime capability contract instead of letting every adapter invent its own shape.

## Adapter Contract

Adapters should report:

- adapter identity
- execution targets
- native capabilities
- runtime services
- environment/probe summary
- transcript parser support
- runtime command surface
- Engine Home policy

## Command Lifecycle

Runtime management commands are durable and operator-visible. Adapters/runtimes can return:

- `accepted`
- `rejected`
- `needs_user_action`
- `applied`
- `failed`

Lucid product UX should show those states directly instead of assuming Lucid can mutate every BYO/local runtime.

## Current Built-In Commands

- `adapter.probe`
- `capability.refresh`
- `runtime.services.inspect`
- `transcript.parser.test`
- `runtime.config.refresh`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

## Verification

See `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md` for the latest OpenClaw/Hermes runtime matrix and Mission Control UI verification record.
