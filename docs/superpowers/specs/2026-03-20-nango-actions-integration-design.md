# Nango Actions Integration: OAuth Tool Execution for AI Agents

> Current-state note
>
> This spec is still useful for historical design context, but parts of it are now superseded by the production manifest pipeline.
>
> Use these as the authoritative current references:
>
> - `docs/platform/plugins/tool-manifests.md`
> - `packages/plugin-policy/README.md`
>
> Important current-state updates:
>
> - OAuth/Nango tools now flow through the shared manifest-preparation layer
> - `oauth_action_catalog.parameter_schema` remains canonical for OAuth action schemas
> - `org_plugin_installations.manifest_snapshot` is a derived cache, not permanent schema truth
> - install/refresh-time manifests are normalized and validated before persistence
> - runtime boundaries re-prepare manifests and drop invalid tools instead of poisoning whole requests
> - the resulting manifest contract is deployment-agnostic (`shared`, `dedicated`, `BYO`) and engine-agnostic (`OpenClaw`, `Hermes`, future engines)

**Date**: 2026-03-20
**Last Updated**: 2026-03-25
**Status**: Implemented (unified into plugin 3-tier governance)
**Scope**: Bridge Nango OAuth tokens to worker tool execution via unified plugin dispatch

## 1. Problem Statement

LucidMerged has a complete OAuth layer (Layer 1): session tokens, webhook callbacks, connection persistence, ownership verification, usage stats, rate limiting. 135+ n8n credential types are mapped to Nango providers via `credential-mapping.ts`. But there's no bridge to Layer 2 — the worker's tool execution.

When the agent needs to "send a Slack message" or "append a row to Google Sheets" using a user's OAuth connection, there's no mechanism to do so. The gap:

- **Worker tools cannot use Nango OAuth tokens** — `BuiltInToolExecutor` and `PluginBridge` have no concept of OAuth connections
- **No credential injection** — No mechanism to inject OAuth tokens into agent tool calls
- **Resources route is UI-only** — `/api/oauth/[provider]/resources/[resource]` exists for dropdown population, not agent execution
- **135+ providers mapped but none callable** — `credential-mapping.ts` maps n8n nodes to Nango providers, but the agent can't execute operations on those providers

### Goal

Enable the AI agent to execute OAuth-authenticated operations on behalf of users. Multi-tenant safe. Minimal latency. Fits into the existing plugin 3-tier governance system (`plugin_catalog` -> `org_plugin_installations` -> `assistant_plugin_activations`) rather than creating a parallel runtime path.

### Core Principle

> "Nango owns auth + API translation. Lucid owns policy (bindings, rate limits, audit, confirmation gating)."

> "Discover at install, execute at runtime." — Tool manifests are snapshotted at install time. Zero Nango API calls on the hot chat path.

## 2. Key Design Decision: Unified Plugin Governance

### Original Design (Rejected)

The original design proposed a **parallel runtime path**:
- Separate `assistant_oauth_bindings` table for connection resolution
- Separate `oauth__` wire name prefix (triple-segment: `oauth__slack__send_message`)
- Separate executor path in `createUnifiedExecutor()` (3-path: built-in -> OAuth -> plugin)
- Runtime `discoverToolsBatch()` call on every chat request to discover tools from Nango API
- Separate `oauthBindings` plumbing through `AgentRunParams`, `StreamRequest`, `ProxyOpts`

### Implemented Design (Unified)

Nango integrations are **first-class entries in `plugin_catalog`** with `transport: 'nango'`. They flow through the same 3-tier governance as regular plugins:

```
plugin_catalog (transport: 'nango', kind: 'integration')
  -> org_plugin_installations (manifest_snapshot from Nango getScriptsConfig)
    -> assistant_plugin_activations (enabled_tools, config with nangoPolicy)
```

**Why unified?**

1. **No parallel governance** — One system for all tool types (embedded, remote-mcp, rest, nango)
2. **No runtime API calls** — Tool manifests snapshotted at install time, not discovered per-chat
3. **Fewer DB round-trips** — Single `get_assistant_active_plugins` RPC with LEFT JOIN on `org_integration_connections` returns `connection_id` and `connection_status`
4. **Reuses existing UI** — Plugin Manager handles install/activate/per-tool toggle for integrations too
5. **Reuses existing code** — `PluginBridge` dispatches Nango tools via `transport` field, no separate executor

## 3. Architecture

### 3.1 Tool Dispatch — Single Plugin Path

```
Agent LLM calls "nango_slack__send_message"
  |
  createUnifiedExecutor (tool-surface/executor.ts)
  |
  +-- 1. Built-in tool? -> BuiltInToolExecutor (existing, unchanged)
  |
  +-- 2. Plugin tool? (slug__tool wire name) -> PluginBridge
      |
      +-- transport: 'embedded' -> InMemoryTransport (first-party MCP)
      +-- transport: 'remote-mcp' -> MCPGate HTTP
      +-- transport: 'nango' -> executeNangoAction() (NEW)
      |   +-- Rate limit check (Redis/Upstash, in-memory fallback)
      |   +-- Confirmation gating (if action requires approval)
      |   +-- nango.triggerAction(integrationId, connectionId, actionName, args)
      |   +-- OTel span + audit event
      |   +-- Usage tracking (fire-and-forget RPC)
      |   +-- Return JSON result
      +-- transport: 'rest' -> REST endpoint
```

### 3.2 Wire Name Convention

Nango integrations use the **standard plugin wire name** convention — no special `oauth__` prefix:

```typescript
toWireToolName('nango-slack', 'send_message') -> 'nango_slack__send_message'
parseWireToolName('nango_slack__send_message') -> { pluginSlug: 'nango-slack', toolName: 'send_message' }
```

This reuses `toWireToolName`/`parseWireToolName` from `plugin-types.ts`.

### 3.3 Connection Resolution via LEFT JOIN

The `get_assistant_active_plugins` RPC was extended with a LEFT JOIN on `org_integration_connections`:

```sql
LEFT JOIN org_integration_connections conn
  ON conn.id = opi.active_connection_id
  AND conn.status = 'active'
```

This returns `connection_id` and `connection_status` alongside plugin data. No separate RPC needed.

### 3.4 Nango Binding Construction

`buildNangoBinding()` in `oauth-tools/types.ts` is the single source of truth for constructing `OAuthBinding` from plugin data. Used by both `builder.ts` (v2 path) and `OpenClawAgent.ts` (legacy path):

```typescript
if (p.transport === 'nango' && p.connectionId) {
  ctx.nangoBinding = buildNangoBinding({
    assistantId: input.assistant.id,
    pluginSlug: p.slug,
    connectionId: p.connectionId,
    authProvider: p.authProvider,
    config: p.nangoPolicy || (p.config as Record<string, unknown>),
  })
}
```

### 3.5 Nango Action Bridge

`nango-action-bridge.ts` wraps Nango's `triggerAction()` with Lucid's policy layer:

```
executeNangoAction(actionName, args, ctx)
  -> Rate limit check (getCallCount)
  -> Confirmation gating (requiresConfirmationActions)
  -> nango.triggerAction(integrationId, connectionId, actionName, args)
  -> OTel span (nango.action)
  -> Audit event (emitOAuthToolAudit)
  -> Usage tracking (increment_oauth_usage RPC)
```

### 3.6 PluginBridge Integration

`PluginBridge.executePluginTool()` checks `ctx.transport === 'nango'` and routes to `executeNangoAction()` instead of embedded MCP or MCPGate HTTP.

### 3.7 File Layout

```
worker/src/agent/
+-- oauth-tools/                  # Nango execution layer
|   +-- types.ts                  # OAuthBinding, NangoToolDefinition, buildNangoBinding()
|   +-- nango-client.ts           # Singleton Nango SDK client (@nangohq/node)
|   +-- tool-discovery.ts         # Dynamic discovery via getScriptsConfig() + cache
|   +-- connection-resolver.ts    # Binding -> connectionId resolution
|   +-- nango-action-bridge.ts    # executeNangoAction() via triggerAction() + policy
|   +-- rate-limiter.ts           # Redis/Upstash per-run rate limits
|   +-- audit.ts                  # Dual-write audit (DB + console)
|   +-- index.ts                  # Barrel exports
|   +-- __tests__/
|       +-- nango-action-bridge.test.ts
|       +-- tool-discovery.test.ts
+-- plugin-types.ts               # mapRpcRowToActivatedPlugin(), mapWireToActivatedPlugin()
+-- tool-surface/
|   +-- executor.ts               # 2-path dispatch (built-in -> plugin/nango)
|   +-- builder.ts                # Assembles Nango binding context in step 4
|   +-- ...
+-- PluginBridge.ts               # Routes transport:'nango' to nango-action-bridge
+-- OpenClawAgent.ts              # Legacy path also uses buildNangoBinding()
```

## 4. Security Model

### 4.1 Token Isolation
- Worker never sees raw OAuth tokens — only passes `NANGO_SECRET_KEY` + `connectionId`
- Nango SDK handles token injection inside `triggerAction()`
- Nango's `end_user` scoping provides second-layer isolation

### 4.2 Binding Enforcement
- `plugin_catalog` -> `org_plugin_installations` -> `assistant_plugin_activations` 3-tier governance
- `org_integration_connections` requires active connection with matching `active_connection_id`
- No active connection = `connectionId` is undefined = no `nangoBinding` constructed = agent can't use tool
- `enabled_tools TEXT[]` on `assistant_plugin_activations` allows per-action gating

### 4.3 Nango Policy (per-activation config)
- `requiresConfirmationActions` — actions requiring user approval before execution
- `maxCallsPerRun` — per-run rate limit (default 50)
- `allowedResources` — resource-level access control
- Stored as JSONB in `assistant_plugin_activations.config`, extracted as `nangoPolicy` on `ActivatedPlugin`

### 4.4 Rate Limiting
- Per-run limits via `maxCallsPerRun` (default 50)
- Distributed via Redis/Upstash, in-memory fallback
- Exceeded -> audit event with `status: 'denied'`, `errorCode: 'rate_limit_exceeded'`

### 4.5 Confirmation Gating
- `requiresConfirmationActions` array on `nangoPolicy`
- Matched actions return `{ gated: true }` instead of executing
- Audit event emitted with `status: 'gated'`

## 5. DB Changes

### 5.1 Migration: `20260325300000_unify_nango_into_plugin_system.sql`

- Added `'nango'` to `plugin_catalog.transport` CHECK constraint
- Extended `get_assistant_active_plugins` RPC with LEFT JOIN on `org_integration_connections`
- Returns `connection_id TEXT` and `connection_status TEXT` columns
- Seeded 6 Nango provider entries in `plugin_catalog`:
  - `nango-slack`, `nango-google-sheets`, `nango-notion`
  - `nango-google-calendar`, `nango-hubspot`, `nango-github`
- All seeded with `kind: 'integration'`, `transport: 'nango'`, `trust_level: 'verified'`, `execution_mode: 'in_process'`

### 5.2 Existing Tables (Not Deleted)

`assistant_oauth_bindings` table and its admin API routes are preserved for UI/admin binding management. Only the **runtime path** is unified into the plugin system.

## 6. Shared Helpers (Reusability)

Three shared helpers eliminate all code duplication:

| Helper | File | Used By |
|--------|------|---------|
| `buildNangoBinding()` | `oauth-tools/types.ts` | `builder.ts`, `OpenClawAgent.ts` |
| `mapRpcRowToActivatedPlugin()` | `plugin-types.ts` | `agentStream.ts`, `inbound.ts` |
| `mapWireToActivatedPlugin()` | `plugin-types.ts` | `agentStream.ts` |

All fragile `slug.replace('nango-', '')` patterns consolidated inside `buildNangoBinding()`.

## 7. What Changes in Existing Code

### Files modified

| File | Change | Impact |
|------|--------|--------|
| `worker/src/config.ts` | Added `NANGO_SECRET_KEY`, `NANGO_HOST` env vars | Low — optional |
| `worker/src/agent/plugin-types.ts` | Added `nangoPolicy`, `mapRpcRowToActivatedPlugin()`, `mapWireToActivatedPlugin()` | Medium — shared helpers |
| `worker/src/agent/tool-surface/builder.ts` | Nango binding in step 4 via `buildNangoBinding()` | Low — additive |
| `worker/src/agent/tool-surface/executor.ts` | Comment update only (2-path, not 3-path) | None |
| `worker/src/agent/PluginBridge.ts` | Added `transport: 'nango'` routing to `executeNangoAction()` | Medium |
| `worker/src/agent/OpenClawAgent.ts` | Replaced inline discovery with `buildNangoBinding()` loop | Low |
| `worker/src/routes/agentStream.ts` | Replaced inline mapping with shared helpers | Low |
| `worker/src/processors/inbound.ts` | Replaced inline mapping with `mapRpcRowToActivatedPlugin()` | Low |
| `src/lib/ai/worker-proxy.ts` | Added `connectionId` to `PluginPayload` | Low |
| `src/app/api/ai/chat/route.ts` | Removed separate OAuth binding fetch | Simplified |
| `src/app/api/assistants/[id]/chat/route.ts` | Removed separate OAuth binding fetch | Simplified |
| `contracts/plugin.ts` | Added `'nango'` to transport enums | Low |

### Files removed from runtime path

| Concern | Before (parallel) | After (unified) |
|---------|-------------------|-----------------|
| `oauthBindings` on `AgentRunParams` | Separate field | Removed — flows through `plugins` |
| `oauthBindings` on `StreamRequest` | Separate field | Removed |
| `oauthBindings` on `ProxyOpts` | Separate field + transformer | Removed |
| `oauthBindings` on `RunTurnInput` | Separate field | Removed |
| `get_assistant_oauth_bindings` RPC (runtime) | Separate DB call | LEFT JOIN in existing RPC |
| `discoverToolsBatch` at chat time | Nango API call per request | Install-time snapshot |

## 8. Layer Separation

| Concern | Layer 1 (src/) | Layer 2 (worker/) |
|---------|---------------|-------------------|
| OAuth flow initiation | `src/lib/oauth/nango-fetch.ts` | -- |
| Session tokens | `src/app/api/oauth/session/` | -- |
| Connection management | `src/lib/oauth/providers/nango-adapter.ts` | -- |
| DB connection mirror | `src/lib/oauth/db.ts` | -- |
| Webhooks | `src/app/api/oauth/webhooks/` | -- |
| Nango SDK client | -- | `oauth-tools/nango-client.ts` |
| Tool discovery (install) | -- | `oauth-tools/tool-discovery.ts` |
| Tool execution (runtime) | -- | `oauth-tools/nango-action-bridge.ts` |
| Rate limiting | -- | `oauth-tools/rate-limiter.ts` |
| Audit | -- | `oauth-tools/audit.ts` |
| Binding construction | -- | `oauth-tools/types.ts` (`buildNangoBinding`) |

## 9. Success Criteria

- [x] Nango integrations flow through `plugin_catalog` 3-tier governance
- [x] Single RPC with LEFT JOIN (no separate `get_assistant_oauth_bindings` at runtime)
- [x] Zero Nango API calls on the hot chat path
- [x] `buildNangoBinding()` single source of truth (2 call sites)
- [x] `mapRpcRowToActivatedPlugin()` / `mapWireToActivatedPlugin()` eliminate duplication
- [x] Rate limiting (distributed Redis + in-memory fallback)
- [x] Confirmation gating for dangerous actions
- [x] Audit trail for every call (success, error, gated, denied)
- [x] `npm run typecheck` passes (no new errors)
- [x] 336 worker tests passing, 0 failures
- [ ] Manifest snapshot population (install-time `getScriptsConfig()` -> `manifest_snapshot`)
- [ ] End-to-end manual test with real Slack workspace

## 10. Pending Work

1. **Manifest snapshot population**: Seeded `plugin_catalog` entries have empty tool manifests (`'[]'::jsonb`). Need an install-time flow that calls Nango `getScriptsConfig()` and populates `manifest_snapshot` in `org_plugin_installations`.

2. **UI migration**: Admin UI still uses `assistant_oauth_bindings` for binding management. Should migrate to Plugin Manager UI for integration configuration.

3. **Catalog expansion**: Currently 6 providers seeded. Add more via `INSERT INTO plugin_catalog` with Nango-discovered manifests.
