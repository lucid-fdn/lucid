# @lucid/runtime-adapters

Built-in runtime adapter manifests for Lucid-supported engines.

This package describes Hermes and OpenClaw through the same adapter/capability vocabulary so Mission Control, Team Ops, BYO tooling, and worker runtimes do not need engine-specific feature tables.

## Responsibilities

- Expose built-in adapter metadata.
- Keep Hermes/OpenClaw capabilities represented as native capability descriptors.
- Keep adapter identity, execution targets, services, probes, parser support, command surfaces, and EHV policy aligned with `contracts/runtime-capability.ts`.
- Support `@lucid/runtime-adapter-sdk` validation and tests.

## Product Rule

Do not flatten engines to a lowest common denominator.

- Hermes-specific value should surface as capabilities such as home, local-first controls, checkpoints, model discovery/profiles, quota windows, transcript parser, Kanban projection, and reserved dreaming discovery.
- OpenClaw-specific value should surface as capabilities such as native tools, sessions, browser/media/nodes, native channel diagnostics, memory/skills/plugins behavior, and OpenClaw runtime metadata.
- Lucid product flows should route by capability and policy, not by raw engine name.

## Verification

Current production verification: `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.
