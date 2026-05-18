# @lucid/openclaw-runtime

First-party OpenClaw runtime adapter bundle for Lucid dedicated and BYO/local runtime paths.

This package is the OpenClaw-side peer to `@lucid/hermes-runtime`. It keeps OpenClaw engine behavior behind Lucid's runtime/capability contracts so product code can stay engine and runtime agnostic.

## Responsibilities

- Run OpenClaw behind the `@lucid/agent-bridge` packet and heartbeat contracts.
- Report adapter identity, execution targets, runtime services, parser/probe status, EHV/OHV policy, and native OpenClaw capability metadata.
- Execute runtime management commands and ACK them through the shared command lifecycle.
- Preserve OpenClaw-specific value such as native tools, sessions, memory/skills/plugin behavior, channel diagnostics, browser/media/nodes, and OpenClaw runtime metadata.
- Keep BYO/local behavior runtime-authoritative: the local adapter may accept, reject, or require user action for Lucid management commands according to local policy.

## Shared Product Contract

Lucid product surfaces should not branch directly on OpenClaw where a capability can describe behavior.

- Runtime support lives in `@lucid/runtime-compat`.
- Adapter metadata lives in `@lucid/runtime-adapters`.
- Adapter authoring validation lives in `@lucid/runtime-adapter-sdk`.
- Engine-home portability lives in `@lucid/engine-home` and `contracts/engine-home.ts`.

## Management Commands

OpenClaw runtimes use the same command lifecycle as Hermes:

- `adapter.probe`
- `transcript.parser.test`
- `runtime.services.inspect`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

Commands move through queued, sent, acked, applied, rejected, failed, and stale/requeued states. Mission Control shows the lifecycle without exposing secrets, raw environment values, provider deployment IDs, or internal logs for Lucid-operated runtimes.

## Verification

Current production verification: `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.
