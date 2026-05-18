# OpenClaw Maximization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a runtime seam + tool surface builder so LucidMerged maximizes OpenClaw native usage, enforces collision guards, and can switch to gateway mode later with minimal changes.

**Architecture:** Extract `OpenClawAgent.ts` into `AgentRuntime` interface + `EmbeddedRuntime` impl + `ToolSurface` builder. Switch from `tools.allow` to `tools.deny`. Rename 5 runtime tools to OpenClaw-compatible names. Add collision guards and event emitter contract. Feature-flag the new path for safe rollback.

**Tech Stack:** TypeScript, Vitest, OpenClaw `runEmbeddedPiAgent`, Sentry (`captureMessage`), Zod (config schema)

**Spec:** `docs/superpowers/specs/2026-03-11-openclaw-maximization-design.md`

---

## File Structure

### New files (create)

| File | Responsibility |
|------|---------------|
| `worker/src/agent/tool-surface/types.ts` | `ToolSurface`, `ClientToolDefinition` interfaces |
| `worker/src/agent/tool-surface/compat-names.ts` | Stable tool name constants (old → new mapping) |
| `worker/src/agent/tool-surface/native-deny.ts` | `NATIVE_DENY` arrays + `buildOpenClawToolPolicy()` |
| `worker/src/agent/tool-surface/native-catalog.ts` | `KNOWN_NATIVE_TOOLS` + `resolveEffectiveNativeTools()` |
| `worker/src/agent/tool-surface/collision-guard.ts` | `assertNoCollisions()` + `assertUniqueClientToolNames()` |
| `worker/src/agent/tool-surface/executor.ts` | Unified 3-path dispatcher (built-in → plugin → block) |
| `worker/src/agent/tool-surface/builder.ts` | `buildToolSurface()` — single function producing `ToolSurface` |
| `worker/src/agent/tool-surface/index.ts` | Barrel exports |
| `worker/src/agent/runtime/types.ts` | `AgentRuntime`, `RunTurnInput`, `RunTurnOutput` |
| `worker/src/agent/runtime/events.ts` | `RuntimeEventEmitter` interface + no-op default |
| `worker/src/agent/runtime/embedded.ts` | `EmbeddedRuntime` (wraps `runEmbeddedPiAgent`) |
| `worker/src/agent/runtime/gateway.ts` | `GatewayRuntime` placeholder (throws) |
| `worker/src/agent/runtime/index.ts` | `getRuntime()` factory |
| `worker/src/agent/tool-surface/__tests__/collision-guard.test.ts` | Unit tests for collision guards |
| `worker/src/agent/tool-surface/__tests__/native-catalog.test.ts` | Unit tests for native catalog |
| `worker/src/agent/tool-surface/__tests__/native-deny.test.ts` | Unit tests for deny policy |
| `worker/src/agent/tool-surface/__tests__/builder.test.ts` | Integration test for buildToolSurface |
| `worker/src/agent/runtime/__tests__/embedded.test.ts` | Integration test for EmbeddedRuntime |

### Existing files (modify)

| File | Change |
|------|--------|
| `worker/src/config.ts` | Add `FEATURE_RUNTIME_V2` + `OPENCLAW_NATIVE_DENY_EXTRA` to envSchema |
| `worker/src/agent/CommandsAllowlist.ts` | Add new name aliases during transition |
| `worker/src/agent/BuiltInToolExecutor.ts` | Add new name dispatch cases |
| `worker/src/agent/runtime-tools/subagent.ts` | Remove direct `@lucid/openclaw-runtime` import, use injected `runTurn` |
| `worker/src/agent/runtime-tools/index.ts` | No change needed (exports stay the same) |
| `worker/src/agent/OpenClawAgent.ts` | Add feature-flag routing: v2 → `getRuntime().runTurn()`, legacy → existing code |

---

## Chunk 1: Tool Surface Foundation (types, names, deny, catalog, collision guard)

Pure data modules with no dependencies on runtime code. Fully testable in isolation.

### Task 1: Tool Surface Types

**Files:**
- Create: `worker/src/agent/tool-surface/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// worker/src/agent/tool-surface/types.ts

/**
 * ToolSurface — the output of buildToolSurface().
 * Everything the runtime needs to configure an agent run's tool set.
 */

export interface ClientToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type ToolOwner = 'lucid' | 'openclaw'
export type DangerLevel = 'safe' | 'elevated' | 'dangerous'

export interface ToolMeta {
  owner: ToolOwner
  dangerLevel: DangerLevel
  ownerOnly?: boolean
}

export interface ToolSurface {
  /** Lucid-owned tool schemas for the LLM (native tools come from OpenClaw separately) */
  clientTools: ClientToolDefinition[]
  /** Executes Lucid tool calls */
  executor: (toolName: string, params: Record<string, unknown>) => Promise<string>
  /** Lucid tool names for auditing */
  allowlist: Set<string>
  /** OpenClaw config — passed to runEmbeddedPiAgent as `tools` key */
  openclawToolPolicy: { tools: { deny: string[] } }
  /** Per-tool metadata for auditing/billing */
  toolMeta: Map<string, ToolMeta>
  /** Current tool call count (from executor) — used for billing/metering */
  getToolCallCount: () => number
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/tool-surface/types.ts
git commit -m "feat(tool-surface): add ToolSurface and ClientToolDefinition types"
```

### Task 2: Compat Names

**Files:**
- Create: `worker/src/agent/tool-surface/compat-names.ts`

- [ ] **Step 1: Create the compat names file**

```typescript
// worker/src/agent/tool-surface/compat-names.ts

/**
 * Stable tool names — the LLM contract.
 *
 * Cron names are Lucid-invented (OpenClaw's native `cron` is a single
 * multiplexed tool with an `action` param). sessions_send/sessions_spawn
 * match OpenClaw upstream names exactly.
 */

// Runtime tools — old names → new stable names
export const TOOL_NAME_MAP = {
  schedule_task: 'cron_schedule',
  list_scheduled_tasks: 'cron_list',
  cancel_scheduled_task: 'cron_cancel',
  send_message_to_agent: 'sessions_send',
  spawn_subagent: 'sessions_spawn',
} as const

// New stable names
export const CRON_SCHEDULE = 'cron_schedule' as const
export const CRON_LIST = 'cron_list' as const
export const CRON_CANCEL = 'cron_cancel' as const
export const SESSIONS_SEND = 'sessions_send' as const
export const SESSIONS_SPAWN = 'sessions_spawn' as const

/** All new stable runtime tool names */
export const RUNTIME_TOOL_STABLE_NAMES = new Set([
  CRON_SCHEDULE, CRON_LIST, CRON_CANCEL,
  SESSIONS_SEND, SESSIONS_SPAWN,
] as const)

/** Reverse map: new name → old name (for transition-period aliasing) */
export const REVERSE_TOOL_NAME_MAP = Object.fromEntries(
  Object.entries(TOOL_NAME_MAP).map(([old, stable]) => [stable, old])
) as Record<string, string>
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/tool-surface/compat-names.ts
git commit -m "feat(tool-surface): add stable tool name constants and mapping"
```

### Task 3: Native Deny Policy

**Files:**
- Create: `worker/src/agent/tool-surface/native-deny.ts`
- Create: `worker/src/agent/tool-surface/__tests__/native-deny.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/agent/tool-surface/__tests__/native-deny.test.ts
import { describe, it, expect } from 'vitest'
import { NATIVE_DENY, buildOpenClawToolPolicy } from '../native-deny.js'

describe('NATIVE_DENY', () => {
  it('contains all dangerous tools', () => {
    expect(NATIVE_DENY).toContain('exec')
    expect(NATIVE_DENY).toContain('browser')
    expect(NATIVE_DENY).toContain('read')
    expect(NATIVE_DENY).toContain('write')
    expect(NATIVE_DENY).toContain('edit')
  })

  it('contains tenancy-unsafe tools', () => {
    expect(NATIVE_DENY).toContain('memory_search')
    expect(NATIVE_DENY).toContain('memory_get')
    expect(NATIVE_DENY).toContain('canvas')
  })

  it('contains Lucid-replaced tools', () => {
    expect(NATIVE_DENY).toContain('cron')
    expect(NATIVE_DENY).toContain('sessions_send')
    expect(NATIVE_DENY).toContain('sessions_spawn')
    expect(NATIVE_DENY).toContain('gateway')
  })

  it('does NOT deny safe native tools', () => {
    expect(NATIVE_DENY).not.toContain('web_search')
    expect(NATIVE_DENY).not.toContain('web_fetch')
    expect(NATIVE_DENY).not.toContain('image')
    expect(NATIVE_DENY).not.toContain('pdf')
  })
})

describe('buildOpenClawToolPolicy', () => {
  it('returns tools.deny format', () => {
    const policy = buildOpenClawToolPolicy()
    expect(policy).toHaveProperty('tools.deny')
    expect(Array.isArray(policy.tools.deny)).toBe(true)
    expect(policy.tools.deny.length).toBeGreaterThan(0)
  })

  it('includes extra deny from env', () => {
    process.env.OPENCLAW_NATIVE_DENY_EXTRA = 'new_tool,another_tool'
    const policy = buildOpenClawToolPolicy()
    expect(policy.tools.deny).toContain('new_tool')
    expect(policy.tools.deny).toContain('another_tool')
    delete process.env.OPENCLAW_NATIVE_DENY_EXTRA
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/native-deny.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

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
  'memory_search', 'memory_get',
  'canvas',
  'nodes',
  'tts',
] as const

/** Replaced by Lucid: we provide SaaS-safe equivalents */
const REPLACED_BY_LUCID_DENY = [
  'cron',
  'message',
  'sessions_send',
  'sessions_spawn',
  'sessions_list',
  'sessions_history',
  'subagents',
  'session_status',
  'agents_list',
  'gateway',
] as const

/** Combined deny list for embedded mode */
export const NATIVE_DENY = [
  ...DANGER_DENY,
  ...TENANCY_DENY,
  ...REPLACED_BY_LUCID_DENY,
] as const

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/native-deny.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/src/agent/tool-surface/native-deny.ts worker/src/agent/tool-surface/__tests__/native-deny.test.ts
git commit -m "feat(tool-surface): add native tool deny policy with env override"
```

### Task 4: Native Tool Catalog

**Files:**
- Create: `worker/src/agent/tool-surface/native-catalog.ts`
- Create: `worker/src/agent/tool-surface/__tests__/native-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/agent/tool-surface/__tests__/native-catalog.test.ts
import { describe, it, expect } from 'vitest'
import { KNOWN_NATIVE_TOOLS, resolveEffectiveNativeTools } from '../native-catalog.js'

describe('KNOWN_NATIVE_TOOLS', () => {
  it('includes coding base tools', () => {
    expect(KNOWN_NATIVE_TOOLS.has('read')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('write')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('edit')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('exec')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('process')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('apply_patch')).toBe(true)
  })

  it('includes openclaw tools', () => {
    expect(KNOWN_NATIVE_TOOLS.has('web_search')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('web_fetch')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('image')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('pdf')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('cron')).toBe(true)
    expect(KNOWN_NATIVE_TOOLS.has('browser')).toBe(true)
  })
})

describe('resolveEffectiveNativeTools', () => {
  it('subtracts denied tools', () => {
    const effective = resolveEffectiveNativeTools(['exec', 'browser', 'cron'])
    expect(effective.has('exec')).toBe(false)
    expect(effective.has('browser')).toBe(false)
    expect(effective.has('cron')).toBe(false)
    expect(effective.has('web_search')).toBe(true)
    expect(effective.has('pdf')).toBe(true)
  })

  it('includes dynamic tools', () => {
    const effective = resolveEffectiveNativeTools([], new Set(['custom_channel_tool']))
    expect(effective.has('custom_channel_tool')).toBe(true)
  })

  it('denies dynamic tools too', () => {
    const effective = resolveEffectiveNativeTools(['whatsapp_login'])
    expect(effective.has('whatsapp_login')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/native-catalog.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// worker/src/agent/tool-surface/native-catalog.ts

/**
 * All native tools created by createOpenClawCodingTools() + createOpenClawTools().
 * MUST be updated when pulling new OpenClaw subtree versions.
 *
 * Sources:
 *   - pi-tools.ts createOpenClawCodingTools() (coding tools base set + exec/process/apply_patch)
 *   - openclaw-tools.ts createOpenClawTools() lines 124-194
 * Last synced: 2026-03-11
 */
export const KNOWN_NATIVE_TOOLS = new Set([
  // From coding tools base set (pi-tools.ts)
  'read', 'write', 'edit',
  'exec', 'process',
  'apply_patch',
  // From createOpenClawTools (openclaw-tools.ts)
  'browser', 'canvas', 'nodes', 'cron', 'message', 'tts',
  'gateway', 'agents_list', 'sessions_list', 'sessions_history',
  'sessions_send', 'sessions_spawn', 'subagents', 'session_status',
  'web_search', 'web_fetch', 'image', 'pdf',
] as const)

/** Dynamic native tools that depend on agent channel config */
export const KNOWN_DYNAMIC_NATIVE_TOOLS = new Set([
  'whatsapp_login',
] as const)

/**
 * Computes the effective native tools after deny filtering.
 * This is the set the collision guard checks clientTools against.
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/native-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/src/agent/tool-surface/native-catalog.ts worker/src/agent/tool-surface/__tests__/native-catalog.test.ts
git commit -m "feat(tool-surface): add native tool catalog with effective set resolver"
```

### Task 5: Collision Guard

**Files:**
- Create: `worker/src/agent/tool-surface/collision-guard.ts`
- Create: `worker/src/agent/tool-surface/__tests__/collision-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// worker/src/agent/tool-surface/__tests__/collision-guard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertNoCollisions, assertUniqueClientToolNames } from '../collision-guard.js'
import type { ClientToolDefinition } from '../types.js'

// Mock sentry
vi.mock('../../../monitoring/sentry.js', () => ({
  captureMessage: vi.fn(),
}))

function makeTool(name: string): ClientToolDefinition {
  return { type: 'function', function: { name, description: `Tool ${name}` } }
}

describe('assertNoCollisions', () => {
  it('returns all clientTools when no collision', () => {
    const tools = [makeTool('cron_schedule'), makeTool('sessions_send')]
    const native = new Set(['web_search', 'web_fetch'])
    const result = assertNoCollisions(native, tools)
    expect(result).toHaveLength(2)
  })

  it('throws on collision in hard mode', () => {
    const tools = [makeTool('web_search')]
    const native = new Set(['web_search', 'web_fetch'])
    expect(() => assertNoCollisions(native, tools)).toThrow('SECURITY')
  })

  it('soft-fail removes colliding tools and returns the rest', () => {
    const tools = [makeTool('web_search'), makeTool('cron_schedule')]
    const native = new Set(['web_search', 'web_fetch'])
    const result = assertNoCollisions(native, tools, { softFail: true })
    expect(result).toHaveLength(1)
    expect(result[0].function.name).toBe('cron_schedule')
  })
})

describe('assertUniqueClientToolNames', () => {
  it('passes with unique names', () => {
    const tools = [makeTool('a'), makeTool('b'), makeTool('c')]
    expect(() => assertUniqueClientToolNames(tools, 'merged')).not.toThrow()
  })

  it('throws on duplicates with context-aware message', () => {
    const tools = [makeTool('a'), makeTool('a')]
    expect(() => assertUniqueClientToolNames(tools, 'plugin')).toThrow('plugin')
    expect(() => assertUniqueClientToolNames(tools, 'builtin')).toThrow('builtin')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/collision-guard.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// worker/src/agent/tool-surface/collision-guard.ts

import { captureMessage } from '../../monitoring/sentry.js'
import type { ClientToolDefinition } from './types.js'

/**
 * Checks for tool name collisions between native (post-deny) and clientTools.
 * Returns the (possibly filtered) clientTools array.
 *
 * - hard mode (default): throws on collision
 * - soft mode: removes colliding clientTools, logs fatal to Sentry, returns rest
 */
export function assertNoCollisions(
  nativeEffectiveNames: Set<string>,
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
    console.error(`[tool-surface] ${msg} — removing colliding clientTools as safety fallback`)
    const collisionSet = new Set(collisions)
    return clientTools.filter(t => !collisionSet.has(t.function.name))
  }

  throw new Error(msg)
}

/**
 * Ensures no duplicate names among clientTools.
 * Context param controls the error message guidance.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd worker && npx vitest run src/agent/tool-surface/__tests__/collision-guard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/src/agent/tool-surface/collision-guard.ts worker/src/agent/tool-surface/__tests__/collision-guard.test.ts
git commit -m "feat(tool-surface): add collision guard with production soft-fail"
```

### Task 6: Tool Surface Barrel Export

**Files:**
- Create: `worker/src/agent/tool-surface/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
// worker/src/agent/tool-surface/index.ts
export type { ToolSurface, ClientToolDefinition, ToolMeta, ToolOwner, DangerLevel } from './types.js'
export { NATIVE_DENY, buildOpenClawToolPolicy } from './native-deny.js'
export { KNOWN_NATIVE_TOOLS, KNOWN_DYNAMIC_NATIVE_TOOLS, resolveEffectiveNativeTools } from './native-catalog.js'
export { assertNoCollisions, assertUniqueClientToolNames } from './collision-guard.js'
export * from './compat-names.js'
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/tool-surface/index.ts
git commit -m "feat(tool-surface): add barrel exports"
```

---

## Chunk 2: Config + Tool Name Aliasing (transition-safe rename)

Wire the feature flag, env var, and tool name aliases so both old and new names work during transition.

### Task 7: Add Feature Flag and Env Var to Config

**Files:**
- Modify: `worker/src/config.ts:55-61`

- [ ] **Step 1: Add FEATURE_RUNTIME_V2 and OPENCLAW_NATIVE_DENY_EXTRA to envSchema**

In `worker/src/config.ts`, add after the `FEATURE_OPENCLAW` line (line 56):

```typescript
  FEATURE_RUNTIME_V2: z.coerce.boolean().default(false),
  OPENCLAW_NATIVE_DENY_EXTRA: z.string().optional(),
```

- [ ] **Step 2: Verify worker still starts**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add worker/src/config.ts
git commit -m "feat(config): add FEATURE_RUNTIME_V2 flag and OPENCLAW_NATIVE_DENY_EXTRA"
```

### Task 8: Add New Name Aliases to BuiltInToolExecutor

**Files:**
- Modify: `worker/src/agent/BuiltInToolExecutor.ts:115-133`
- Modify: `worker/src/agent/BuiltInToolExecutor.ts:148-210`

During the transition period, both old and new names dispatch to the same functions. The `BUILT_IN_TOOL_NAMES` set and the `switch` statement need new entries.

- [ ] **Step 1: Add new names to BUILT_IN_TOOL_NAMES set**

In `worker/src/agent/BuiltInToolExecutor.ts`, update the `BUILT_IN_TOOL_NAMES` set (line 115-133) to include new aliases:

```typescript
const BUILT_IN_TOOL_NAMES = new Set([
  // Runtime primitives (old names — kept during transition)
  'spawn_subagent',
  'send_message_to_agent',
  'schedule_task',
  'list_scheduled_tasks',
  'cancel_scheduled_task',
  // Runtime primitives (new stable names)
  'sessions_spawn',
  'sessions_send',
  'cron_schedule',
  'cron_list',
  'cron_cancel',
  // Platform tools (elevated)
  'wallet_transfer',
  'dex_swap',
  'hl_place_order',
  'hl_cancel_order',
  // Legacy (migration candidates → plugins)
  'wallet_balance',
  'dex_get_quote',
  'hl_account_info',
  'generate_content',
  'code_interpreter',
])
```

- [ ] **Step 2: Add new name cases to the switch statement**

In the `executeBuiltInTool` function, add alias cases next to the existing ones. For each runtime tool switch case, add the new name as a fall-through:

```typescript
    case 'spawn_subagent':
    case 'sessions_spawn': {
      // ... existing spawn_subagent body
    }
    case 'send_message_to_agent':
    case 'sessions_send':
      // ... existing send_message_to_agent body
    case 'schedule_task':
    case 'cron_schedule':
      // ... existing schedule_task body
    case 'list_scheduled_tasks':
    case 'cron_list':
      // ... existing list_scheduled_tasks body
    case 'cancel_scheduled_task':
    case 'cron_cancel':
      // ... existing cancel_scheduled_task body
```

- [ ] **Step 3: Verify typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/BuiltInToolExecutor.ts
git commit -m "feat(executor): add new stable name aliases for runtime tools"
```

### Task 9: Add New Name Aliases to CommandsAllowlist

**Files:**
- Modify: `worker/src/agent/CommandsAllowlist.ts:28-153`

The tool schemas in `RUNTIME_TOOLS` need entries for the new stable names. Add them as aliases pointing to the same schemas with the new `name` field.

- [ ] **Step 1: Add new name entries to RUNTIME_TOOLS**

After the existing `cancel_scheduled_task` entry (line 152), add alias entries:

```typescript
  // ── New stable names (aliases during transition) ──────────────────
  cron_schedule: {
    ...RUNTIME_TOOLS.schedule_task,
    name: 'cron_schedule',
  },
  cron_list: {
    ...RUNTIME_TOOLS.list_scheduled_tasks,
    name: 'cron_list',
  },
  cron_cancel: {
    ...RUNTIME_TOOLS.cancel_scheduled_task,
    name: 'cron_cancel',
  },
  sessions_send: {
    ...RUNTIME_TOOLS.send_message_to_agent,
    name: 'sessions_send',
  },
  sessions_spawn: {
    ...RUNTIME_TOOLS.spawn_subagent,
    name: 'sessions_spawn',
  },
```

Note: Since `RUNTIME_TOOLS` uses `as const`, the aliases must be added after the initial declaration. Restructure to a `let` or extract the base definitions. The simplest approach: define the aliases in a separate const and merge into `BUILT_IN_TOOLS`:

```typescript
const RUNTIME_TOOL_ALIASES = {
  cron_schedule: { ...RUNTIME_TOOLS.schedule_task, name: 'cron_schedule' },
  cron_list: { ...RUNTIME_TOOLS.list_scheduled_tasks, name: 'cron_list' },
  cron_cancel: { ...RUNTIME_TOOLS.cancel_scheduled_task, name: 'cron_cancel' },
  sessions_send: { ...RUNTIME_TOOLS.send_message_to_agent, name: 'sessions_send' },
  sessions_spawn: { ...RUNTIME_TOOLS.spawn_subagent, name: 'sessions_spawn' },
} as const

export const BUILT_IN_TOOLS = {
  ...RUNTIME_TOOLS,
  ...RUNTIME_TOOL_ALIASES,
  ...PLATFORM_TOOLS,
  ...LEGACY_TOOLS,
} as const
```

- [ ] **Step 2: Update DANGER_TOOLS to avoid blocking the new cron_* names**

In `DANGER_TOOLS` (line 485-498), remove `cron_schedule` (it's currently there as a danger tool, but now it's a Lucid-owned tool that should be allowed). Keep `cron` (the native OpenClaw tool) blocked:

```typescript
export const DANGER_TOOLS = new Set([
  'browser',
  'cdp',
  'browser_cdp',
  'cron',           // native OpenClaw cron — blocked, Lucid uses cron_schedule/list/cancel
  // 'cron_schedule' REMOVED — this is now a Lucid runtime tool
  'shell_exec',
  'shell',
  'file_write',
  'file_delete',
  'plugin_install',
  'plugin_load',
  'exec',
])
```

- [ ] **Step 3: Verify typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/CommandsAllowlist.ts
git commit -m "feat(allowlist): add new stable name aliases, unblock cron_schedule from DANGER_TOOLS"
```

---

## Chunk 3: Runtime Seam (types, events, embedded, gateway, factory)

### Task 10: Runtime Types

**Files:**
- Create: `worker/src/agent/runtime/types.ts`

- [ ] **Step 1: Create the runtime types**

```typescript
// worker/src/agent/runtime/types.ts

import type { ChannelOutput } from '../../channels/ChannelOutput.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConfig, AgentMessage, RunBudget } from '../types.js'
import type { ActivatedPlugin } from '../plugin-types.js'

export interface AgentRuntime {
  runTurn(input: RunTurnInput): Promise<RunTurnOutput>
}

export interface RunTurnInput {
  orgId: string
  assistantId: string
  conversationId: string
  runId: string
  sessionKey?: string        // optional in embedded, required for gateway

  assistant: AssistantConfig
  plugins: ActivatedPlugin[]
  budget: RunBudget

  userMessage: string
  messages: AgentMessage[]
  memories: string[]
  images?: Array<{ data: string; mimeType: string }>

  output?: ChannelOutput

  supabase?: SupabaseClient
  userId?: string
  channelId?: string
  subagentDepth?: number

  embeddedConfig?: {
    llmConfig: { baseUrl: string; apiKey: string }
  }

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
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/runtime/types.ts
git commit -m "feat(runtime): add AgentRuntime interface and RunTurnInput type"
```

### Task 11: Runtime Event Emitter

**Files:**
- Create: `worker/src/agent/runtime/events.ts`

- [ ] **Step 1: Create the events contract**

```typescript
// worker/src/agent/runtime/events.ts

import type { ToolOwner } from '../tool-surface/types.js'

export interface RuntimeEventEmitter {
  onRunStart(ctx: { runId: string; assistantId: string; orgId: string; model: string }): void
  onRunEnd(ctx: {
    runId: string; durationMs: number; toolCallsUsed: number;
    usage?: { input?: number; output?: number; total?: number }
  }): void
  onRunError(ctx: { runId: string; error: Error; phase: string }): void

  onToolCallStart(ctx: { runId: string; toolName: string; toolCallId: string; owner: ToolOwner }): void
  onToolCallEnd(ctx: {
    runId: string; toolName: string; toolCallId: string;
    durationMs: number; isError: boolean; owner: ToolOwner
  }): void

  onModelCallStart(ctx: { runId: string; model: string; turnIndex: number }): void
  onModelCallEnd(ctx: { runId: string; turnIndex: number; usage?: { input?: number; output?: number } }): void
}

/** No-op emitter for use when no consumers are wired up yet */
export const noopEmitter: RuntimeEventEmitter = {
  onRunStart() {},
  onRunEnd() {},
  onRunError() {},
  onToolCallStart() {},
  onToolCallEnd() {},
  onModelCallStart() {},
  onModelCallEnd() {},
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/runtime/events.ts
git commit -m "feat(runtime): add RuntimeEventEmitter interface with no-op default"
```

### Task 12: Gateway Runtime Placeholder

**Files:**
- Create: `worker/src/agent/runtime/gateway.ts`

- [ ] **Step 1: Create the placeholder**

```typescript
// worker/src/agent/runtime/gateway.ts

import type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'

export class GatewayRuntime implements AgentRuntime {
  async runTurn(_input: RunTurnInput): Promise<RunTurnOutput> {
    throw new Error(
      'GatewayRuntime is not enabled. Set runtime_mode to "embedded" or deploy an OpenClaw gateway pool.'
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/runtime/gateway.ts
git commit -m "feat(runtime): add GatewayRuntime placeholder"
```

### Task 13: Embedded Runtime

**Files:**
- Create: `worker/src/agent/runtime/embedded.ts`

This is the biggest task — it extracts the core logic from `OpenClawAgent.ts` into the `EmbeddedRuntime` class. The logic is a direct lift from `runOpenClawAgent()`. Split into sub-steps for clarity.

- [ ] **Step 1: Create EmbeddedRuntime with helpers**

```typescript
// worker/src/agent/runtime/embedded.ts

import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { runEmbeddedPiAgent } from '@lucid/openclaw-runtime'
import type { EmbeddedPiRunResult } from '@lucid/openclaw-runtime'
import type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'
import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import type { ToolSurface } from '../tool-surface/types.js'
import { buildToolSurface } from '../tool-surface/builder.js'
import { noopEmitter, type RuntimeEventEmitter } from './events.js'

const SESSION_BASE = path.join(os.tmpdir(), 'lucid-openclaw-sessions')

let _llmEnvSet = false
function ensureLlmEnv(llmConfig: { baseUrl: string; apiKey: string }): void {
  if (_llmEnvSet) return
  process.env.OPENAI_API_KEY = llmConfig.apiKey
  process.env.OPENAI_API_BASE = llmConfig.baseUrl
  _llmEnvSet = true
}

async function ensureSessionDir(conversationId: string) {
  const dir = path.join(SESSION_BASE, conversationId)
  await fs.mkdir(dir, { recursive: true })
  return { sessionFile: path.join(dir, 'session.json'), workspaceDir: dir }
}

/** Re-export for callers that need session cleanup (e.g., worker shutdown) */
export { SESSION_BASE }
```

- [ ] **Step 2: Implement the EmbeddedRuntime class**

```typescript
// (continued in embedded.ts)

export class EmbeddedRuntime implements AgentRuntime {
  constructor(private emitter: RuntimeEventEmitter = noopEmitter) {}

  async runTurn(input: RunTurnInput): Promise<RunTurnOutput> {
    const runId = input.runId
    const { sessionFile, workspaceDir } = await ensureSessionDir(input.conversationId)

    if (input.embeddedConfig?.llmConfig) {
      ensureLlmEnv(input.embeddedConfig.llmConfig)
    }

    // Build system prompt
    const systemParts: string[] = []
    if (input.assistant.system_prompt) systemParts.push(input.assistant.system_prompt)
    if (input.memories.length > 0) {
      systemParts.push(`\n\n## Memories\n${input.memories.join('\n')}`)
    }

    // Detect streaming output
    const streamOutput = input.output && 'toolStart' in input.output
      ? input.output as AIStreamOutput
      : undefined

    // Build tool surface (collision guard, deny policy, executor)
    const toolSurface = buildToolSurface({
      assistant: input.assistant,
      plugins: input.plugins,
      supabase: input.supabase,
      userId: input.userId,
      runId,
      conversationId: input.conversationId,
      channelId: input.channelId,
      subagentDepth: input.subagentDepth ?? 0,
      sessionFile,
      workspaceDir,
      systemPrompt: systemParts.join('') || undefined,
      abortSignal: input.abortSignal,
      streamOutput,
    })

    // Build OpenClaw config — merge deny policy with provider/web config
    const openClawConfig = {
      tools: {
        deny: toolSurface.openclawToolPolicy.tools.deny,
        web: { search: { provider: 'brave' as const } },
      },
      models: {
        providers: {
          openai: {
            baseUrl: `${input.embeddedConfig?.llmConfig?.baseUrl || process.env.OPENAI_API_BASE}/v1`,
            api: 'openai-completions' as const,
            models: [],
          },
        },
      },
    }

    let fullText = ''
    const startMs = Date.now()
    this.emitter.onRunStart({ runId, assistantId: input.assistantId, orgId: input.orgId, model: input.assistant.lucid_model })

    try {
      const result = await runEmbeddedPiAgent({
        sessionId: input.conversationId,
        sessionFile,
        workspaceDir,
        prompt: input.userMessage,
        images: input.images?.map(img => ({ type: 'image' as const, data: img.data, mimeType: img.mimeType })),
        provider: 'openai',
        model: input.assistant.lucid_model,
        config: openClawConfig,
        temperature: input.assistant.temperature,
        maxOutputTokens: input.assistant.max_tokens,
        timeoutMs: input.budget.maxWallTimeMs,
        runId,
        abortSignal: input.abortSignal,
        extraSystemPrompt: systemParts.join('') || undefined,
        agentDir: workspaceDir,
        clientTools: toolSurface.clientTools.length > 0 ? toolSurface.clientTools : undefined,
        clientToolExecutor: toolSurface.clientTools.length > 0 ? toolSurface.executor : undefined,
        onPartialReply: async ({ text }: { text?: string }) => {
          if (input.output && text) {
            const delta = text.slice(fullText.length)
            if (delta) await input.output.append(delta)
            fullText = text
          }
        },
        onReasoningStream: streamOutput
          ? async ({ text }: { text?: string }) => { if (text) streamOutput.reasoningStream(text) }
          : undefined,
        onReasoningEnd: streamOutput
          ? async () => { streamOutput.reasoningEnd() }
          : undefined,
        onAgentEvent: (evt: { stream: string; data: Record<string, unknown> }) => {
          if (evt.stream === 'tool') {
            console.log('[EmbeddedRuntime] Tool event:', evt.data)
          }
        },
      })

      const durationMs = Date.now() - startMs
      const mapped = this.mapResult(result, fullText, toolSurface, durationMs)
      this.emitter.onRunEnd({ runId, durationMs, toolCallsUsed: mapped.toolCallsUsed, usage: mapped.meta.usage })
      return mapped
    } catch (err) {
      this.emitter.onRunError({ runId, error: err instanceof Error ? err : new Error(String(err)), phase: 'runTurn' })
      throw err
    }
  }

  private mapResult(
    result: EmbeddedPiRunResult,
    streamedText: string,
    toolSurface: ToolSurface,
    durationMs: number,
  ): RunTurnOutput {
    const responseText = result.payloads?.map(p => p.text).filter(Boolean).join('\n') || streamedText
    const usage = result.meta?.agentMeta?.usage
    return {
      text: responseText,
      toolCallsUsed: toolSurface.getToolCallCount(),
      meta: {
        durationMs,
        model: result.meta?.agentMeta?.model,
        usage: usage ? { input: usage.input, output: usage.output, total: (usage.input ?? 0) + (usage.output ?? 0) } : undefined,
        stopReason: result.meta?.agentMeta?.stopReason,
        error: result.meta?.error ? { kind: result.meta.error.kind, message: result.meta.error.message ?? '' } : undefined,
      },
    }
  }
}
```

Note: This depends on `buildToolSurface()` (Task 14) to compile. They are in the same chunk and will be wired together.

- [ ] **Step 3: Commit**

```bash
git add worker/src/agent/runtime/embedded.ts
git commit -m "feat(runtime): add EmbeddedRuntime wrapping runEmbeddedPiAgent"
```

### Task 14: Tool Surface Builder

**Files:**
- Create: `worker/src/agent/tool-surface/builder.ts`
- Create: `worker/src/agent/tool-surface/executor.ts`

The builder composes all the pieces: gets tool schemas from `CommandsAllowlist`, merges plugin tools, runs collision guard, builds executor, produces `ToolSurface`.

- [ ] **Step 1: Create the executor**

```typescript
// worker/src/agent/tool-surface/executor.ts

import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import { executeBuiltInTool, isBuiltInTool } from '../BuiltInToolExecutor.js'
import type { BuiltInToolExecutorParams } from '../BuiltInToolExecutor.js'
import { executePluginTool, type PluginToolContext } from '../PluginBridge.js'
import { parseWireToolName } from '../plugin-types.js'
import { DANGER_TOOLS } from '../CommandsAllowlist.js'
import crypto from 'node:crypto'

export function createUnifiedExecutor(
  pluginCtxMap: Map<string, PluginToolContext>,
  builtInParams: BuiltInToolExecutorParams | undefined,
  streamOutput?: AIStreamOutput,
) {
  let toolCallCount = 0

  return {
    get toolCallCount() { return toolCallCount },
    executor: async (toolName: string, params: Record<string, unknown>): Promise<string> => {
      if (!isBuiltInTool(toolName) && !pluginCtxMap.has(toolName)) {
        if (DANGER_TOOLS.has(toolName)) {
          console.error(`[tool-surface] SECURITY: Blocked dangerous tool: ${toolName}`)
        } else {
          console.warn(`[tool-surface] BLOCKED tool call: ${toolName} (not in allowlist)`)
        }
        return JSON.stringify({ error: `Tool "${toolName}" is not allowed.` })
      }

      toolCallCount++
      const toolCallId = crypto.randomUUID()

      // 1. Built-in tools
      if (isBuiltInTool(toolName) && builtInParams) {
        console.log(`[tool-surface] Executing built-in tool: ${toolName}`)
        streamOutput?.toolStart(toolCallId, toolName)
        try {
          const result = await executeBuiltInTool(toolName, params, builtInParams, toolCallId)
          if (result !== null) {
            streamOutput?.toolResult(toolCallId, result)
            return result
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
          streamOutput?.toolError(toolCallId, errorMsg)
          return JSON.stringify({ error: errorMsg })
        }
      }

      // 2. Plugin tools
      const parsed = parseWireToolName(toolName)
      const ctx = pluginCtxMap.get(toolName)
      if (!parsed || !ctx) {
        console.warn(`[tool-surface] Unknown tool: ${toolName}`)
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
      }

      const displayName = `${parsed.pluginSlug}:${parsed.toolName}`
      console.log(`[tool-surface] Executing plugin tool: ${displayName}`)
      streamOutput?.toolStart(toolCallId, displayName)
      try {
        const result = await executePluginTool(parsed.pluginSlug, parsed.toolName, params, ctx)
        streamOutput?.toolResult(toolCallId, result)
        return result
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
        streamOutput?.toolError(toolCallId, errorMsg)
        return JSON.stringify({ error: errorMsg })
      }
    },
  }
}
```

- [ ] **Step 2: Create the builder**

```typescript
// worker/src/agent/tool-surface/builder.ts

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolSurface, ClientToolDefinition, ToolMeta } from './types.js'
import type { AssistantConfig } from '../types.js'
import type { ActivatedPlugin } from '../plugin-types.js'
import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import { toWireToolName } from '../plugin-types.js'
import { CommandsAllowlist } from '../CommandsAllowlist.js'
import type { BuiltInToolExecutorParams } from '../BuiltInToolExecutor.js'
import type { SubagentContext } from '../runtime-tools/subagent.js'
import { buildOpenClawToolPolicy } from './native-deny.js'
import { resolveEffectiveNativeTools } from './native-catalog.js'
import { assertNoCollisions, assertUniqueClientToolNames } from './collision-guard.js'
import { createUnifiedExecutor } from './executor.js'
import { REVERSE_TOOL_NAME_MAP } from './compat-names.js'
import type { PluginToolContext } from '../PluginBridge.js'

export interface BuildToolSurfaceInput {
  assistant: AssistantConfig
  plugins: ActivatedPlugin[]
  supabase?: SupabaseClient
  userId?: string
  runId: string
  conversationId: string
  channelId?: string
  subagentDepth: number
  sessionFile: string
  workspaceDir: string
  systemPrompt?: string
  abortSignal?: AbortSignal
  streamOutput?: AIStreamOutput
}

export function buildToolSurface(input: BuildToolSurfaceInput): ToolSurface {
  const isProd = process.env.NODE_ENV === 'production'

  // 1. Build OpenClaw deny policy (returns { tools: { deny: [...] } })
  const openclawToolPolicy = buildOpenClawToolPolicy()

  // 2. Compute effective native tools (post-deny) for collision guard
  const effectiveNative = resolveEffectiveNativeTools(openclawToolPolicy.tools.deny)

  // 3. Get built-in clientTools from CommandsAllowlist
  // During transition, BUILT_IN_TOOLS contains both old and new names.
  // Filter out old names (keys of REVERSE_TOOL_NAME_MAP are the new names —
  // values are the old names we want to exclude).
  const oldNamesToExclude = new Set(Object.values(REVERSE_TOOL_NAME_MAP))
  const allowlist = new CommandsAllowlist(input.assistant.policy_config)
  if (input.assistant.wallet_enabled) {
    allowlist.stripWalletAddressParams()
  }
  const builtInDefs = allowlist.getAllowedTools()
    .filter(def => !oldNamesToExclude.has(def.name))  // exclude old aliases
    .map(def => ({
      type: 'function' as const,
      function: {
        name: def.name,
        description: def.description,
        ...(def.parameters ? { parameters: def.parameters } : {}),
      },
    }))

  // 4. Get plugin clientTools
  const pluginDefs: ClientToolDefinition[] = []
  const pluginCtxMap = new Map<string, PluginToolContext>()
  if (input.plugins?.length) {
    for (const p of input.plugins) {
      for (const t of p.tools) {
        const wireName = toWireToolName(p.slug, t.name)
        pluginDefs.push({
          type: 'function',
          function: { name: wireName, description: t.description, parameters: t.parameters },
        })
        pluginCtxMap.set(wireName, {
          pluginSlug: p.slug,
          config: p.config || {},
          source: p.source as PluginToolContext['source'],
          mcpgateServerId: p.mcpgateServerId,
        })
      }
    }
  }

  // 5. Merge and validate
  assertUniqueClientToolNames(builtInDefs, 'builtin')
  assertUniqueClientToolNames(pluginDefs, 'plugin')
  const merged = [...builtInDefs, ...pluginDefs]
  assertUniqueClientToolNames(merged, 'merged')

  // 6. Collision guard (soft-fail in prod)
  const safeClientTools = assertNoCollisions(effectiveNative, merged, { softFail: isProd })

  // 7. Build executor
  const config = {
    ...openclawToolPolicy,
    models: {
      providers: {
        openai: { baseUrl: '', api: 'openai-completions' as const, models: [] },
      },
    },
  }

  const subagentCtx: SubagentContext = {
    parentRunId: input.runId,
    depth: input.subagentDepth,
    childrenSpawned: 0,
    sessionFile: input.sessionFile,
    workspaceDir: input.workspaceDir,
    provider: 'openai',
    model: input.assistant.lucid_model,
    config,
    temperature: input.assistant.temperature,
    maxOutputTokens: input.assistant.max_tokens,
    extraSystemPrompt: input.systemPrompt,
    abortSignal: input.abortSignal,
    agentDir: input.workspaceDir,
    clientTools: safeClientTools.length > 0 ? safeClientTools : undefined,
    clientToolExecutor: undefined, // set below after executor is created
  }

  const builtInParams: BuiltInToolExecutorParams | undefined =
    input.supabase && input.userId
      ? {
          supabase: input.supabase,
          userId: input.userId,
          assistant: input.assistant,
          runId: input.runId,
          conversationId: input.conversationId,
          channelId: input.channelId,
          subagentCtx,
        }
      : undefined

  const toolExec = createUnifiedExecutor(pluginCtxMap, builtInParams, input.streamOutput)

  // Wire executor back into subagent context
  if (subagentCtx) {
    subagentCtx.clientToolExecutor = safeClientTools.length > 0 ? toolExec.executor : undefined
  }

  // 8. Build toolMeta
  const toolMeta = new Map<string, ToolMeta>()
  for (const t of builtInDefs) {
    toolMeta.set(t.function.name, { owner: 'lucid', dangerLevel: 'safe' })
  }
  for (const t of pluginDefs) {
    toolMeta.set(t.function.name, { owner: 'lucid', dangerLevel: 'safe' })
  }
  // Native tools that survived deny
  for (const name of effectiveNative) {
    toolMeta.set(name, { owner: 'openclaw', dangerLevel: 'safe' })
  }

  return {
    clientTools: safeClientTools,
    executor: toolExec.executor,
    allowlist: new Set(safeClientTools.map(t => t.function.name)),
    openclawToolPolicy,
    toolMeta,
    getToolCallCount: () => toolExec.toolCallCount,
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/tool-surface/executor.ts worker/src/agent/tool-surface/builder.ts
git commit -m "feat(tool-surface): add buildToolSurface and unified executor"
```

### Task 15: Runtime Factory and Barrel

**Files:**
- Create: `worker/src/agent/runtime/index.ts`

- [ ] **Step 1: Create the factory**

```typescript
// worker/src/agent/runtime/index.ts

import type { AgentRuntime } from './types.js'
import { EmbeddedRuntime } from './embedded.js'
import { GatewayRuntime } from './gateway.js'

export type RuntimeMode = 'embedded' | 'gateway'

const runtimes: Record<RuntimeMode, AgentRuntime> = {
  embedded: new EmbeddedRuntime(),
  gateway: new GatewayRuntime(),
}

export function getRuntime(mode: RuntimeMode = 'embedded'): AgentRuntime {
  return runtimes[mode]
}

export type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'
export type { RuntimeEventEmitter } from './events.js'
export { EmbeddedRuntime } from './embedded.js'
export { GatewayRuntime } from './gateway.js'
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/runtime/index.ts
git commit -m "feat(runtime): add getRuntime factory and barrel exports"
```

---

## Chunk 4: Wire It Up (feature-flagged facade in OpenClawAgent.ts)

### Task 16: Feature-Flag OpenClawAgent.ts

**Files:**
- Modify: `worker/src/agent/OpenClawAgent.ts`

The existing `runOpenClawAgent()` becomes `legacyRunOpenClawAgent()`. The new `runOpenClawAgent()` checks `FEATURE_RUNTIME_V2` and routes accordingly.

- [ ] **Step 1: Add feature-flagged routing**

At the top of `OpenClawAgent.ts`, add imports:
```typescript
import { getRuntime } from './runtime/index.js'
import type { RunTurnInput, RunTurnOutput } from './runtime/types.js'
```

Rename the existing `runOpenClawAgent` to `legacyRunOpenClawAgent`.

Add a new `runOpenClawAgent` that checks the flag and maps `RunTurnOutput` → `AgentRunResult`:

```typescript
/** Maps RunTurnOutput (runtime contract) → AgentRunResult (caller contract) */
function toAgentRunResult(output: RunTurnOutput): AgentRunResult {
  return {
    text: output.text,
    usage: {
      promptTokens: output.meta.usage?.input ?? 0,
      completionTokens: output.meta.usage?.output ?? 0,
    },
    steps: 1,
    toolCallsUsed: output.toolCallsUsed,
    budgetExhausted: output.meta.error?.kind === 'retry_limit',
  }
}

export async function runOpenClawAgent(params: OpenClawAgentParams): Promise<AgentRunResult> {
  const useV2 = process.env.FEATURE_RUNTIME_V2 === 'true'
  if (!useV2) {
    return legacyRunOpenClawAgent(params)
  }

  const runId = params.runId || crypto.randomUUID()
  const runtime = getRuntime('embedded')
  const output = await runtime.runTurn({
    orgId: params.assistant.org_id ?? '',
    assistantId: params.assistant.id,
    conversationId: params.conversationId,
    runId,
    assistant: params.assistant,
    plugins: params.plugins ?? [],
    budget: params.budget,
    userMessage: params.userMessage,
    messages: params.messages,
    memories: params.memories,
    images: params.images,
    output: params.output,
    supabase: params.supabase,
    userId: params.userId,
    channelId: params.channelId,
    subagentDepth: params.subagentDepth,
    embeddedConfig: { llmConfig: params.llmConfig },
    abortSignal: params.abortSignal,
  })
  return toAgentRunResult(output)
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Test manually**

Run the worker with `FEATURE_RUNTIME_V2=false` (default) — should use legacy path.
Run with `FEATURE_RUNTIME_V2=true` — should use new runtime path.

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/OpenClawAgent.ts
git commit -m "feat(agent): feature-flag FEATURE_RUNTIME_V2 routing in OpenClawAgent"
```

---

## Chunk 5: Subagent Runtime Injection

### Task 17: Remove Direct Import from Subagent

**Files:**
- Modify: `worker/src/agent/runtime-tools/subagent.ts`

- [ ] **Step 1: Add `runTurn` to SubagentContext interface**

In the `SubagentContext` interface (line 35-51), add the new field and import:

```typescript
// At the top of subagent.ts, add:
import type { RunTurnInput, RunTurnOutput } from '../runtime/types.js'

// In SubagentContext interface, add after clientToolExecutor:
  /** Injected runtime — replaces direct runEmbeddedPiAgent import (v2 path) */
  runTurn?: (input: RunTurnInput) => Promise<RunTurnOutput>
```

- [ ] **Step 2: Use ctx.runTurn when available, fall back to direct import**

In `toolSpawnSubagent`, replace the `runEmbeddedPiAgent` call block (lines 124-164) with a conditional that uses `ctx.runTurn` when available:

```typescript
    // Inside the try block, replace the direct runEmbeddedPiAgent call:

    if (ctx.runTurn) {
      // V2 path — use injected runtime (goes through AgentRuntime seam)
      const turnOutput = await ctx.runTurn({
        orgId: '',
        assistantId: `subagent-${childRunId}`,
        conversationId: `subagent-${childRunId}`,
        runId: childRunId,
        assistant: {
          id: `subagent-${childRunId}`,
          org_id: '',
          system_prompt: [
            ctx.extraSystemPrompt || '',
            `\n\n[Subagent Context] You are a focused subagent (depth ${ctx.depth + 1}/${SUBAGENT_MAX_DEPTH}). Complete the given task concisely. Do not spawn further subagents unless absolutely necessary.`,
          ].join(''),
          lucid_model: ctx.model,
          temperature: ctx.temperature,
          max_tokens: ctx.maxOutputTokens,
          policy_config: {},
          wallet_enabled: false,
        } as AssistantConfig,
        plugins: [],
        budget: { maxLlmCalls: 15, maxToolCalls: maxToolCalls, maxWallTimeMs: maxWallTimeMs },
        userMessage: params.task,
        messages: [],
        memories: [],
        output: undefined,
        subagentDepth: ctx.depth + 1,
        embeddedConfig: undefined,
        abortSignal: ctx.abortSignal,
      })

      const durationMs = Date.now() - startMs
      const subagentResult: SubagentResult = {
        text: turnOutput.text,
        toolCallsUsed: turnOutput.toolCallsUsed,
        usage: {
          input: turnOutput.meta.usage?.input ?? 0,
          output: turnOutput.meta.usage?.output ?? 0,
        },
        parentRunId: ctx.parentRunId,
        childRunId,
        durationMs,
      }

      span.setAttribute('lucid.subagent.duration_ms', durationMs)
      span.setAttribute('lucid.subagent.tool_calls', turnOutput.toolCallsUsed)
      console.log(`[subagent] Child ${childRunId} completed in ${durationMs}ms (${turnOutput.toolCallsUsed} tool calls)`)
      return JSON.stringify(subagentResult)

    } else {
      // Legacy path — direct runEmbeddedPiAgent call (existing code, unchanged)
      const result: EmbeddedPiRunResult = await runEmbeddedPiAgent({
        sessionId: `subagent-${childRunId}`,
        sessionFile: childSessionFile,
        workspaceDir: childWorkspaceDir,
        agentDir: childWorkspaceDir,
        prompt: params.task,
        provider: ctx.provider,
        model: ctx.model,
        config: ctx.config,
        temperature: ctx.temperature,
        maxOutputTokens: ctx.maxOutputTokens,
        timeoutMs: maxWallTimeMs,
        runId: childRunId,
        abortSignal: ctx.abortSignal,
        spawnedBy: ctx.parentRunId,
        extraSystemPrompt: [
          ctx.extraSystemPrompt || '',
          `\n\n[Subagent Context] You are a focused subagent (depth ${ctx.depth + 1}/${SUBAGENT_MAX_DEPTH}). Complete the given task concisely. Do not spawn further subagents unless absolutely necessary.`,
        ].join(''),
        clientTools: ctx.clientTools,
        clientToolExecutor: wrappedExecutor,
      })

      const durationMs = Date.now() - startMs
      const responseText = result.payloads?.map(p => p.text).filter(Boolean).join('\n') || ''
      const usage = result.meta?.agentMeta?.usage

      const subagentResult: SubagentResult = {
        text: responseText,
        toolCallsUsed: childToolCalls,
        usage: { input: usage?.input ?? 0, output: usage?.output ?? 0 },
        parentRunId: ctx.parentRunId,
        childRunId,
        durationMs,
      }

      span.setAttribute('lucid.subagent.duration_ms', durationMs)
      span.setAttribute('lucid.subagent.tool_calls', childToolCalls)
      console.log(`[subagent] Child ${childRunId} completed in ${durationMs}ms (${childToolCalls} tool calls)`)
      return JSON.stringify(subagentResult)
    }
```

Add `AssistantConfig` import at the top:
```typescript
import type { AssistantConfig } from '../types.js'
```

Note: The `runEmbeddedPiAgent` import stays during transition. Both paths coexist. Remove the legacy path when `FEATURE_RUNTIME_V2` is the only path.

- [ ] **Step 3: Verify typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/runtime-tools/subagent.ts
git commit -m "feat(subagent): add runtime injection via ctx.runTurn"
```

---

## Chunk 6: Update Tool Surface Barrel + Final Typecheck

### Task 18: Update tool-surface/index.ts with builder exports

**Files:**
- Modify: `worker/src/agent/tool-surface/index.ts`

- [ ] **Step 1: Add builder and executor exports**

```typescript
export { buildToolSurface, type BuildToolSurfaceInput } from './builder.js'
export { createUnifiedExecutor } from './executor.js'
```

- [ ] **Step 2: Full typecheck**

Run: `cd worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd worker && npx vitest run`
Expected: All tests pass (collision-guard, native-catalog, native-deny)

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/tool-surface/index.ts
git commit -m "feat(tool-surface): complete barrel exports with builder"
```

### Task 19: Final Verification

- [ ] **Step 1: Verify no direct @lucid/openclaw-runtime imports outside allowed files**

Run: `grep -r "@lucid/openclaw-runtime" worker/src/ --include="*.ts" | grep -v "runtime/embedded.ts" | grep -v "runtime-tools/subagent.ts" | grep -v "OpenClawAgent.ts" | grep -v "node_modules"`

Expected: Only channel shim files (openclaw-channel-shim.ts) and index.ts (setRuntimeConfigSnapshot).

- [ ] **Step 2: Verify FEATURE_RUNTIME_V2=false is default (no behavior change)**

Run: `cd worker && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete OpenClaw maximization — runtime seam + tool surface + collision guards

Implements the Gateway Switchability Contract spec:
- AgentRuntime interface with EmbeddedRuntime + GatewayRuntime placeholder
- ToolSurface builder with collision guards (soft-fail prod, hard-fail dev)
- tools.deny policy (replaces tools.allow)
- KNOWN_NATIVE_TOOLS catalog for collision detection
- Tool name aliases (cron_schedule, sessions_send, sessions_spawn)
- FEATURE_RUNTIME_V2 flag for safe rollback
- OPENCLAW_NATIVE_DENY_EXTRA env var for emergency tool blocking
- RuntimeEventEmitter contract for observability

Spec: docs/superpowers/specs/2026-03-11-openclaw-maximization-design.md"
```
