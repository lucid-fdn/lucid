# Tool Awareness Automation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate tool awareness so adding a new tool requires only one registry entry — no manual skill/prompt updates.

**Architecture:** Enrich `CommandsAllowlist.ts` with `when_to_use`, `examples`, `related_tools` metadata. Build `buildToolPrompt()` to auto-generate the tool awareness prompt from metadata. Replace hand-written routing table in `builtin-skills.ts`. Extract `get_trading_policy` inline code to `internal-tools/`. Split skills into conditional tiers.

**Tech Stack:** TypeScript, Vitest, Node.js (worker)

**Spec:** `docs/architecture/tool-skill-organization.md`

**Note:** This is a bridge plan, not the final architecture. It gets us automated tool awareness, smaller skills, and less maintenance now. Later: metadata co-located with extracted tool packages, CommandsAllowlist becomes a runtime policy layer only.

---

## Scope

This plan covers migration steps 1, 3, 4, and 8 from the spec — the immediate LucidMerged-only wins. Steps 2, 5-7, and 9 (cross-repo: creating lucid-tools, splitting lucid-plugins, SignerFn, capability-based allowlist) are a separate future plan.

**What this plan delivers:**
1. `EnrichedToolDefinition` type (`ToolDefinition & ToolEnrichment`) — clean separation
2. All 27 tools enriched with metadata in `CommandsAllowlist.ts`
3. `buildToolPrompt()` auto-generates tool awareness prompt (grouped, capped, deduped)
4. `get_trading_policy` extracted to `internal-tools/trading/`
5. `builtin-skills.ts` split into conditional tiers (no more hand-written routing)
6. Full test coverage for new code

**What this plan does NOT touch:**
- Tool implementations (stay where they are — `@lucid-fdn/web3-operator` is already published)
- Cross-repo extraction (lucid-tools, lucid-plugins)
- SignerFn interface
- Capability-based allowlist

**Key packages confirmed published on npm:**
- `@lucid-fdn/web3-operator@1.2.0` — 12 web3 tools (Read/Reason/Act)
- `@lucid-fdn/plugins-embedded@1.4.0` — 18 MCP server factories
- `@lucid-fdn/web3-types@1.0.0` — shared chain/token types

## File Structure

```
worker/src/agent/
  tool-metadata/                         ← NEW directory
    types.ts                             ← ToolEnrichment, EnrichedToolDefinition (standalone, no imports from CommandsAllowlist)
    build-prompt.ts                      ← buildToolPrompt() — imports from ./types.ts only
    index.ts                             ← barrel exports
  internal-tools/                        ← NEW directory
    trading/                             ← domain subfolder
      policy.ts                          ← extracted from BuiltInToolExecutor.ts:385-433
      policy.schema.ts                   ← enriched schema for get_trading_policy
      index.ts                           ← barrel
    index.ts                             ← top-level barrel
  CommandsAllowlist.ts                   ← MODIFY: import EnrichedToolDefinition, use satisfies,
                                            add enrichment to all entries, enrich aliases after spread
  BuiltInToolExecutor.ts                 ← MODIFY: move get_trading_policy dispatch before
                                            TRADING_TOOLS guard, import from internal-tools
  OpenClawAgent.ts                       ← MODIFY: use buildToolPrompt() instead of bare list
  skills/
    builtin-skills.ts                    ← MODIFY: remove routing table, split into conditional tiers
    fetch-active-skills.ts               ← MODIFY: accept assistant config, pass to getBuiltinSkills
  __tests__/
    tool-metadata.test.ts                ← NEW
    internal-tools.test.ts               ← NEW
    builtin-skills.test.ts               ← NEW
```

### Dependency Direction (Important)

```
tool-metadata/types.ts          ← standalone, depends on nothing
  ↑                   ↑
  │                   │
build-prompt.ts    CommandsAllowlist.ts
                     ↑
               BuiltInToolExecutor.ts, OpenClawAgent.ts
```

`build-prompt.ts` does NOT import from `CommandsAllowlist.ts`. Both import from `tool-metadata/types.ts`.

---

## Chunk 1: Types, buildToolPrompt, and Tests

### Task 1: Create type hierarchy

**Files:**
- Create: `worker/src/agent/tool-metadata/types.ts`

`ToolDefinition` stays minimal (existing runtime schema). `ToolEnrichment` is the metadata extension. `EnrichedToolDefinition` combines both.

- [ ] **Step 1: Create tool-metadata/types.ts**

```typescript
// worker/src/agent/tool-metadata/types.ts

/**
 * Minimal tool definition — the canonical runtime schema.
 * Matches the existing ToolDefinition in CommandsAllowlist.ts.
 * Duplicated here to avoid circular dependency (build-prompt must not import CommandsAllowlist).
 */
export interface ToolDefinitionBase {
  name: string
  description: string
  category: string
  dangerLevel?: 'safe' | 'elevated' | 'dangerous'
  parameters?: Record<string, unknown>
}

/**
 * Enrichment metadata for automated tool awareness.
 * Added on top of base tool definitions.
 */
export interface ToolEnrichment {
  /** Trigger phrases — when the LLM should consider using this tool */
  when_to_use: string[]
  /** Example user queries with expected tool_call params */
  examples?: { user: string; tool_call: unknown }[]
  /** Soft hints — related tools often used together. NOT hard constraints. */
  related_tools?: string[]
  /** Whether elevated tools need explicit user confirmation */
  requires_confirmation?: boolean
}

/**
 * Full enriched tool definition = base schema + metadata.
 * Used by buildToolPrompt() and enriched entries in CommandsAllowlist.
 */
export type EnrichedToolDefinition = ToolDefinitionBase & ToolEnrichment

/**
 * Category rendering order for buildToolPrompt().
 * Read first, then reason, then act, then everything else.
 */
export const CATEGORY_ORDER: Record<string, number> = {
  read: 0,
  web3: 0,      // legacy category name, treat as read
  reason: 1,
  act: 2,
  trading: 2,   // legacy, treat as act
  orchestration: 3,
  runtime: 3,
  internal: 4,
  content: 5,
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/agent/tool-metadata/types.ts
git commit -m "feat: add ToolEnrichment and EnrichedToolDefinition types"
```

### Task 2: Write failing tests for buildToolPrompt

**Files:**
- Create: `worker/src/agent/__tests__/tool-metadata.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// worker/src/agent/__tests__/tool-metadata.test.ts
import { describe, it, expect } from 'vitest'
import { buildToolPrompt } from '../tool-metadata/build-prompt.js'
import type { EnrichedToolDefinition } from '../tool-metadata/types.js'

const mockReadTool: EnrichedToolDefinition = {
  name: 'get_price',
  description: 'Get current USD price of a token',
  category: 'read',
  dangerLevel: 'safe',
  parameters: { type: 'object', properties: { chain: { type: 'string' } } },
  when_to_use: ['user asks "price of X"', 'need current value before swap', 'third trigger that should be capped'],
  examples: [
    { user: 'what is SOL worth?', tool_call: { chain: 'solana', address: 'SOL' } },
    { user: 'ETH price', tool_call: { chain: 'ethereum', address: 'ETH' } },
  ],
  related_tools: ['search_token'],
}

const mockActTool: EnrichedToolDefinition = {
  name: 'dex_swap',
  description: 'Execute a token swap via DEX aggregator',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: { type: 'object', properties: {} },
  when_to_use: ['user wants to swap tokens'],
  requires_confirmation: true,
  related_tools: ['dex_get_quote', 'risk_check'],
}

const mockReasonTool: EnrichedToolDefinition = {
  name: 'risk_check',
  description: 'Assess risk before trading',
  category: 'reason',
  dangerLevel: 'safe',
  parameters: { type: 'object', properties: {} },
  when_to_use: ['before any trade to assess safety'],
}

describe('buildToolPrompt', () => {
  it('includes tool name and description', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('get_price')
    expect(result).toContain('Get current USD price of a token')
  })

  it('includes when_to_use triggers (capped at 2)', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('user asks "price of X"')
    expect(result).toContain('need current value before swap')
    // Third trigger should be omitted (cap at 2)
    expect(result).not.toContain('third trigger that should be capped')
  })

  it('includes first example only', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('what is SOL worth?')
    // Second example should be omitted
    expect(result).not.toContain('ETH price')
  })

  it('includes related_tools as hints', () => {
    const result = buildToolPrompt([mockReadTool])
    expect(result).toContain('search_token')
  })

  it('marks elevated tools that require confirmation', () => {
    const result = buildToolPrompt([mockActTool])
    expect(result).toContain('requires confirmation')
  })

  it('returns empty string for empty array', () => {
    expect(buildToolPrompt([])).toBe('')
  })

  it('groups and sorts by category: read before reason before act', () => {
    // Pass in wrong order — output should be sorted
    const result = buildToolPrompt([mockActTool, mockReadTool, mockReasonTool])
    const readPos = result.indexOf('get_price')
    const reasonPos = result.indexOf('risk_check')
    const actPos = result.indexOf('dex_swap')
    expect(readPos).toBeLessThan(reasonPos)
    expect(reasonPos).toBeLessThan(actPos)
  })

  it('does not contain undefined or null strings', () => {
    const result = buildToolPrompt([mockReadTool, mockActTool, mockReasonTool])
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/tool-metadata.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Commit**

```bash
git add worker/src/agent/__tests__/tool-metadata.test.ts
git commit -m "test: add failing tests for buildToolPrompt"
```

### Task 3: Implement buildToolPrompt

**Files:**
- Create: `worker/src/agent/tool-metadata/build-prompt.ts`
- Create: `worker/src/agent/tool-metadata/index.ts`

- [ ] **Step 1: Implement buildToolPrompt**

```typescript
// worker/src/agent/tool-metadata/build-prompt.ts
import type { EnrichedToolDefinition } from './types.js'
import { CATEGORY_ORDER } from './types.js'

/** Max when_to_use entries to render per tool (avoid prompt bloat) */
const MAX_TRIGGERS = 2

/**
 * Auto-generates the tool awareness section of the agent prompt
 * from enriched tool metadata.
 *
 * - Groups tools by category (read → reason → act → runtime → internal)
 * - Caps when_to_use at 2 entries per tool
 * - Shows first example only
 * - Marks tools requiring confirmation
 */
export function buildToolPrompt(tools: EnrichedToolDefinition[]): string {
  if (tools.length === 0) return ''

  // Sort by category order, then alphabetically within category
  const sorted = [...tools].sort((a, b) => {
    const orderA = CATEGORY_ORDER[a.category] ?? 99
    const orderB = CATEGORY_ORDER[b.category] ?? 99
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name)
  })

  return sorted
    .map((t) => {
      const lines: string[] = []
      lines.push(`- **${t.name}**: ${t.description}`)

      const triggers = t.when_to_use.slice(0, MAX_TRIGGERS)
      if (triggers.length > 0) {
        lines.push(`  Use when: ${triggers.join('; ')}`)
      }

      if (t.examples?.length) {
        lines.push(`  Example: "${t.examples[0].user}"`)
      }

      if (t.related_tools?.length) {
        lines.push(`  Related: ${t.related_tools.join(', ')}`)
      }

      if (t.requires_confirmation) {
        lines.push(`  ⚠ This tool requires confirmation before execution.`)
      }

      return lines.join('\n')
    })
    .join('\n')
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// worker/src/agent/tool-metadata/index.ts
export { buildToolPrompt } from './build-prompt.js'
export type { ToolDefinitionBase, ToolEnrichment, EnrichedToolDefinition } from './types.js'
export { CATEGORY_ORDER } from './types.js'
```

- [ ] **Step 3: Run tests**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/tool-metadata.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/tool-metadata/
git commit -m "feat: implement buildToolPrompt with category grouping and prompt-size caps"
```

---

## Chunk 2: Extract get_trading_policy + Enrich CommandsAllowlist

### Task 4: Extract get_trading_policy to internal-tools/trading/

**Files:**
- Create: `worker/src/agent/internal-tools/trading/policy.ts`
- Create: `worker/src/agent/internal-tools/trading/policy.schema.ts`
- Create: `worker/src/agent/internal-tools/trading/index.ts`
- Create: `worker/src/agent/internal-tools/index.ts`
- Modify: `worker/src/agent/BuiltInToolExecutor.ts`
- Modify: `worker/src/agent/CommandsAllowlist.ts`

**Bug fix included:** `get_trading_policy` dispatch is currently after the `TRADING_TOOLS` guard at line 282 (`if (!TRADING_TOOLS.has(toolName)) return null`). Since `get_trading_policy` is NOT in `TRADING_TOOLS`, it's unreachable. This task moves the dispatch to the first switch block.

- [ ] **Step 1: Write failing test**

Create `worker/src/agent/__tests__/internal-tools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { tradingPolicySchema } from '../internal-tools/trading/policy.schema.js'
import { executeTradingPolicyTool } from '../internal-tools/trading/policy.js'

describe('tradingPolicySchema', () => {
  it('has correct name', () => {
    expect(tradingPolicySchema.name).toBe('get_trading_policy')
  })

  it('is marked as safe', () => {
    expect(tradingPolicySchema.dangerLevel).toBe('safe')
  })

  it('has enrichment metadata', () => {
    expect(tradingPolicySchema.when_to_use).toBeDefined()
    expect(tradingPolicySchema.when_to_use.length).toBeGreaterThan(0)
  })
})

describe('executeTradingPolicyTool', () => {
  it('returns disabled message when no policy exists', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        }),
      }),
    })

    const result = await executeTradingPolicyTool({
      supabase: { from: mockFrom } as any,
      userId: 'test-user',
      assistant: { id: 'test-assistant' } as any,
    } as any)

    const parsed = JSON.parse(result)
    expect(parsed.enabled).toBe(false)
    expect(parsed.message).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/internal-tools.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Create policy.schema.ts**

```typescript
// worker/src/agent/internal-tools/trading/policy.schema.ts
import type { EnrichedToolDefinition } from '../../tool-metadata/types.js'

export const tradingPolicySchema: EnrichedToolDefinition = {
  name: 'get_trading_policy',
  description:
    'Get the current trading policy settings for this agent — limits, allowed chains, allowed tokens, slippage, daily usage.',
  category: 'internal',
  dangerLevel: 'safe' as const,
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  when_to_use: [
    'user asks about trading limits or allowed chains',
    'user asks "what can I trade" or "what are my limits"',
    'user asks about daily usage or remaining allowance',
    'user asks about trading settings or slippage',
  ],
  examples: [
    { user: 'what are my trading limits?', tool_call: {} },
    { user: 'which chains can I trade on?', tool_call: {} },
  ],
}
```

- [ ] **Step 4: Create policy.ts (extracted implementation)**

```typescript
// worker/src/agent/internal-tools/trading/policy.ts
import type { BuiltInToolExecutorParams } from '../../BuiltInToolExecutor.js'

/**
 * get_trading_policy — internal SaaS tool.
 * Reads trading_policies + trading_daily_usage from Supabase.
 *
 * Private tool — depends on Supabase, org context, RLS.
 * Per architecture: internal tools stay in LucidMerged permanently.
 */
export async function executeTradingPolicyTool(
  params: BuiltInToolExecutorParams,
): Promise<string> {
  const { supabase, userId, assistant } = params

  const { data: policy, error: policyErr } = await supabase
    .from('trading_policies')
    .select('*')
    .eq('assistant_id', assistant.id)
    .single()

  if (policyErr && policyErr.code !== 'PGRST116') {
    return JSON.stringify({ error: 'Failed to fetch trading policy' })
  }

  if (!policy) {
    return JSON.stringify({
      enabled: false,
      message: 'No trading policy configured. Trading is disabled.',
    })
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: usage } = await supabase
    .from('trading_daily_usage')
    .select('total_volume_usd, trade_count')
    .eq('user_id', userId)
    .eq('assistant_id', assistant.id)
    .eq('usage_date', today)
    .single()

  return JSON.stringify({
    enabled: policy.enabled,
    max_trade_value_usd: policy.max_trade_value_usd,
    daily_limit_usd: policy.daily_limit_usd,
    allowed_chains: policy.allowed_chains,
    allowed_tokens: policy.allowed_tokens,
    max_slippage_bps: policy.max_slippage_bps,
    max_slippage_pct: (policy.max_slippage_bps || 100) / 100,
    require_confirmation_above_usd: policy.require_confirmation_above_usd,
    blocked_protocols: policy.blocked_protocols,
    daily_usage: {
      date: today,
      volume_usd: usage?.total_volume_usd || 0,
      trade_count: usage?.trade_count || 0,
      remaining_usd: Math.max(
        0,
        (policy.daily_limit_usd || 0) - (usage?.total_volume_usd || 0),
      ),
    },
  })
}
```

- [ ] **Step 5: Create barrel exports**

```typescript
// worker/src/agent/internal-tools/trading/index.ts
export { executeTradingPolicyTool } from './policy.js'
export { tradingPolicySchema } from './policy.schema.js'
```

```typescript
// worker/src/agent/internal-tools/index.ts
export { executeTradingPolicyTool, tradingPolicySchema } from './trading/index.js'
```

- [ ] **Step 6: Update BuiltInToolExecutor.ts**

1. Add import at top:
```typescript
import { executeTradingPolicyTool } from './internal-tools/index.js'
```

2. **Move** the `get_trading_policy` case into the first switch block (before the `TRADING_TOOLS` guard at line 282). Add it alongside `generate_content` and `code_interpreter`:

```typescript
  switch (toolName) {
    case 'generate_content':
      // ... existing ...
    case 'code_interpreter':
      return toolCodeInterpreter(args)
    case 'get_trading_policy':           // ← MOVED HERE (was unreachable after TRADING_TOOLS guard)
      return executeTradingPolicyTool(params)
    case 'spawn_subagent':
    // ... rest unchanged ...
  }
```

3. **Delete** the old `case 'get_trading_policy':` from the second switch block (~line 321) and the inline `executeTradingPolicyTool` function at the bottom of the file (~lines 385-433).

- [ ] **Step 7: Update CommandsAllowlist.ts — import schema**

1. Add import: `import { tradingPolicySchema } from './internal-tools/index.js'`
2. Replace the inline `get_trading_policy` entry in `BUILTIN_SERVICE_TOOLS` with: `get_trading_policy: tradingPolicySchema,`

- [ ] **Step 8: Run tests**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/internal-tools.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add worker/src/agent/internal-tools/ worker/src/agent/__tests__/internal-tools.test.ts worker/src/agent/BuiltInToolExecutor.ts worker/src/agent/CommandsAllowlist.ts
git commit -m "refactor: extract get_trading_policy to internal-tools/trading, fix unreachable dispatch"
```

### Task 5: Enrich all tool entries in CommandsAllowlist

**Files:**
- Modify: `worker/src/agent/CommandsAllowlist.ts`

This task adds enrichment to every tool entry. No implementation files change — only the registry.

**Strategy for `as const`:** Instead of removing `as const` everywhere (too blunt), use `satisfies` on enriched entries to get type checking while keeping literal inference. For the tool group objects, add a type annotation instead:

```typescript
// BEFORE (too restrictive for new fields)
const RUNTIME_TOOLS = { ... } as const

// AFTER (type-checked but flexible)
const RUNTIME_TOOLS: Record<string, ToolDefinition> = { ... }
```

Where `ToolDefinition` is the existing interface in the same file, now also accepting the optional enrichment fields.

**Important:** `ToolDefinition` in `CommandsAllowlist.ts` needs the enrichment fields added as optional. This is safe because they're optional — existing code that doesn't use them is unaffected:

```typescript
export interface ToolDefinition {
  name: string
  description: string
  category: string
  dangerLevel?: DangerLevel
  parameters?: Record<string, unknown>
  // ── Optional enrichment (for automated tool awareness) ──
  when_to_use?: string[]
  examples?: { user: string; tool_call: unknown }[]
  related_tools?: string[]
  requires_confirmation?: boolean
}
```

- [ ] **Step 1: Update ToolDefinition with optional enrichment fields and change `as const` to type annotations**

In `CommandsAllowlist.ts`:

1. Add optional enrichment fields to `ToolDefinition` interface
2. Change tool group declarations from `as const` to typed:
   - `const RUNTIME_TOOLS = { ... } as const` → `const RUNTIME_TOOLS: Record<string, ToolDefinition> = { ... }`
   - Same for `PLATFORM_TOOLS`, `BUILTIN_SERVICE_TOOLS`, `WEB3_OPERATOR_TOOLS`
   - For `RUNTIME_TOOL_ALIASES`: keep the spread pattern, add type annotation
   - For `BUILT_IN_TOOLS`: `export const BUILT_IN_TOOLS: Record<string, ToolDefinition> = { ... }`
3. Keep `dangerLevel: 'safe' as const` on individual entries where downstream code needs the literal

- [ ] **Step 2: Add enrichment to RUNTIME_TOOLS (5 tools)**

Add `when_to_use`, `examples`, `related_tools` to each entry. See the enrichment values in the spec doc — adding inline to each object literal.

Key entries:
- `schedule_task`: `when_to_use: ['user wants to schedule a recurring task', 'user says "remind me" or "every day at"']`
- `spawn_subagent`: `when_to_use: ['user asks to delegate a sub-task', 'need parallel research']`
- etc.

- [ ] **Step 3: Add enrichment to PLATFORM_TOOLS (4 tools)**

All elevated, all get `requires_confirmation: true`.

- [ ] **Step 4: Add enrichment to BUILTIN_SERVICE_TOOLS (5 remaining — get_trading_policy already done)**

- [ ] **Step 5: Add enrichment to WEB3_OPERATOR_TOOLS (12 tools)**

Read lane, Reason lane, Action lane — each with appropriate `when_to_use`, `examples`, `related_tools`, and `requires_confirmation` for Action lane tools.

- [ ] **Step 6: Verify aliases inherit enrichment**

`RUNTIME_TOOL_ALIASES` spreads from the originals. Since enrichment was added to the originals before the aliases are constructed (same file, sequential evaluation), the spread includes the new fields. The alias only overrides `name`. No separate alias enrichment needed.

- [ ] **Step 7: Run typecheck**

Run: `cd C:/LucidMerged/worker && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20`
Expected: No new errors

- [ ] **Step 8: Commit**

```bash
git add worker/src/agent/CommandsAllowlist.ts
git commit -m "feat: enrich all 27 tool entries with when_to_use, examples, related_tools"
```

---

## Chunk 3: Integrate buildToolPrompt + Split builtin-skills

### Task 6: Integrate buildToolPrompt into OpenClawAgent

**Files:**
- Modify: `worker/src/agent/OpenClawAgent.ts`

- [ ] **Step 1: Import buildToolPrompt**

```typescript
import { buildToolPrompt } from './tool-metadata/index.js'
import type { EnrichedToolDefinition } from './tool-metadata/index.js'
```

- [ ] **Step 2: Replace the tool list builder**

Find the tool prompt builder (~line 606). Replace the `toolList` construction:

```typescript
// Build enriched prompt for tools with metadata
const allowedEntries = allowlist.getAllowedTools()
const enrichedEntries = allowedEntries.filter(
  (t): t is EnrichedToolDefinition => Array.isArray((t as any).when_to_use) && (t as any).when_to_use.length > 0,
)
const toolAwarenessPrompt = buildToolPrompt(enrichedEntries)

// Fallback for unenriched tools (plugins, etc.) — dedup by name
const enrichedNames = new Set(enrichedEntries.map((t) => t.name))
const unenrichedList = mergedClientTools
  .filter((t: any) => !enrichedNames.has(t.function.name))
  .map((t: any) => `- ${t.function.name}: ${t.function.description}`)
  .join('\n')

const toolList = [toolAwarenessPrompt, unenrichedList]
  .filter(Boolean)
  .join('\n\n')
```

The `## Additional Tools` header and instruction text stays unchanged.

- [ ] **Step 3: Run existing agent tests**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/e2e-runtime-v2.test.ts`
Expected: All 11 tests still PASS

- [ ] **Step 4: Commit**

```bash
git add worker/src/agent/OpenClawAgent.ts
git commit -m "feat: use buildToolPrompt for auto-generated tool awareness in agent prompt"
```

### Task 7: Split builtin-skills into conditional tiers

**Files:**
- Modify: `worker/src/agent/skills/builtin-skills.ts`
- Modify: `worker/src/agent/skills/fetch-active-skills.ts`
- Modify: `worker/src/agent/OpenClawAgent.ts` (caller of fetchActiveSkills)
- Create: `worker/src/agent/__tests__/builtin-skills.test.ts`

- [ ] **Step 1: Write failing tests for conditional skill selection**

```typescript
// worker/src/agent/__tests__/builtin-skills.test.ts
import { describe, it, expect } from 'vitest'
import { getBuiltinSkills } from '../skills/builtin-skills.js'

describe('getBuiltinSkills', () => {
  it('always includes internal skills', () => {
    const skills = getBuiltinSkills({ wallet_enabled: false, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('lucid-trading-policy')
    expect(slugs).toContain('lucid-entitlements')
  })

  it('includes web3-reader when wallet enabled but trading disabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })

  it('includes web3-operator when trading enabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('web3-operator')
    expect(slugs).not.toContain('web3-reader')
  })

  it('excludes web3 skills when wallet disabled', () => {
    const skills = getBuiltinSkills({ wallet_enabled: false, trading_enabled: false })
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).not.toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })

  it('never loads both web3-reader and web3-operator simultaneously', () => {
    const combos = [
      { wallet_enabled: true, trading_enabled: true },
      { wallet_enabled: true, trading_enabled: false },
      { wallet_enabled: false, trading_enabled: true },
      { wallet_enabled: false, trading_enabled: false },
    ]
    for (const config of combos) {
      const slugs = getBuiltinSkills(config).map((s) => s.skill_slug)
      expect(slugs.includes('web3-reader') && slugs.includes('web3-operator')).toBe(false)
    }
  })

  it('web3-operator skill contains workflow and safety language', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const op = skills.find((s) => s.skill_slug === 'web3-operator')
    expect(op).toBeDefined()
    // Positive assertions — contains workflow structure
    expect(op!.sanitized_content).toMatch(/Read/i)
    expect(op!.sanitized_content).toMatch(/Reason/i)
    expect(op!.sanitized_content).toMatch(/Act/i)
    expect(op!.sanitized_content).toMatch(/safety|confirm|risk/i)
  })

  it('web3-operator skill does not contain tool routing table', () => {
    const skills = getBuiltinSkills({ wallet_enabled: true, trading_enabled: true })
    const op = skills.find((s) => s.skill_slug === 'web3-operator')
    expect(op).toBeDefined()
    // Should NOT have the old "Intent → tool_name" routing pattern
    expect(op!.sanitized_content).not.toMatch(/^- .+ \u2192 \w+$/m)
  })

  it('returns internal skills only when called without config', () => {
    const skills = getBuiltinSkills()
    const slugs = skills.map((s) => s.skill_slug)
    expect(slugs).toContain('lucid-trading-policy')
    expect(slugs).toContain('lucid-entitlements')
    expect(slugs).not.toContain('web3-reader')
    expect(slugs).not.toContain('web3-operator')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/builtin-skills.test.ts`
Expected: FAIL — current `getBuiltinSkills()` doesn't accept config param

- [ ] **Step 3: Rewrite builtin-skills.ts**

Replace entire content of `worker/src/agent/skills/builtin-skills.ts` with the conditional-tier version. Key structure:

```typescript
// Internal skills (stay permanently)
const tradingPolicySkill = { slug: 'lucid-trading-policy', ... }
const entitlementSkill = { slug: 'lucid-entitlements', ... }

// Generic skills (workflow/safety only, no tool routing)
const web3ReaderSkill = { slug: 'web3-reader', ... }
const web3OperatorSkill = { slug: 'web3-operator', ... }

// Selection logic
export function getBuiltinSkills(config?: { wallet_enabled?: boolean; trading_enabled?: boolean }): ActiveSkillRow[] {
  const skills = [tradingPolicySkill, entitlementSkill]
  if (config?.trading_enabled) skills.push(web3OperatorSkill)
  else if (config?.wallet_enabled) skills.push(web3ReaderSkill)
  return skills.map(toActiveSkillRow)
}
```

Full content is specified in the architecture spec. The web3 skills contain ONLY workflow sequencing (Read → Reason → Act) and safety rules — no tool-by-tool routing table.

- [ ] **Step 4: Update fetch-active-skills.ts**

Change signature to accept optional assistant config:

```typescript
// BEFORE
export async function fetchActiveSkills(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<ActiveSkillRow[]> {
  const builtin = getBuiltinSkills()

// AFTER
export async function fetchActiveSkills(
  supabase: SupabaseClient,
  assistantId: string,
  assistantConfig?: { wallet_enabled?: boolean; trading_enabled?: boolean },
): Promise<ActiveSkillRow[]> {
  const builtin = getBuiltinSkills(assistantConfig)
```

Third parameter is optional — existing callers work without changes.

- [ ] **Step 5: Update the caller in OpenClawAgent.ts**

Find where `fetchActiveSkills` is called (~line 623). Change:

```typescript
// BEFORE
const rows = await fetchActiveSkills(params.supabase, params.assistant.id)

// AFTER
const rows = await fetchActiveSkills(params.supabase, params.assistant.id, {
  wallet_enabled: params.assistant.wallet_enabled,
  trading_enabled: params.assistant.trading_enabled,
})
```

- [ ] **Step 6: Run tests**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/builtin-skills.test.ts`
Expected: All 8 tests PASS

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/`
Expected: No regressions

- [ ] **Step 7: Commit**

```bash
git add worker/src/agent/skills/builtin-skills.ts worker/src/agent/skills/fetch-active-skills.ts worker/src/agent/OpenClawAgent.ts worker/src/agent/__tests__/builtin-skills.test.ts
git commit -m "feat: split builtin-skills into conditional tiers, remove hand-written tool routing"
```

### Task 8: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `cd C:/LucidMerged && npx vitest run worker/src/agent/__tests__/`
Expected: All tests PASS (including 3 new test files)

- [ ] **Step 2: Run typecheck**

Run: `cd C:/LucidMerged/worker && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20`
Expected: No new type errors

- [ ] **Step 3: Manual smoke test**

Dev server should be running. Navigate to an assistant chat and verify:
- "what are my trading limits?" → agent uses `get_trading_policy` tool
- "what's the price of SOL?" → agent uses `get_price` tool
- Agent prompt in logs shows enriched tool descriptions (not bare `- name: description`)

- [ ] **Step 4: Final commit if needed**

```bash
git status
# Only commit if there are missed files
```
