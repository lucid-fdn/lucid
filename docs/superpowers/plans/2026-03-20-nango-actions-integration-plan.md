# Nango Actions Integration — Implementation Plan

> Current-state note
>
> This plan captures the original rollout sequence. For the current production contract, prefer:
>
> - `docs/platform/plugins/tool-manifests.md`
> - `packages/plugin-policy/README.md`
>
> Current-state differences from this plan:
>
> - manifest hardening is now handled by the shared `@lucid/plugin-policy` preparation layer
> - install/refresh flows normalize and validate manifests before writing `manifest_snapshot`
> - runtime boundaries normalize again and quarantine invalid tools
> - the same prepared manifest contract is consumed by shared, dedicated, and BYO runtimes
> - engine adapters should consume that contract rather than invent engine-specific schema sources

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable AI agents to execute OAuth-authenticated operations (Slack messages, Google Sheets rows, Notion pages, etc.) via Nango SDK `triggerAction()`, unified into the existing plugin 3-tier governance system.

**Architecture:** Nango integrations are first-class `plugin_catalog` entries with `transport: 'nango'`. Tool manifests are snapshotted at install time (zero Nango API calls at chat time). Connection resolution via LEFT JOIN in `get_assistant_active_plugins`. Policy layer: rate limits, audit, confirmation gating — all via `PluginBridge` dispatch.

**Tech Stack:** TypeScript, `@nangohq/node` SDK, Supabase (RPCs), Upstash Redis (rate limits), Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-nango-actions-integration-design.md`

---

## File Structure

### New files (created)

| File | Responsibility |
|------|---------------|
| `worker/src/agent/oauth-tools/types.ts` | `OAuthBinding`, `NangoToolDefinition`, `buildNangoBinding()` factory |
| `worker/src/agent/oauth-tools/nango-client.ts` | Singleton Nango SDK client (`@nangohq/node`) |
| `worker/src/agent/oauth-tools/tool-discovery.ts` | Dynamic discovery via `getScriptsConfig()` with full-response cache |
| `worker/src/agent/oauth-tools/connection-resolver.ts` | Binding -> connectionId resolution |
| `worker/src/agent/oauth-tools/nango-action-bridge.ts` | `executeNangoAction()` via `triggerAction()` + policy layer |
| `worker/src/agent/oauth-tools/rate-limiter.ts` | Redis/Upstash per-run rate limits with in-memory fallback |
| `worker/src/agent/oauth-tools/audit.ts` | Dual-write audit (DB + structured console log) |
| `worker/src/agent/oauth-tools/index.ts` | Barrel exports |
| `supabase/migrations/20260325300000_unify_nango_into_plugin_system.sql` | Unification migration: transport CHECK, RPC LEFT JOIN, catalog seeds |

### Existing files (modified)

| File | Change |
|------|--------|
| `worker/src/config.ts` | Added `NANGO_SECRET_KEY`, `NANGO_HOST` to envSchema |
| `worker/src/agent/plugin-types.ts` | Added `nangoPolicy`, `mapRpcRowToActivatedPlugin()`, `mapWireToActivatedPlugin()` |
| `worker/src/agent/tool-surface/builder.ts` | Nango binding construction in step 4 via `buildNangoBinding()` |
| `worker/src/agent/PluginBridge.ts` | Added `transport: 'nango'` routing to `executeNangoAction()` |
| `worker/src/agent/OpenClawAgent.ts` | Replaced inline discovery with `buildNangoBinding()` loop |
| `worker/src/routes/agentStream.ts` | Replaced inline mapping with shared helpers, removed `oauthBindings` |
| `worker/src/processors/inbound.ts` | Replaced inline mapping with `mapRpcRowToActivatedPlugin()` |
| `src/lib/ai/worker-proxy.ts` | Added `connectionId` to `PluginPayload`, removed `OAuthBindingPayload` |
| `src/app/api/ai/chat/route.ts` | Removed separate `get_assistant_oauth_bindings` RPC call |
| `src/app/api/assistants/[id]/chat/route.ts` | Removed separate `get_assistant_oauth_bindings` RPC call |
| `contracts/plugin.ts` | Added `'nango'` to transport enums |

---

## Chunk 1: OAuth Execution Layer — DONE

- [x] **Task 1: Nango SDK Client** — Singleton `getNangoClient()` + `isNangoConfigured()` in `nango-client.ts`
- [x] **Task 2: Dynamic Tool Discovery** — `getScriptsConfig()` with full-response cache (5min TTL), `discoverToolsBatch()` for dedup in `tool-discovery.ts`
- [x] **Task 3: Connection Resolver** — Explicit binding lookup, `NoOAuthConnectionError` in `connection-resolver.ts`
- [x] **Task 4: Rate Limiter** — Redis/Upstash `INCR` with TTL, in-memory fallback in `rate-limiter.ts`
- [x] **Task 5: Audit** — Dual-write (DB RPC + structured log), arg sanitization in `audit.ts`
- [x] **Task 6: Nango Action Bridge** — `executeNangoAction()` with full policy enforcement in `nango-action-bridge.ts`
- [x] **Task 7: Worker Config** — `NANGO_SECRET_KEY` (optional) + `NANGO_HOST` (default `https://api.nango.dev`)
- [x] **Task 8: Types + Binding Factory** — `OAuthBinding`, `buildNangoBinding()` single source of truth

## Chunk 2: Nango Actions Deployment — DONE

- [x] **Task 9: Nango integrations folder** — `nango-integrations/` with `package.json`, `tsconfig.json`
- [x] **Task 10: Twitter v2 Actions** — 5 actions: `post-tweet`, `search-tweets`, `get-user-info`, `get-user-tweets`, `delete-tweet`
- [x] **Task 11: Nango server upgrade** — v0.36.78 -> v0.69.46
- [x] **Task 12: Deploy to self-hosted** — `npx nango deploy prod --auto-confirm`
- [x] **Task 13: Railway env vars** — `NANGO_SECRET_KEY` + `NANGO_HOST` set on worker service

## Chunk 3: Unification into Plugin Governance — DONE

This chunk replaces the original parallel runtime path with unified plugin governance.

- [x] **Task 14: DB Migration** — `20260325300000_unify_nango_into_plugin_system.sql`
  - Added `'nango'` to `plugin_catalog.transport` CHECK constraint
  - Extended `get_assistant_active_plugins` RPC with LEFT JOIN on `org_integration_connections`
  - Seeded 6 Nango providers (`nango-slack`, `nango-google-sheets`, `nango-notion`, `nango-google-calendar`, `nango-hubspot`, `nango-github`)

- [x] **Task 15: Contracts** — Added `'nango'` to transport enums in `contracts/plugin.ts`

- [x] **Task 16: Plugin Types** — Added `nangoPolicy`, `mapRpcRowToActivatedPlugin()`, `mapWireToActivatedPlugin()` to `plugin-types.ts`

- [x] **Task 17: Tool Surface Builder** — Nango binding constructed in step 4 via `buildNangoBinding()` for `transport: 'nango'` plugins

- [x] **Task 18: PluginBridge** — Added `transport: 'nango'` dispatch to `executeNangoAction()`

- [x] **Task 19: OpenClawAgent** — Replaced runtime `discoverToolsBatch` with `buildNangoBinding()` loop over `pluginCtxMap`

- [x] **Task 20: BFF Simplification** — Removed separate `get_assistant_oauth_bindings` RPC and `oauthBindings` plumbing from:
  - `src/app/api/ai/chat/route.ts`
  - `src/app/api/assistants/[id]/chat/route.ts`
  - `src/lib/ai/worker-proxy.ts`
  - `worker/src/routes/agentStream.ts`
  - `worker/src/agent/types.ts`
  - `worker/src/agent/runtime/types.ts`
  - `worker/src/agent/runtime/embedded.ts`

## Chunk 4: Code Reusability Audit — DONE

- [x] **Task 21: `buildNangoBinding()`** — Extracted shared factory in `oauth-tools/types.ts`. Eliminates duplicate Nango binding construction in `builder.ts` and `OpenClawAgent.ts`.
- [x] **Task 22: `mapRpcRowToActivatedPlugin()`** — Extracted shared helper in `plugin-types.ts`. Eliminates ~15-line inline RPC row mapping in `agentStream.ts` and `inbound.ts`.
- [x] **Task 23: `mapWireToActivatedPlugin()`** — Extracted shared helper in `plugin-types.ts`. Eliminates inline wire payload mapping in `agentStream.ts`.
- [x] **Task 24: Consolidate `slug.replace`** — All `slug.replace('nango-', '')` patterns consolidated inside `buildNangoBinding()`.

## Chunk 5: Test Fixes — DONE

- [x] **Task 25: Receipt emitter tests** — Fixed 4 failing tests: updated assertions to use snake_case wire format (`run_id`, `receipt_hash`, `policy_hash`, `model_passport_id`) matching the actual `postReceipt()` output.

## Chunk 6: Manifest Snapshot Population — PENDING

- [ ] **Task 26: Install-time discovery** — When org installs a Nango integration, call `getScriptsConfig()` and populate `manifest_snapshot` in `org_plugin_installations`. Currently seeded entries have empty `'[]'::jsonb` manifests.

## Chunk 7: UI Migration — PENDING

- [ ] **Task 27: Plugin Manager integration** — Plugin Manager UI handles Nango integrations (install/activate/per-tool toggle) same as regular plugins.
- [ ] **Task 28: Deprecate OAuth bindings panel** — Replace `assistant_oauth_bindings`-based admin UI with Plugin Manager.

---

## Verification — DONE

- [x] **Typecheck**: Both `worker/` and main app pass (no new errors)
- [x] **Worker tests**: 336 passing, 0 failures
- [x] **No stale imports**: Zero references to deleted `oauthBindings` plumbing
- [x] **Shared helper coverage**:
  - `grep -rn "slug\.replace.*nango-"` -> only inside `buildNangoBinding`
  - `grep -rn "nangoBinding\s*="` -> only 2 call sites, both using `buildNangoBinding()`
  - `grep -rn "row\.plugin_slug"` -> only inside `mapRpcRowToActivatedPlugin`
- [ ] **Manual test**: Connect Slack -> bind to assistant -> chat -> verify message appears

---

## Critical File Paths

| File | Role |
|------|------|
| `worker/src/agent/oauth-tools/nango-action-bridge.ts` | Nango execution with policy enforcement |
| `worker/src/agent/oauth-tools/types.ts` | `OAuthBinding` + `buildNangoBinding()` |
| `worker/src/agent/oauth-tools/tool-discovery.ts` | Install-time discovery via `getScriptsConfig()` |
| `worker/src/agent/oauth-tools/nango-client.ts` | Singleton SDK client |
| `worker/src/agent/plugin-types.ts` | Shared helpers: `mapRpcRowToActivatedPlugin()`, `mapWireToActivatedPlugin()` |
| `worker/src/agent/PluginBridge.ts` | Routes `transport:'nango'` to action bridge |
| `worker/src/agent/tool-surface/builder.ts` | Nango binding assembly in step 4 |
| `worker/src/agent/tool-surface/executor.ts` | 2-path dispatch (built-in -> plugin/nango) |
| `worker/src/agent/OpenClawAgent.ts` | Legacy path integration |
| `worker/src/routes/agentStream.ts` | Stream handler with shared helpers |
| `supabase/migrations/20260325300000_unify_nango_into_plugin_system.sql` | Unification migration |

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Unified plugin governance (not parallel path) | One system for all tool types. No duplicate governance. |
| Install-time discovery (not runtime) | Zero Nango API calls on hot chat path. Manifests snapshotted. |
| LEFT JOIN (not separate RPC) | 1 DB call instead of 2 per chat request. |
| `buildNangoBinding()` factory | Single source of truth for 2 call sites. No fragile `slug.replace`. |
| `mapRpcRowToActivatedPlugin()` | Eliminates 3 inline duplications of 15-line mapping. |
| `transport: 'nango'` in PluginBridge | Reuses existing dispatch, no separate executor path. |
| `triggerAction()` over raw proxy | SDK handles auth, retries, errors. Less code. |
| Nango policy in activation config | YAGNI — no dedicated columns, just JSONB in existing `config`. |
| Preserved `assistant_oauth_bindings` | Admin UI still uses it. Delete when Plugin Manager handles all. |
