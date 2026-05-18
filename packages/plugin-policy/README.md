# `@lucid/plugin-policy`

`@lucid/plugin-policy` is the canonical manifest preparation layer for plugins and integrations.

It sits below deployment choice and below agent-engine choice:

- shared runtimes
- dedicated runtimes
- BYO runtimes
- OpenClaw
- Hermes
- future engines

All of those consumers should receive already-prepared manifests from this package, not raw DB rows or provider payloads.

## What It Owns

The package is responsible for:

- normalizing tool manifests into one internal contract
- validating model-facing parameter schemas
- attaching manifest metadata
- producing a stable manifest hash
- letting callers drop invalid tools instead of poisoning a full request

The core entrypoint is:

- [`prepareToolManifest`](./src/tool-manifest.ts)

## Canonical Data Flow

There are two canonical schema sources today:

1. `plugin_catalog.tool_manifest`
2. `oauth_action_catalog.parameter_schema`

`org_plugin_installations.manifest_snapshot` is a derived cache, not a forever-authoritative source of truth.

Current lifecycle:

1. Catalog or discovery returns raw tool definitions
2. `prepareToolManifest()` normalizes and validates them
3. install/refresh stores the normalized snapshot plus manifest metadata
4. app and worker boundaries re-run preparation before model exposure
5. runtime consumers only see the prepared manifest

This keeps the contract deployment-agnostic and engine-agnostic.

## Manifest Contract

The current manifest constants live in [`src/tool-manifest.ts`](./src/tool-manifest.ts):

- `TOOL_MANIFEST_VERSION = "2026-04-20.1"`
- `TOOL_MANIFEST_COMPATIBILITY = "openai-functions-v1"`

Each prepared manifest returns:

- `tools`
- `issues`
- `metadata.manifestVersion`
- `metadata.compatibility`
- `metadata.manifestHash`
- `metadata.generatedAt`
- `metadata.toolCount`
- `metadata.validToolCount`
- `metadata.invalidToolCount`
- `metadata.hasErrors`

## Schema Rules

Top-level tool parameters must be an object schema.

Current normalization behavior:

- missing tool descriptions are defaulted from the tool name
- missing top-level `type` is defaulted to `object`
- array schemas missing `items` are defaulted to an open schema and logged as warnings
- invalid `properties` values are replaced with an empty object and logged as warnings
- invalid `anyOf` / `oneOf` / `allOf` values are removed and logged as warnings

Current hard-error behavior:

- missing/empty tool name
- non-object `parameters`
- top-level `parameters.type` not equal to `object`

Callers decide whether invalid tools are retained or dropped with:

- `dropInvalidTools: true`

Runtime-facing boundaries should normally drop invalid tools.

## Runtime Expectations

The same prepared manifest should be consumable by:

- worker RPC row mapping
- app worker proxy payload shaping
- dedicated runtime payloads
- shared runtime payloads
- BYO runtime payloads
- engine adapters that reformat the same manifest for OpenClaw, Hermes, or other engines

This package intentionally does not know about a specific runtime transport or model SDK.

## Current Call Sites

The manifest pipeline is currently used at these boundaries:

- [`src/lib/oauth/catalog-tools.ts`](../../src/lib/oauth/catalog-tools.ts)
- [`src/lib/oauth/discover-integration-tools.ts`](../../src/lib/oauth/discover-integration-tools.ts)
- [`src/lib/db/plugins.ts`](../../src/lib/db/plugins.ts)
- [`src/lib/ai/worker-proxy.ts`](../../src/lib/ai/worker-proxy.ts)
- [`worker/src/agent/plugin-types.ts`](../../worker/src/agent/plugin-types.ts)
- [`src/manifest.ts`](./src/manifest.ts)

## Failure Model

Install/refresh-time behavior:

- invalid manifests are rejected when `metadata.hasErrors` is true
- normalized metadata is persisted alongside the snapshot

Runtime behavior:

- invalid tools are quarantined or dropped instead of failing the entire request
- normalization warnings are logged with manifest hash + issue counts for debugging

This design prevents one malformed tool schema from breaking all tools on an assistant run.

## Community and Future Tooling

Community, partner, and first-party tools should all enter through the same manifest contract.

That keeps future support for:

- JSON-Schema-defined tools
- OpenAPI-derived tools
- MCP-backed tools

compatible with the same governance layer instead of creating provider-specific schema paths.
