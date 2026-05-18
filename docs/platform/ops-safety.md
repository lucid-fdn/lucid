# Ops Safety

Lucid's ops-safety helpers keep scripts and worker tooling predictable when they run external commands or remove files. They are developer-facing guardrails, not product UI.

## External Commands

Use `@lucid/ops-safety` for new command execution instead of ad hoc `child_process` calls.

Primary helper:

```ts
import { runTrustedCommand } from '@lucid/ops-safety'
```

Rules:

- Keep commands allowlisted and explicit.
- Pass arguments as arrays, not shell-concatenated strings.
- Set timeouts for long-running work.
- Redact secrets before logging stdout, stderr, or thrown errors.
- Do not route untrusted user text into command names or shell fragments.

The invariant gate is:

```bash
npm run audit:external-exec
```

It rejects new direct external process usage outside approved files and packages.

## Safe Removal

Use `planSafeRemove()` and `executeSafeRemove()` when a script needs to remove generated files or directories.

Primary helpers:

```ts
import { planSafeRemove, executeSafeRemove } from '@lucid/ops-safety'
```

Rules:

- Remove only paths inside an explicitly allowed root.
- Block repository root, home directory, filesystem root, and empty paths.
- Prefer dry-run planning before destructive execution.
- Keep cleanup scripts idempotent.
- Never use forceful recursive removal for user-owned or runtime-owned state unless the allowed root is narrow and test-covered.

The invariant gate is:

```bash
npm run audit:safe-remove
```

It rejects new direct destructive filesystem calls outside approved wrappers.

## Package Boundary

The package lives at `packages/lucid-ops-safety` and builds during root `postinstall`. It is intentionally small so scripts, workers, and future CLIs can share the same safety vocabulary without importing product-layer code.

Do not put product-specific policy in this package. Product policy should live in the relevant domain package and call these helpers only for low-level execution/removal safety.
