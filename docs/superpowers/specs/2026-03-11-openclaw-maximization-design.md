# OpenClaw Maximization: Gateway Switchability Contract

**Date**: 2026-03-11
**Status**: Design — spec review passed (3 iterations), awaiting user review
**Scope**: A-lite (lock the seams) + B (fill behavior behind seams)

## 1. Problem Statement

LucidMerged uses OpenClaw's `runEmbeddedPiAgent` as the agent runtime, but has built a parallel tool/plugin infrastructure that duplicates ~60% of what OpenClaw provides natively. This creates:

- **Security gap**: OpenClaw's native tools (exec, browser, etc.) are exposed alongside Lucid clientTools with no unified enforcement
- **Maintenance burden**: Lucid reimplements scheduling, messaging, subagents instead of using OpenClaw's maintained implementations
- **Gateway lock-out**: Switching to OpenClaw gateway later would require rewriting tool registration, execution, and naming
- **Hook/lifecycle gap**: OpenClaw's 24 plugin hooks are unused — no interception, auditing, or tool call modification

### Goal

Use OpenClaw as much as possible while keeping SaaS control-plane primitives (multi-tenancy, billing, encryption, secrets, observability). Stop reinventing the wheel. Make gateway switching a config flip, not a rewrite.

### Core Principle

> "Borrow domain/runtime logic. Own platform/control-plane primitives."

Refined: OpenClaw owns **runtime mechanics** (agent loop, tool streaming, hooks, policy filtering). Lucid owns **SaaS mechanics** (tenancy, billing, encryption, secrets, observability, channel delivery).

## 2. Key Findings (Evidence-Based)

### 2.1 `tools.deny` does NOT filter clientTools

**Proven from source**: `createOpenClawCodingTools()` creates native tools → `applyToolPolicyPipeline()` filters them via `tools.allow`/`tools.deny` → result becomes `toolsRaw`. Separately, `clientTools` are converted to `clientToolDefs` and appended AFTER policy filtering (attempt.ts:1160-1177).

**Implication**: We can safely use `tools.deny` to block dangerous native tools without affecting any Lucid clientTools (built-in or plugin).

**Source**: `packages/openclaw-core/src/agents/pi-embedded-runner/run/attempt.ts` lines 844-1177

### 2.2 Duplicate tool names are NOT guarded for clientTools

OpenClaw guards plugin-vs-native collisions (`resolvePluginTools()` blocks duplicates with error log). But clientTools are appended without any name collision check against native tools.

**Implication**: If a clientTool has the same name as a native tool, both exist in the tool list. LLM API behavior with duplicate function names is undefined. **We must enforce collision guards ourselves.**

**Source**: `packages/openclaw-core/src/plugins/tools.ts` lines 76-135; `attempt.ts` line 1177

### 2.3 Hooks fire in embedded mode (subset)

`wrapToolWithBeforeToolCallHook()` wraps every tool in embedded mode (pi-tools.ts:556-563). Of OpenClaw's 24 plugin hooks, ~20 fire in embedded mode. Two (`gateway_start`, `gateway_stop`) are gateway-only, and 2+ (`session_start`, `session_end`) may not fire in embedded runner's session management flow. **Treat OpenClaw hooks as bonus observability; Lucid remains the enforcement boundary.**

**Source**: `packages/openclaw-core/src/agents/pi-tools.ts` lines 556-563; `packages/openclaw-core/src/plugins/types.ts` PLUGIN_HOOK_NAMES

### 2.4 Current state: `tools.allow` already used

`OpenClawAgent.ts:338` passes `tools: { allow: ['web_search', 'web_fetch', 'image', 'pdf'] }`. This works correctly (core tool entries are not stripped by `stripPluginOnlyAllowlist`). But `tools.deny` is more robust — new safe native tools added upstream won't be accidentally blocked.

**Source**: `worker/src/agent/OpenClawAgent.ts` lines 119, 336-345

## 3. Architecture

### 3.1 Runtime Seam — `AgentRuntime` Interface

One interface, two implementations. The rest of the worker never calls OpenClaw directly.

```
worker/src/agent/runtime/
├── types.ts              # AgentRuntime, RunTurnInput, RunTurnOutput
├── events.ts             # RuntimeEventEmitter contract
├── embedded.ts           # EmbeddedRuntime (wraps runEmbeddedPiAgent)
├── gateway.ts            # GatewayRuntime (placeholder — throws "not enabled")
└── index.ts              # Factory: getRuntime(mode) → AgentRuntime
```

#### Interface

```typescript
// worker/src/agent/runtime/types.ts

export interface AgentRuntime {
  runTurn(input: RunTurnInput): Promise<RunTurnOutput>
}

export interface RunTurnInput {
  // Identity (always present)
  orgId: string
  assistantId: string
  conversationId: string
  runId: string
  sessionKey?: string        // optional in embedded, required for gateway

  // Agent config
  assistant: AssistantConfig
  plugins: ActivatedPlugin[]
  budget: RunBudget

  // Message
  userMessage: string
  messages: Array<{ role: string; content: string }>
  memories: string[]
  images?: Array<{ data: string; mimeType: string }>

  // Streaming — both implement ChannelOutput interface
  output?: ChannelOutput      // channel delivery (Telegram, Discord, etc.)

  // Dependencies
  supabase?: SupabaseClient
  userId?: string
  channelId?: string
  subagentDepth?: number

  // Embedded-mode only (not part of AgentRuntime contract)
  embeddedConfig?: {
    llmConfig: { baseUrl: string; apiKey: string }
  }

  // Control
  abortSignal?: AbortSignal
}

export interface RunTurnOutput {
  text: string
  toolCallsUsed: number
  meta: {
    durationMs: number
    model?: string
    usage?: { input?: number; output?: number; total?: number }
    stopReason?: string
    error?: { kind: string; message: string }
  }
  eventsToEmit?: Array<{ type: string; payload: Record<string, unknown> }>
}
```

**Design note**: `embeddedConfig` is intentionally separated from the main interface. `EmbeddedRuntime` reads it; `GatewayRuntime` ignores it. Gateway mode has its own LLM config on the gateway server — the caller does not pass credentials.

#### What moves where

| Current | Becomes |
|---------|---------|
| `OpenClawAgent.ts` body (~467 lines) | `EmbeddedRuntime.runTurn()` |
| `runOpenClawAgent()` export | Thin facade: delegates to `getRuntime(mode).runTurn()` |
| `subagent.ts` → `runEmbeddedPiAgent()` | `runtime.runTurn()` (receives runtime via context — see Section 3.7) |

#### Callers that DON'T change

- `agentStream.ts` — already calls `runOpenClawAgent()`
- `inbound.ts` — already calls `runOpenClawAgent()`
- `index.ts` (scheduled tasks) — already calls `runOpenClawAgent()`

### 3.2 Tool Surface Builder

Single function that produces the allowed tools for any run, regardless of runtime mode.

```
worker/src/agent/tool-surface/
├── types.ts              # ToolSurface interface
├── builder.ts            # buildToolSurface()
├── native-deny.ts        # NATIVE_DENY sets + buildOpenClawToolPolicy()
├── native-catalog.ts     # KNOWN_NATIVE_TOOLS + resolveEffectiveNativeTools()
├── executor.ts           # Unified 3-path dispatcher (native-allowed + built-in + plugin)
├── collision-guard.ts    # assertNoCollisions() + assertUniqueClientToolNames()
└── compat-names.ts       # Tool name constants
```

#### Interface

```typescript
// worker/src/agent/tool-surface/types.ts

export interface ToolSurface {
  // What the LLM sees (Lucid-owned tool schemas only — native tools come from OpenClaw)
  clientTools: ClientToolDefinition[]
  // What executes Lucid tool calls
  executor: (toolName: string, params: Record<string, unknown>) => Promise<string>
  // Lucid tool allowlist (for auditing)
  allowlist: Set<string>
  // OpenClaw config with tools.deny (for native tool filtering)
  openclawToolPolicy: { deny: string[] }
  // Metadata for auditing/billing/gating
  toolMeta: Map<string, {
    owner: 'lucid' | 'openclaw'
    dangerLevel: 'safe' | 'elevated' | 'dangerous'
    ownerOnly?: boolean
  }>
}
```

**`owner` semantics**: `owner` indicates **execution ownership** — who runs the tool code. `'openclaw'` means OpenClaw's native executor handles it. `'lucid'` means Lucid's executor handles it. **Billing ownership is always Lucid** regardless of `owner` — Lucid meters every tool call via `RuntimeEventEmitter.onToolCallEnd()`.

#### Key design decisions

1. **Lucid executor always used for Lucid-owned tools; Lucid always meters all tools** — OpenClaw-owned native tools (`web_search`, `web_fetch`, `image`, `pdf`) execute inside OpenClaw's runner, but Lucid meters them via `RuntimeEventEmitter.onToolCallEnd()`. Lucid-owned tools (built-in, plugin, platform) always go through Lucid's executor — even in gateway mode, where the gateway calls back via Tool RPC.

2. **`owner: 'lucid' | 'openclaw'`** makes execution ownership explicit:
   - Embedded: everything is `lucid` except native tools that pass deny filtering (`openclaw`)
   - Gateway: runtime primitives (cron/sessions) can flip to `openclaw` if gateway emits metering back to Lucid

3. **Collision guards are mandatory** (non-negotiable):

```typescript
// worker/src/agent/tool-surface/collision-guard.ts

import { captureMessage } from '../../monitoring/sentry.js'

/**
 * Returns the set of colliding tool names (empty if none).
 * In softFail mode, logs a fatal alert and returns collisions for the caller to remove.
 * In hard mode, throws.
 */
export function assertNoCollisions(
  nativeEffectiveNames: Set<string>,  // after OpenClaw policy filtering
  clientTools: ClientToolDefinition[],
  options?: { softFail?: boolean },
): ClientToolDefinition[] {
  const clientToolNames = new Set(clientTools.map(t => t.function.name))
  const collisions = [...clientToolNames].filter(n => nativeEffectiveNames.has(n))
  if (collisions.length === 0) return clientTools

  const msg =
    `SECURITY: tool name collision between native and clientTools: ${collisions.join(', ')}. ` +
    `Check NATIVE_DENY list covers these native tools, or rename the conflicting clientTools.`

  captureMessage(msg, 'fatal', { subsystem: 'tool-surface' })

  if (options?.softFail) {
    // In production: remove colliding clientTools, alert, continue serving.
    console.error(`[tool-surface] ${msg} — removing colliding clientTools as safety fallback`)
    const collisionSet = new Set(collisions)
    return clientTools.filter(t => !collisionSet.has(t.function.name))
  }

  throw new Error(msg)
}

export function assertUniqueClientToolNames(
  tools: ClientToolDefinition[],
  context: 'builtin' | 'plugin' | 'merged',
): void {
  const seen = new Set<string>()
  for (const t of tools) {
    const name = t.function.name
    if (seen.has(name)) {
      throw new Error(
        `Duplicate clientTool name in ${context} set: ${name}. ` +
        (context === 'plugin'
          ? 'Reject the plugin tool or rename it in plugin configuration.'
          : 'Check built-in tool registration for duplicates.')
      )
    }
    seen.add(name)
  }
}
```

**Error recovery**: In production (`NODE_ENV=production`), `assertNoCollisions()` uses `softFail: true` — it logs a fatal-level alert to Sentry via `captureMessage()`, removes colliding clientTools from the returned array, and continues the agent run. In development/test, it throws hard. This prevents a single OpenClaw subtree update from taking down all tenants while still guaranteeing we detect and alert on collisions. The caller uses the returned (possibly filtered) array as the final clientTools list.

### 3.3 Native Tool Deny Policy

Switch from `tools.allow` to `tools.deny`. Categorized for clarity.

```typescript
// worker/src/agent/tool-surface/native-deny.ts

/** Dangerous: OS/browser/filesystem access */
const DANGER_DENY = [
  'exec', 'process', 'apply_patch',
  'read', 'write', 'edit',
  'browser',
] as const

/** Tenancy-unsafe: assumes local filesystem, shared workspace state */
const TENANCY_DENY = [
  'memory_search', 'memory_get',  // Use Lucid DB memory (RLS + encrypted)
                                   // NOTE: These are injected via plugin runtime, not createOpenClawCodingTools().
                                   // Verify tools.deny reaches plugin-runtime tools at implementation time.
                                   // If not, add explicit filtering in buildToolSurface().
  'canvas',                        // Gateway-coupled UI model
  'nodes',                         // Device-specific (camera, location)
  'tts',                           // Add as Lucid tool with vendor integration later
] as const

/** Replaced by Lucid: we provide SaaS-safe equivalents */
const REPLACED_BY_LUCID_DENY = [
  'cron',                          // → cron_schedule/list/cancel (Lucid DB outbox, see §3.4)
  'message',                       // → sessions_send (synthetic inbound)
  'sessions_send',                 // → sessions_send (Lucid impl)
  'sessions_spawn',                // → sessions_spawn (Lucid impl)
  'sessions_list',                 // Gateway state
  'sessions_history',              // Gateway state
  'subagents',                     // Gateway state
  'session_status',                // Gateway state
  'agents_list',                   // Gateway state
  'gateway',                       // Gateway-only
] as const

/** Combined deny list for embedded mode */
export const NATIVE_DENY = [
  ...DANGER_DENY,
  ...TENANCY_DENY,
  ...REPLACED_BY_LUCID_DENY,
] as const

/** What survives: web_search, web_fetch, image, pdf — full native AgentTool behavior */

/**
 * Emergency deny override: append extra tool names via env/config
 * without code changes. Use to hot-block a newly introduced upstream
 * tool before the next subtree pull updates NATIVE_DENY.
 *
 * Example: OPENCLAW_NATIVE_DENY_EXTRA=new_risky_tool,another_tool
 */
function getExtraDeny(): string[] {
  const extra = process.env.OPENCLAW_NATIVE_DENY_EXTRA
  return extra ? extra.split(',').map(s => s.trim()).filter(Boolean) : []
}

export function buildOpenClawToolPolicy() {
  return {
    tools: {
      deny: [...NATIVE_DENY, ...getExtraDeny()],
    },
  }
}
```

### 3.4 Compatibility Tool Names

Lucid tools get stable names that align with OpenClaw concepts. Lock as the LLM contract.

**Important**: The cron names are Lucid-invented. OpenClaw's native `cron` tool is a single multiplexed tool with an `action` parameter (`add`, `list`, `remove`, `update`, `run`, `status`, `runs`, `wake`). Lucid decomposes this into three separate tools for clarity and SaaS safety. These are NOT direct name-for-name replacements — they're Lucid tools inspired by the OpenClaw cron domain.

| Current Name | Stable Name | Rationale |
|---|---|---|
| `schedule_task` | `cron_schedule` | Lucid-invented. Maps to OpenClaw `cron` action=`add` semantics, but uses DB outbox pattern |
| `list_scheduled_tasks` | `cron_list` | Lucid-invented. Maps to OpenClaw `cron` action=`list` semantics |
| `cancel_scheduled_task` | `cron_cancel` | Lucid-invented. Maps to OpenClaw `cron` action=`remove` semantics |
| `send_message_to_agent` | `sessions_send` | Upstream name (denied native, Lucid clientTool replacement) |
| `spawn_subagent` | `sessions_spawn` | Upstream name (denied native, Lucid clientTool replacement) |

**Safety**: native versions are denied first (Section 3.3), then Lucid registers clientTools. Collision guard (Section 3.2) validates no overlap after policy filtering. The `cron_*` names don't collide because the native tool is named `cron` (singular), not `cron_schedule`/`cron_list`/`cron_cancel`.

**Session/conversation history**: Tool schemas are per-request. Old tool names in existing conversation history do not cause runtime errors — the LLM simply sees the new tool names on subsequent turns. OpenClaw session files (stored at `SESSION_BASE`) have a 24h TTL cleanup. On deploy, old sessions expire naturally. No migration needed — this is a conscious decision, not an accident.

#### Gateway mode switch rules

| Tool | Embedded Mode | Gateway Mode | Notes |
|---|---|---|---|
| `cron_schedule/list/cancel` | Lucid impl (DB outbox) | **Not a simple deny flip.** Native `cron` is a single multiplexed tool with different params. Gateway switch requires: (1) remove 3 Lucid clientTools, (2) un-deny native `cron`, (3) map Lucid's stored tasks to gateway cron format. | Cron gateway migration is a separate design task |
| `sessions_send` | Lucid impl (synthetic inbound) | Remove from clientTools, un-deny native `sessions_send` | Direct name match — clean flip |
| `sessions_spawn` | Lucid impl (recursive runTurn) | Remove from clientTools, un-deny native `sessions_spawn` | Direct name match — clean flip |
| `wallet_transfer`, `dex_swap`, etc. | Lucid impl (always) | Lucid impl via Tool RPC (always) | Never delegated to gateway |

### 3.5 Native Tool Catalog (Collision Guard Input)

The collision guard needs to know which native tools survived deny-filtering. Lucid does NOT have direct access to the post-filtering native tool list — `createOpenClawCodingTools()` runs inside `runEmbeddedPiAgent` and its output is never returned to the caller.

**Strategy**: Maintain a hardcoded `KNOWN_NATIVE_TOOLS` set, updated on each OpenClaw subtree pull.

```typescript
// worker/src/agent/tool-surface/native-catalog.ts

/**
 * All native tools created by createOpenClawCodingTools() in pi-tools.ts
 * and createOpenClawTools() in openclaw-tools.ts.
 * MUST be updated when pulling new OpenClaw subtree versions.
 *
 * Sources:
 *   - pi-tools.ts createOpenClawCodingTools() (coding tools base set + exec/process/apply_patch)
 *   - openclaw-tools.ts createOpenClawTools() lines 124-194
 * Last synced: 2026-03-11
 *
 * NOTE: Channel-specific tools (e.g., whatsapp_login) are dynamic and
 * listed in KNOWN_DYNAMIC_NATIVE_TOOLS separately.
 */
export const KNOWN_NATIVE_TOOLS = new Set([
  // From coding tools base set (pi-tools.ts)
  'read', 'write', 'edit',
  'exec', 'process',          // replace bash in createOpenClawCodingTools
  'apply_patch',               // conditionally added

  // From createOpenClawTools (openclaw-tools.ts)
  'browser',
  'canvas',
  'nodes',
  'cron',
  'message',
  'tts',
  'gateway',
  'agents_list',
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  'subagents',
  'session_status',
  'web_search',
  'web_fetch',
  'image',
  'pdf',
] as const)

/** Dynamic native tools that depend on agent channel config */
export const KNOWN_DYNAMIC_NATIVE_TOOLS = new Set([
  'whatsapp_login',  // channel-specific, owner-only
] as const)

/**
 * Computes the effective native tools after deny filtering.
 * This is the set the collision guard checks clientTools against.
 * Includes both static and dynamic native tools.
 */
export function resolveEffectiveNativeTools(
  denyList: readonly string[],
  dynamicTools?: Set<string>,
): Set<string> {
  const allNative = new Set([
    ...KNOWN_NATIVE_TOOLS,
    ...KNOWN_DYNAMIC_NATIVE_TOOLS,
    ...(dynamicTools ?? []),
  ])
  const denySet = new Set(denyList)
  return new Set([...allNative].filter(t => !denySet.has(t)))
}
```

**Risk**: If OpenClaw adds a new native tool upstream and we don't update `KNOWN_NATIVE_TOOLS`, the collision guard won't catch a collision with that new tool. Mitigation: (1) the subtree pull checklist includes updating this file, (2) the `softFail` mode in production means even an undetected collision degrades gracefully rather than crashing, (3) the catalog test (Section 9) will fail if the sets diverge.

### 3.6 Hook/Event Contract

Both runtimes must emit the same lifecycle events. Emit from Lucid choke points, not gateway webhooks.

```typescript
// worker/src/agent/runtime/events.ts

export interface RuntimeEventEmitter {
  onRunStart(ctx: { runId: string; assistantId: string; orgId: string; model: string }): void
  onRunEnd(ctx: {
    runId: string; durationMs: number; toolCallsUsed: number;
    usage?: { input?: number; output?: number; total?: number }
  }): void
  onRunError(ctx: { runId: string; error: Error; phase: string }): void

  onToolCallStart(ctx: { runId: string; toolName: string; toolCallId: string; owner: 'lucid' | 'openclaw' }): void
  onToolCallEnd(ctx: {
    runId: string; toolName: string; toolCallId: string;
    durationMs: number; isError: boolean; owner: 'lucid' | 'openclaw'
  }): void

  onModelCallStart(ctx: { runId: string; model: string; turnIndex: number }): void
  onModelCallEnd(ctx: { runId: string; turnIndex: number; usage?: { input?: number; output?: number } }): void
}
```

**Emission points** (what we control):
- Tool executor (`buildToolSurface().executor`) — emits `onToolCallStart/End` for Lucid tools
- `onAgentEvent` callback from OpenClaw — emits `onToolCallStart/End` for native tools
- `onPartialReply` / run timing — emits `onRunStart/End`, `onModelCallStart/End`

**Consumers** (already exist, just need wiring):
- OTel spans (`worker/src/observability/tracing.ts`)
- Billing metering (tool call counting, model usage)
- Receipts/proofs pipeline

**Design rule**: OpenClaw plugin hooks (`before_tool_call`, etc.) are bonus observability. Lucid-side enforcement is the security/billing boundary. If OpenClaw hooks don't fire in some edge case (e.g., `gateway_start`/`gateway_stop` are gateway-only, `session_start`/`session_end` may not fire in embedded runner), nothing breaks.

### 3.7 Subagent Runtime Injection

The subagent tool currently imports `runEmbeddedPiAgent` directly from `@lucid/openclaw-runtime`. This must be replaced with a runtime reference so subagents go through the same `AgentRuntime` seam.

**Pattern**: Inject the runtime factory into `SubagentContext`.

```typescript
// Updated SubagentContext (in runtime-tools/subagent.ts)

export interface SubagentContext {
  parentRunId: string
  depth: number
  childrenSpawned: number
  sessionFile: string
  workspaceDir: string
  provider: string
  model: string
  config: Record<string, unknown>
  temperature: number
  maxOutputTokens: number
  extraSystemPrompt?: string
  abortSignal?: AbortSignal
  clientTools?: ClientToolDefinition[]
  clientToolExecutor?: (toolName: string, params: Record<string, unknown>) => Promise<string>

  // NEW: runtime injection — replaces direct runEmbeddedPiAgent import
  runTurn: (input: RunTurnInput) => Promise<RunTurnOutput>
}
```

The `runTurn` function is bound at tool registration time in `buildToolSurface()`:

```typescript
// In tool-surface/builder.ts (conceptual)

const subagentCtx: SubagentContext = {
  ...existingCtx,
  runTurn: (input) => getRuntime(mode).runTurn(input),
}
```

This removes the `@lucid/openclaw-runtime` import from `subagent.ts`. The subagent tool calls `ctx.runTurn()` which goes through the runtime seam — embedded today, gateway later.

### 3.8 Folder Layout

```
worker/src/agent/
├── runtime/
│   ├── types.ts              # AgentRuntime, RunTurnInput, RunTurnOutput
│   ├── events.ts             # RuntimeEventEmitter contract
│   ├── embedded.ts           # EmbeddedRuntime (wraps runEmbeddedPiAgent)
│   ├── gateway.ts            # GatewayRuntime (placeholder)
│   └── index.ts              # Factory: getRuntime(mode) → AgentRuntime
├── tool-surface/
│   ├── types.ts              # ToolSurface interface
│   ├── builder.ts            # buildToolSurface()
│   ├── native-deny.ts        # NATIVE_DENY + buildOpenClawToolPolicy()
│   ├── native-catalog.ts     # KNOWN_NATIVE_TOOLS + resolveEffectiveNativeTools()
│   ├── executor.ts           # Unified 3-path dispatcher
│   ├── collision-guard.ts    # assertNoCollisions + assertUniqueClientToolNames
│   └── compat-names.ts       # Stable tool name constants
├── runtime-tools/            # Lucid implementations (renamed)
│   ├── scheduler.ts          # cron_schedule, cron_list, cron_cancel
│   ├── messaging.ts          # sessions_send
│   └── subagent.ts           # sessions_spawn (runtime injected via ctx.runTurn)
├── platform-tools/           # Unchanged
├── tools/                    # Legacy, unchanged
├── BuiltInToolExecutor.ts    # Unchanged, used by executor.ts
├── PluginBridge.ts           # Unchanged, used by executor.ts
├── CommandsAllowlist.ts      # Simplified — delegates to tool-surface/builder.ts
└── OpenClawAgent.ts          # Thin facade → getRuntime().runTurn()
```

## 4. Non-Negotiable Invariants

These must hold across all runtime modes and all code paths:

1. **`tools.deny` applied** — OpenClaw config always includes the categorized deny list. No native tool outside the safe set reaches the LLM.

2. **`assertNoCollisions()`** — After computing effective native tools (via `resolveEffectiveNativeTools()`), before passing clientTools to `runEmbeddedPiAgent`, validate no name overlap. Returns filtered clientTools array. Production uses `softFail: true` (log fatal to Sentry + return array with colliding tools removed). Dev/test throws hard.

3. **`assertUniqueClientToolNames()`** — No duplicate names among Lucid built-in tools + plugin tools. Context-aware error messages distinguish built-in vs plugin collisions.

4. **Lucid executor for Lucid-owned tools; metering for all tools** — `wallet_transfer`, `dex_swap`, `hl_*`, all plugin tools, all tools that touch billing/secrets/receipts always execute through Lucid's executor (even in gateway mode via Tool RPC). OpenClaw-owned native tools execute inside OpenClaw, but Lucid meters them via the event contract.

5. **Events emitted from Lucid choke points** — `onToolCallStart/End`, `onRunStart/End` emitted by our code, not dependent on OpenClaw hooks existing or firing.

6. **`owner` field in toolMeta** — Every tool has explicit `owner: 'lucid' | 'openclaw'`. This is execution ownership. Billing ownership is always Lucid.

7. **`KNOWN_NATIVE_TOOLS` updated on subtree pull** — Part of the subtree pull checklist. Stale catalog means collision guard is best-effort (safe in production via `softFail`).

8. **`OPENCLAW_NATIVE_DENY_EXTRA` as ops escape hatch** — Allows hot-blocking a newly introduced upstream tool via env var without code changes. Appended to `NATIVE_DENY` at runtime.

## 5. What Changes in Existing Code

### Files that change significantly

| File | Change |
|------|--------|
| `OpenClawAgent.ts` | Shrinks to thin facade. Core logic moves to `runtime/embedded.ts` and `tool-surface/builder.ts` |
| `CommandsAllowlist.ts` | Simplified. Tool schemas + DANGER_TOOLS logic moves to `tool-surface/` |

### Files that get renamed tool names

| File | Old Names | New Names |
|------|-----------|-----------|
| `runtime-tools/scheduler.ts` | `schedule_task`, `list_scheduled_tasks`, `cancel_scheduled_task` | `cron_schedule`, `cron_list`, `cron_cancel` |
| `runtime-tools/messaging.ts` | `send_message_to_agent` | `sessions_send` |
| `runtime-tools/subagent.ts` | `spawn_subagent` | `sessions_spawn` |

### New files

| File | Purpose |
|------|---------|
| `runtime/types.ts` | AgentRuntime interface + input/output types |
| `runtime/events.ts` | RuntimeEventEmitter contract |
| `runtime/embedded.ts` | EmbeddedRuntime implementation |
| `runtime/gateway.ts` | GatewayRuntime placeholder |
| `runtime/index.ts` | Runtime factory |
| `tool-surface/types.ts` | ToolSurface interface |
| `tool-surface/builder.ts` | buildToolSurface() |
| `tool-surface/native-deny.ts` | Deny policy with categories |
| `tool-surface/native-catalog.ts` | Known native tools + effective set resolver |
| `tool-surface/executor.ts` | 3-path dispatcher |
| `tool-surface/collision-guard.ts` | Collision checks with production soft-fail |
| `tool-surface/compat-names.ts` | Stable name constants |

### Files that DON'T change

- `BuiltInToolExecutor.ts` — dispatch logic stays, used by new `executor.ts`
- `PluginBridge.ts` — plugin execution stays, used by new `executor.ts`
- `platform-tools/*` — trading tool implementations unchanged
- `tools/*` — legacy tool implementations unchanged
- All callers (`agentStream.ts`, `inbound.ts`, `index.ts`) — still call `runOpenClawAgent()`

## 6. Gateway Switchability

When ready to add gateway support:

1. **Implement `GatewayRuntime.runTurn()`** — calls pooled OpenClaw gateway over HTTP/WS
2. **Implement "Tool RPC"** — gateway calls back to Lucid for `lucid`-owned tool execution
3. **Flip deny list for `sessions_send` and `sessions_spawn`** — un-deny natives, remove Lucid clientTool replacements (direct name matches — clean flip)
4. **Cron migration is separate** — native `cron` is a single multiplexed tool (action param: add/list/remove/etc.). Switching from 3 Lucid tools to 1 native tool requires param mapping and stored task migration. Design separately.
5. **Add `runtime_mode` flag** per assistant (`embedded` | `gateway`)
6. **No caller changes. No tool schema changes (except cron). No UX changes.**

The gateway migration for sessions_send/sessions_spawn is:
- Add one new file (`runtime/gateway.ts`)
- Change deny config per assistant
- Deploy gateway pool
- Flip flag

The cron gateway migration requires its own design doc.

## 7. What This Does NOT Cover

- **TypeBox migration**: Converting tool schemas from OpenAI JSON Schema to TypeBox. Deferred — current approach works, TypeBox is a nice-to-have for schema reuse.
- **OpenClaw plugin lifecycle adoption**: Using `OpenClawPluginDefinition.register()/activate()` for Lucid tools. Deferred — clientTools approach is functional and gateway-switchable.
- **OpenClaw `SkillSnapshot`**: Not passed today. Can be added when workspace-level skills become a product feature.
- **Full hook pipeline**: Implementing all 24 OpenClaw plugin hook types in Lucid. Deferred — we emit events from Lucid choke points, which covers billing/observability needs.
- **Cron gateway migration**: The native `cron` tool has different semantics (multiplexed vs decomposed). Requires separate design (tracked as `docs/superpowers/specs/cron-gateway-migration-design.md` when needed).

These are future alignment opportunities, not blockers.

## 8. Success Criteria

- [ ] `runOpenClawAgent()` delegates to `EmbeddedRuntime.runTurn()` via `getRuntime()`
- [ ] `buildToolSurface()` produces unified tool surface with collision guards
- [ ] `tools.deny` config blocks all dangerous/tenancy-unsafe/replaced native tools
- [ ] Tool names aligned (`cron_schedule`, `cron_list`, `cron_cancel`, `sessions_send`, `sessions_spawn`)
- [ ] `assertNoCollisions()` runs on every agent invocation (soft-fail in production, hard-fail in dev)
- [ ] `assertUniqueClientToolNames()` runs on every agent invocation
- [ ] `toolMeta` includes `owner` field for every tool (execution ownership)
- [ ] `RuntimeEventEmitter` events emitted from Lucid choke points
- [ ] `GatewayRuntime` placeholder exists and throws "not enabled"
- [ ] Subagent tool uses injected `ctx.runTurn()` — no direct `@lucid/openclaw-runtime` import
- [ ] `KNOWN_NATIVE_TOOLS` matches current `createOpenClawTools()` output
- [ ] All existing tests pass with renamed tools
- [ ] No direct `@lucid/openclaw-runtime` imports outside `runtime/embedded.ts` and channel shim

## 9. Test Strategy

### Unit tests

| Module | Tests |
|--------|-------|
| `collision-guard.ts` | (1) No collision → passes. (2) Collision detected → throws in dev. (3) Collision in production → soft-fail, removes colliding tools, logs error. (4) Duplicate clientTool names → throws with context-appropriate message (builtin vs plugin). |
| `native-catalog.ts` | (1) `resolveEffectiveNativeTools()` correctly subtracts deny list. (2) `KNOWN_NATIVE_TOOLS` covers all tools from `createOpenClawCodingTools()` — test by importing the tool factories with mock options and comparing the output tool name sets. If factories are hard to instantiate, maintain a snapshot test that fails on subtree updates. |
| `native-deny.ts` | (1) `NATIVE_DENY` contains all expected categories. (2) `buildOpenClawToolPolicy()` returns correct format. |
| `compat-names.ts` | (1) Name constants match expected values. |

### Integration tests

| Scenario | Test |
|----------|------|
| `buildToolSurface()` | Given assistant config + plugins → produces correct clientTools, executor, deny policy. Collision guard runs. |
| `EmbeddedRuntime.runTurn()` | Given valid input → calls `runEmbeddedPiAgent` with correct params, returns `RunTurnOutput`. Mock OpenClaw runner. |
| Subagent runtime injection | Subagent tool calls `ctx.runTurn()` → goes through runtime seam (not direct import). |
| Tool rename end-to-end | Agent run with `cron_schedule` tool call → executes correctly via `BuiltInToolExecutor` dispatch. |

### Contract tests

| Contract | Test |
|----------|------|
| `RuntimeEventEmitter` | Both `EmbeddedRuntime` and (future) `GatewayRuntime` emit the same event set for equivalent runs. Test with mock emitter. |
| `AgentRuntime` interface | Both implementations accept the same `RunTurnInput` and return valid `RunTurnOutput`. |

## 10. Rollback Plan

This refactor touches the critical path (every agent invocation). Rollback strategy:

1. **Feature flag**: `FEATURE_RUNTIME_V2` added to `envSchema` in `config.ts` (following existing `FEATURE_OPENCLAW` pattern: `z.coerce.boolean().default(false)`). The thin facade in `OpenClawAgent.ts` checks this flag:
   - `true` → routes to `getRuntime(mode).runTurn()`
   - `false` → routes to the original `runOpenClawAgent()` code path (preserved as `legacyRunOpenClawAgent()`)

2. **Rollback trigger**: If error rate on agent runs exceeds baseline by >5% after deploy, flip `FEATURE_RUNTIME_V2=false` on Railway.

3. **Legacy code removal**: After 2 weeks of stable v2 operation, remove the legacy path and the feature flag.

4. **Tool rename rollback**: Old tool names (`schedule_task`, etc.) are aliases in `CommandsAllowlist.ts` during the transition period. Both old and new names dispatch to the same executor. Remove aliases after stable period.
