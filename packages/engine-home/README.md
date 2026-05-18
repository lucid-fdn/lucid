# @lucid/engine-home

Engine Home Virtualization helpers for Lucid runtime adapters.

EHV is the generic contract for moving engine-local home state across Lucid boundaries without making the product depend on Hermes or OpenClaw file layouts.

## What It Solves

- Snapshot engine-local home state.
- Diff two snapshots.
- Export a bounded archive.
- Hydrate/rollback from an archive when policy allows it.
- Keep Hermes HHV and OpenClaw OHV behind one shared contract.
- Let Mission Control review engine-local changes without replacing shared Lucid Knowledge, skills, plugins, channels, or approvals.

## Rules

- EHV is not in the chat hot path.
- Shared Lucid memory/Knowledge remains the product brain.
- Engine-local state remains engine-owned unless promoted through Lucid review.
- Symlinks are recorded as metadata; external symlinks are not followed/restored.
- Large files are represented by metadata instead of unbounded raw content.
- Browser/API responses should expose summaries, not raw home payloads, unless an explicit export command requests inline content and it fits size limits.

## Current Production Verification

See `docs/platform/mission-control/runtime-parity-verification-2026-05-08.md`.

Verified command paths:

- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`

Hermes dedicated verified 3-entry snapshot/export/rollback. OpenClaw dedicated verified the empty-home path with 0-entry snapshot/export/rollback.
