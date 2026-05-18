# Tool Manifest Pipeline

This document describes the current Lucid tool-manifest pipeline for plugins and integrations.

It is the current-state reference for:

- internal/plugin tools
- OAuth and Nango-backed integrations
- shared runtimes
- dedicated runtimes
- BYO runtimes
- OpenClaw and Hermes engine adapters

## Why This Exists

Agents only work reliably if model-facing tool schemas are consistent.

The system previously allowed malformed or stale manifests to survive in cached installation snapshots. That created failures where a single invalid tool schema could break an entire request even when the underlying plugin or integration was otherwise healthy.

The current pipeline hardens that path by:

- defining one canonical manifest-preparation step
- treating installation snapshots as caches, not eternal truth
- validating at install time and again at runtime boundaries
- dropping invalid tools instead of failing the whole assistant run

## Source of Truth

Canonical sources:

1. `plugin_catalog.tool_manifest`
2. `oauth_action_catalog.parameter_schema`

Derived cache:

- `org_plugin_installations.manifest_snapshot`

`manifest_snapshot` exists for speed and reproducibility, but it should be generated from canonical sources and refreshed when definitions change.

## Shared Manifest Contract

Lucid’s internal manifest format is a list of tools with:

- `name`
- `description`
- `parameters` as JSON Schema

The current compatibility target is:

- `openai-functions-v1`

The canonical preparation step also emits:

- `manifestVersion`
- `manifestHash`
- `generatedAt`
- `toolCount`
- `validToolCount`
- `invalidToolCount`
- `hasErrors`

Those metadata fields are stored on install/refresh so operators can reason about snapshot freshness and runtime shape.

## Preparation Rules

The manifest pipeline lives in:

- `packages/plugin-policy/src/tool-manifest.ts`

Key rules:

- top-level tool parameters must be an object schema
- missing tool descriptions are defaulted
- missing top-level `type` defaults to `object`
- array schemas missing `items` are normalized to an open schema and logged as warnings
- invalid `properties` are replaced with `{}` and logged as warnings
- invalid `anyOf` / `oneOf` / `allOf` values are removed and logged as warnings
- missing tool names or invalid top-level parameter schemas are hard errors

At runtime, invalid tools are dropped so one bad tool cannot poison the whole request.

At install/refresh time, manifests with hard errors are rejected.

## Where It Runs

The same pipeline is executed at multiple boundaries:

- catalog reads
- Nango/integration discovery
- plugin install
- plugin manifest refresh
- app-side worker proxy shaping
- worker-side plugin row mapping

That duplication is intentional. Validation is repeated at the boundaries where stale cached data or old rows may still surface.

## Deployment-Agnostic by Design

Tool manifests should not depend on where the agent runs.

The same prepared manifest contract is used for:

- shared workers
- dedicated runtimes
- BYO runtimes

Deployment-specific code is allowed to decide:

- routing
- transport
- credential resolution
- cache refresh timing

It should not invent a different tool schema contract.

## Engine-Agnostic by Design

Tool manifests should also not depend on whether the assistant is powered by:

- OpenClaw
- Hermes
- another engine

The engine layer should adapt from the canonical manifest contract into engine-specific tool payloads. The manifest pipeline itself stays below that layer.

## Install and Refresh Semantics

When a plugin or integration is installed/refreshed:

1. build or fetch the raw manifest
2. run manifest preparation
3. reject if there are hard errors
4. store the normalized tools in `manifest_snapshot`
5. store metadata like `manifest_version`, `manifest_hash`, `manifest_generated_at`, and `manifest_compatibility`

This keeps installation snapshots deterministic and auditable.

## Runtime Semantics

When tools are exposed to a live model run:

1. load the cached manifest
2. prepare it again
3. log issues with manifest hash + counts
4. drop invalid tools
5. continue with the valid remainder

The runtime must not fail the full request only because one tool schema is malformed.

## OAuth / Nango Error Handling

OAuth and Nango-backed integrations now also have improved execution-time diagnostics.

Current behavior:

- nested provider errors are extracted more reliably from Nango responses
- auth/permission failures can update passive connection health
- Notion receives more specific reconnect/share guidance when the provider returns usable permission signals
- provider execution failures are distinguished from manifest-shape failures

This means:

- a manifest problem should be treated as schema/governance
- an execution problem should be treated as a provider/runtime issue

## Current Limitations

The system is much safer now, but a few design rules still matter:

- `manifest_snapshot` is still a cache that can go stale if not refreshed
- provider-side execution errors can still be generic when upstream systems do not return structured detail
- engine adapters must continue to consume the canonical contract instead of re-inventing their own schema shapes

## Related Docs

- [Plugins Overview](./overview.md)
- [Install and Activate Plugins](./install-and-activate.md)
- [Dedicated Runtimes](../mission-control/dedicated-runtimes.md)
- [`@lucid/plugin-policy` README](../../../packages/plugin-policy/README.md)
