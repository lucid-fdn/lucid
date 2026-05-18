# Tool & Skill Architecture — Organization Guide

## 4-Layer Architecture

### Layer 0: `@lucid-fdn/agent-tools-core` (public, MIT)

**Purpose:** Reusable automation primitives. The foundation that makes the rest of the architecture portable and open-source.

This is the bridge between "nice internal convention" and "real open-source reusable architecture."

**Organization:** Single small package (~200-300 lines).

```
@lucid-fdn/agent-tools-core/
  src/
    define-tool.ts         ← defineTool() helper + type enforcement
    types.ts               ← ToolDefinition, ToolMeta, ToolRegistryEntry
    build-prompt.ts        ← buildToolPrompt() auto-assembly from metadata
    compose-skill.ts       ← composeSkill() fragment assembly helper
    index.ts               ← barrel exports
```

**What it exports:**

```typescript
// Types — the contract everyone builds against
export interface ToolDefinition<T = unknown> {
  name: string
  description: string
  parameters: JSONSchema

  when_to_use: string[]
  category: 'read' | 'reason' | 'act' | 'runtime' | 'internal'
  danger_level: 'safe' | 'elevated'

  examples?: { user: string; tool_call: T }[]
  related_tools?: string[]
  requires_confirmation?: boolean
}

// Helper — enforces the shape, anyone can use
export function defineTool<T>(def: ToolDefinition<T>): ToolDefinition<T>

// Prompt builder — auto-generates tool awareness for any LLM
export function buildToolPrompt(tools: ToolDefinition[]): string

// Skill composition — assembles fragments into a complete skill
export function composeSkill(fragments: string[]): string
```

**Usage by anyone:**

```typescript
import { defineTool, buildToolPrompt } from '@lucid-fdn/agent-tools-core'

const myTool = defineTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: { type: 'object', properties: {}, required: [] },
  when_to_use: ['user asks for X'],
  category: 'read',
  danger_level: 'safe',
})

// Works with any LLM — OpenAI, Anthropic, local models
const toolPrompt = buildToolPrompt([myTool])
```

**Why this layer exists:**
- Without it, `defineTool()` and `buildToolPrompt()` are internal conventions locked inside LucidMerged
- With it, anyone can `npm install @lucid-fdn/agent-tools-core` and build tools with the same pattern
- `lucid-tools` packages use it for their tool definitions
- `LucidMerged` uses it for runtime prompt assembly
- Third-party developers use it to build compatible tools

### Layer A: `lucid-plugins` (public, MIT)

**Purpose:** Workflow discipline and safety policy. Human-authored, composable from fragments.

Skills teach the model:
- Workflow sequencing (Read → Reason → Act)
- Safety rules and confirmation discipline
- Domain judgment and business rules

Skills do NOT teach tool awareness — that's auto-generated from tool metadata via `agent-tools-core`.

**Organization:** Per vertical (use case).

```
lucid-plugins/
  skills/
    web3-trade/SKILL.md      ← swap workflow, risk rules, confirmation
    web3-defi/SKILL.md        ← yield comparison, protocol analysis
    web3-audit/SKILL.md       ← anomaly detection, reporting
    seo/SKILL.md              ← keyword research, content strategy
    recruit/SKILL.md          ← candidate search workflow
    ...
```

**Why per vertical, not per domain?**
Skills encode *workflow*, not capability. The same tool (`get_price`) is used differently depending on the use case:
- `web3-trade`: get_price → risk_check → confirm → swap
- `web3-defi`: get_price → compare yields → recommend
- `web3-audit`: get_price → flag anomaly → report

Same tool, different workflow. Skills are opinionated about the use case.

**Conditional loading (target state):**

| Skill tier | Loaded when | Purpose |
|------------|-------------|---------|
| `web3-reader` | `wallet_enabled=true`, `trading_enabled=false` | Read-only guidance |
| `web3-operator` | `trading_enabled=true` | Full Read → Reason → Act |

Never load both at once.

### Layer B: `lucid-tools` (public, MIT)

**Purpose:** Actual executable tool implementations + schemas. Reusable, provider-agnostic.

**Organization:** Per domain (shared capability).

```
lucid-tools/
  packages/
    web3-operator/     ← npm: @lucid/web3-operator
      src/
        read/          ← get_price, get_portfolio, search_token, wallet_history, get_quote
        reason/        ← risk_check, portfolio_snapshot, get_pnl
        act/           ← limit_order, dca_create, stop_loss, bridge
        schemas/       ← JSON Schema definitions for all tools (source of truth)
        types.ts       ← interfaces: SignerFn, RpcProvider, etc.
    web3-types/        ← npm: @lucid/web3-types (shared chain/token types)
    content/           ← npm: @lucid/content (generate, publish, schedule)
    search/            ← npm: @lucid/search (web search, token search)
```

**Why per domain, not per vertical?**
Tools get shared across verticals. `get_price` is used by trade, defi, and audit skills. Per-vertical tools would duplicate implementations.

**Mapping (skills → tools):**
```
Skills (1:many) → Tools
web3-trade       → web3-operator (read + reason + act)
web3-defi        → web3-operator (read + reason)
web3-audit       → web3-operator (read) + search
seo              → content + search
```

**Tool lanes (Read → Reason → Act):**

| Lane | Tools | Purpose |
|------|-------|---------|
| **Read** | get_price, get_portfolio, search_token, wallet_history, get_quote, wallet_balance, dex_get_quote, hl_account_info | Gather state |
| **Reason** | risk_check, portfolio_snapshot, get_pnl | Analyze safety, exposure, viability |
| **Act** | dex_swap, wallet_transfer, limit_order, dca_create, stop_loss, bridge, hl_place_order, hl_cancel_order | Plan or execute |

### Layer C: `LucidMerged` (private)

**Purpose:** Runtime + private platform layer. The product/runtime moat.

Contains:
- Auth, policy, allowlists
- Signer injection (Privy → `SignerFn`)
- Orchestration, observability
- Assistant config, dispatch glue
- Private SaaS-specific internal tools

```
LucidMerged/
  worker/
    src/agent/
      internal-tools/          ← private SaaS tools
        trading-policy.ts      ← get_trading_policy (Supabase query)
        entitlements.ts        ← billing/limits
        assistant-config.ts    ← org/assistant settings
      runtime-tools/           ← agent primitives (coupled to worker)
        scheduler.ts
        messaging.ts
        subagent.ts
      CommandsAllowlist.ts     ← imports schemas from lucid-tools, adds runtime policy
      BuiltInToolExecutor.ts   ← dispatch: imports tool functions, injects signer/context
      skills/
        builtin-skills.ts      ← hardcoded skills (migration target)
        fetch-active-skills.ts ← merges builtin + DB catalog skills
  src/                         ← SaaS web app
```

## Key Design Decisions

### Activation caps and runtime budgets are different guardrails

Lucid should enforce both:

- **agent-level activation cap** — limits how many tools an agent can keep active globally
- **run-level provider budget** — limits how many tools can be exposed to a specific engine/provider request

These are complementary, not interchangeable.

Current Lucid policy:
- hard cap: **100 active tools per agent**
- runtime budgeting still applies per engine/provider even below that cap

Why both matter:
- activation caps protect product UX, reduce accidental complexity, and make configuration understandable
- runtime budgets protect provider compatibility and prevent request-time failures
- neither one is sufficient by itself

Practical rule:
- do not treat "installed" or "activated" as "must be mounted on every turn"
- do not rely only on runtime pruning to rescue an over-configured agent
- do not remove the agent cap without replacing the user/operator affordances around it

Current implementation surface:
- shared cap helpers: `src/lib/plugins/assistant-tool-cap.ts`
- API enforcement + operator alerting: `src/app/api/assistants/[id]/plugins/route.ts`
- unified skills UI visibility + blocking: `src/components/skills/unified-skill-manager.tsx`

### Tools are provider-agnostic (signing is injected)

**Wrong (current):** Tool has Privy baked in.
```typescript
// tools/dex.ts — tightly coupled to Privy
async function toolDexSwap(args, ctx) {
  const signer = ctx.privySessionSigner  // ← Privy dependency in the tool
  ...
}
```

**Right (target):** Tool accepts a generic signer function. Runtime injects the provider.
```typescript
// lucid-tools/web3-operator/act/dex-swap.ts — provider-agnostic
export async function dexSwap(args: DexSwapParams, signer: SignerFn): Promise<SwapResult> { ... }

// LucidMerged/worker — runtime injection
const signer = createPrivySigner(ctx.privySession)
await dexSwap(args, signer)
```

**Why:** The tool itself is generic and open-sourceable. Privy is a runtime concern — LucidMerged injects it at dispatch time. Anyone using `@lucid/web3-operator` can plug in their own signer (Privy, Turnkey, Fireblocks, raw keypair).

### Schemas live in lucid-tools (source of truth), not CommandsAllowlist

**Current:** All schemas defined in `CommandsAllowlist.ts` (worker file).

**Target:** Schemas co-located with tool implementations in `lucid-tools/`. CommandsAllowlist imports them and adds runtime-specific policy (danger levels, allowlist categories).

```typescript
// lucid-tools/web3-operator/schemas/dex-swap.ts — public, open-source
export const dexSwapSchema = {
  name: 'dex_swap',
  description: 'Execute a token swap on a DEX aggregator',
  parameters: { ... }
}

// LucidMerged/CommandsAllowlist.ts — private, adds runtime policy
import { dexSwapSchema } from '@lucid/web3-operator/schemas'
export const TOOL_REGISTRY = {
  dex_swap: { ...dexSwapSchema, dangerLevel: 'elevated', category: 'trading' }
}
```

### Tools are plain npm exports, NOT MCP servers

**MCP is a transport protocol, not a tool format.**

| Format | Use case | Latency |
|--------|----------|---------|
| npm import (plain function) | Built-in tools, first-party tools | ~0ms |
| MCP InMemoryTransport | Third-party plugins running in-process | ~1-5ms |
| MCP HTTP (MCPGate) | Community plugins, external isolation | ~50-200ms |

Built-in tools from `lucid-tools` should be plain function exports, imported directly by the worker. No MCP wrapper needed for tools you own.

MCP is only needed for:
- Third-party plugin discovery (user-installed plugins)
- External service isolation (untrusted code)

## What Goes Where

### Public (open-sourceable) — `lucid-tools/` and `lucid-plugins/`

- Skills (SKILL.md files, references, examples)
- Tool implementations (provider-agnostic functions)
- Tool schemas (JSON Schema definitions)
- Shared types and interfaces (`SignerFn`, `RpcProvider`, chain types)

### Private (stays in LucidMerged)

- Signer injection (Privy session → `SignerFn`)
- Trading policy resolution (Supabase queries)
- Org/assistant config resolution
- Entitlement/billing logic
- Runtime auth and session management
- Deployment/orchestration logic
- Internal analytics/state tools
- CommandsAllowlist runtime policy (danger levels, categories)

### Decision rule

> If it touches your DB, auth, billing, policy, or signing provider → private.
> If it's provider-agnostic and reusable by anyone with any signer → public.

## Internal Tools & Skills (LucidMerged — Private)

LucidMerged should not contain reusable generic business tools long-term. But it **should** own private SaaS-specific tools and skills that depend on private infrastructure (Supabase, Privy, org context, RLS).

### Internal Tools

Follow the same pattern as public tools (function + schema), but live inside the worker and are allowed to depend on private infrastructure directly — no injection needed.

**Organization:**
```
worker/src/agent/
  internal-tools/
    trading-policy.ts          ← implementation (Supabase query)
    trading-policy.schema.ts   ← schema (not exported publicly)
    entitlements.ts
    entitlements.schema.ts
    assistant-config.ts
    assistant-config.schema.ts
    index.ts                   ← barrel: exports functions + schemas
```

**What belongs here:**
- `get_trading_policy` — reads trading_policies + trading_daily_usage
- Entitlement checks — billing limits, feature gates
- Org settings — workspace config, team permissions
- Assistant config — memory strategy, model routing
- Deployment state — agent lifecycle management
- Memory/platform state — cross-run context
- Internal analytics/permissions

These are dispatch-level concerns that require Supabase context, org scoping, and RLS.

**Difference from public tools:**
| Concern | Public tools (`lucid-tools/`) | Internal tools (`internal-tools/`) |
|---------|------------------------------|-------------------------------------|
| Dependencies | Provider-agnostic, `SignerFn` injection | Can use Supabase, Privy, org context directly |
| Schemas | Source of truth, open-source | Private, registered in CommandsAllowlist |
| npm package | Yes (cross-repo import) | No (local file import) |
| Open-sourceable | Yes | No |

### Internal Skills (Built-in Platform Guidance)

Internal skills are product-owned prompt guidance that ships with the worker. Two approaches:

| Approach | Pros | Cons |
|----------|------|------|
| **Code-level** (`builtin-skills.ts`) | Always available, no DB dependency, deploys with worker, graceful degradation | Requires redeploy to change |
| **DB-backed** (`skill_catalog`, `status=internal`) | Edit without redeploy, same governance as catalog skills | DB dependency, could fail to load |

**Recommendation:** Keep code-level for now. These are core product guidance — they should always work even if the DB is down. The `fetchActiveSkills()` merge already handles graceful degradation (built-ins work if DB fails).

**Target organization within `builtin-skills.ts`:**

```typescript
// ── Internal-only skills (stay here permanently) ──────────────────────
// These reference private internal tools and SaaS-specific workflows.

const tradingPolicySkill = {
  slug: 'lucid-trading-policy',
  name: 'Trading Policy',
  content: `Use get_trading_policy when the user asks about trading limits,
    allowed chains, daily usage, or trading settings. Read-only.`
}

const entitlementSkill = {
  slug: 'lucid-entitlements',
  name: 'Entitlement Awareness',
  content: `Before elevated actions, check entitlements. When denied,
    explain the limit and suggest upgrade path.`
}

// ── Generic skills (migrate to lucid-plugins/ eventually) ──────────────
// These are currently hardcoded but should become SKILL.md files.

const web3ReaderSkill = {
  slug: 'web3-reader',
  name: 'Web3 Reader',
  content: `Read-only guidance: balance, price, portfolio, history, search.
    Ambiguity rules, balance vs portfolio priority, explorer fallback.`
}

const web3OperatorSkill = {
  slug: 'web3-operator',
  name: 'Web3 Operator',
  content: `Full Read → Reason → Act: risk flow, simulation-first,
    confirmation rules, execution-plan structure, safety rules.`
}
```

**Conditional selection logic:**

```typescript
function getBuiltinSkills(assistant: AssistantConfig): BuiltinSkill[] {
  const skills: BuiltinSkill[] = []

  // ── Always include internal skills ──
  skills.push(tradingPolicySkill, entitlementSkill)

  // ── Conditional public skill tier (mutually exclusive) ──
  if (assistant.trading_enabled) {
    skills.push(web3OperatorSkill)   // includes all reader guidance + act lane
  } else if (assistant.wallet_enabled) {
    skills.push(web3ReaderSkill)     // read-only, no act lane
  }

  return skills
}
```

**Rules:**
- Internal skills (reference private tools) → stay in `builtin-skills.ts` permanently
- Generic skills (reference public tools) → migrate to `lucid-plugins/` as SKILL.md files, loaded via skill catalog
- Never load `web3-reader` and `web3-operator` at the same time
- Internal skills are always loaded regardless of assistant config

## npm Packaging Rules

**Must be npm package** when:
- Consumed by LucidMerged worker from an external repo
- Shared types used across repos

**Does not need npm** when:
- Skills are DB-backed (imported via CLI → `skill_catalog` table)
- Private internal tools (local files in LucidMerged)
- Only used within their own monorepo (use workspace imports)

**Rule:** npm publish is a deployment mechanism, not an architecture requirement. Same repo = workspace imports. Cross-repo = npm package.

## Tool Allowlist Strategy

### Current (fragile)
Exact hardcoded tool lists in DB freeze assistants in time. New safe tools never appear automatically.

### Target
- Safe read tools auto-available by default
- Elevated/write tools explicitly gated
- Permissions by capability/category, not frozen tool-name snapshots

```
safe read    → auto-include (get_price, get_portfolio, search_token, ...)
elevated     → explicit allow (dex_swap, wallet_transfer, hl_place_order, ...)
internal     → always available to runtime (get_trading_policy, ...)
```

## Current State vs Target

| Concern | Current | Target |
|---------|---------|--------|
| Skill guidance | Hardcoded in `builtin-skills.ts` | SKILL.md files in `lucid-plugins/` per vertical |
| Skill loading | One `lucid-web3-tools` always loaded | Conditional: `web3-reader` or `web3-operator` |
| Tool implementations | Mixed: 12 in `@lucid-fdn/web3-operator`, rest hardcoded in worker | All generic tools in `lucid-tools/` packages (plain npm exports) |
| Tool schemas | All in `CommandsAllowlist.ts` | Source of truth in `lucid-tools/`, CommandsAllowlist imports + adds policy |
| Signing | Privy baked into tool implementations | Tools accept `SignerFn`, runtime injects Privy |
| MCP servers | In `lucid-plugins/` repo (mixed with skills) | Skills in `lucid-plugins/` (SKILL.md only). MCP only for third-party plugin transport |
| Private tools | `get_trading_policy` inline in executor | Extracted to `worker/src/agent/internal-tools/` |
| Tool awareness | Manual routing table in `builtin-skills.ts` | Auto-generated from rich tool metadata (`when_to_use`, `examples`) |
| Tool allowlist | Hardcoded tool name lists | Capability-based policy |
| Repo structure | `lucid-plugins` (mixed), no `lucid-tools` | `lucid-plugins` (guidance) + `lucid-tools` (code + schemas) + `LucidMerged` (runtime) |

## Migration Path

Do not big-bang. Migrate feature-by-feature:

1. **Extract `get_trading_policy`** to `worker/src/agent/internal-tools/trading-policy.ts` (stays private)
2. **Define `SignerFn` interface** in `lucid-tools/web3-types/` — decouple tools from Privy
3. **Add rich metadata to tool definitions** — `when_to_use`, `examples`, `category`, `danger_level`, `related_tools`. Start with existing tools, use `defineTool()` helper.
4. **Auto-generate tool prompt** — runtime reads metadata, replaces hand-written routing table in `builtin-skills.ts`. Skills shrink to workflow + safety only.
5. **Move tool schemas** from `CommandsAllowlist.ts` to `lucid-tools/` packages. CommandsAllowlist imports and adds runtime policy.
6. **Move generic tool implementations** (`wallet.ts`, `dex.ts`, `hyperliquid.ts`, `content.ts`, `code-interpreter.ts`) to `lucid-tools/` packages. BuiltInToolExecutor imports from npm + injects signer.
7. **Split `lucid-plugins` repo** — move MCP server code to wherever it belongs (some may become tool tests/examples in `lucid-tools`). Keep only SKILL.md guidance files.
8. **Split `builtin-skills.ts`** into conditional `web3-reader` / `web3-operator` tiers (workflow/safety only, no tool routing)
9. **Implement capability-based tool allowlist** (replace frozen name lists)

Each step is independently deployable. Temporary barrels are okay but short-lived.

## Automated Tool Awareness

### The Problem

Adding one tool today = updating 3-4 places:
1. Implementation (`tools/dex.ts`)
2. Schema (`CommandsAllowlist.ts`)
3. Skill guidance (`builtin-skills.ts` — "use X when user asks Y")
4. Maybe a SKILL.md in lucid-plugins

Step 3 is the maintenance bottleneck. The agent doesn't know about new tools unless someone manually teaches it.

### The Solution: Enriched Metadata Registry

Enrich the existing `CommandsAllowlist.ts` with `when_to_use`, `examples`, `related_tools`. No tool implementation changes needed — metadata is separate from implementation.

**What exists today:**
```typescript
get_price: {
  name: 'get_price',
  description: 'Get current USD price of a token',
  category: 'web3',
  dangerLevel: 'safe',
  parameters: { ... }
}
```

**What you add (same file, same object):**
```typescript
get_price: {
  name: 'get_price',
  description: 'Get current USD price of a token',
  category: 'web3',
  dangerLevel: 'safe',
  parameters: { ... },
  // ── Enrichment (new fields) ──
  when_to_use: ['user asks "price of X"', 'need current value before swap'],
  examples: [{ user: 'what is SOL worth?', tool_call: { chain: 'solana', address: 'SOL' } }],
  related_tools: ['search_token', 'get_portfolio'],
}
```

Zero migration. Existing tools are already compatible — just add the new fields to the existing registry entries. Implementations (`tools/dex.ts`, `@lucid-fdn/web3-operator`, etc.) don't change. They don't read their own metadata — the runtime does.

**Enriched metadata shape:**
```typescript
interface ToolRegistryEntry {
  // ── Already have these ──
  name: string
  description: string
  parameters: JSONSchema
  category: string
  dangerLevel: 'safe' | 'elevated'

  // ── New enrichment fields ──
  when_to_use: string[]                              // required
  examples?: { user: string; tool_call: unknown }[]  // optional
  related_tools?: string[]                           // optional, hints only
  requires_confirmation?: boolean                    // optional, for elevated tools
}
```

This applies to **all tools** — public, internal, and already-extracted. All 27 tools get enriched in the same registry.

### Short-Term vs Long-Term

| Timeframe | Where metadata lives | Why |
|-----------|---------------------|-----|
| **Now** | Centralized in `CommandsAllowlist.ts` | One file, zero refactoring, immediate value |
| **Later** | Co-located with tool in `lucid-tools/` packages | Metadata moves with the tool when extracted |

### What's Automated vs What Stays Manual

| Concern | Source | Automated? |
|---------|--------|-----------|
| "This tool exists and does X" | `description` | Yes — from schema |
| "Use it when user says Y" | `when_to_use` | Yes — from metadata |
| "Here's an example" | `examples` | Yes — from metadata |
| "It's a read/write/elevated tool" | `category`, `dangerLevel` | Yes — from metadata |
| "Often used alongside Z" | `related_tools` | Yes — hints only, not hard constraints |
| Read → Reason → Act workflow | Skill | No — manual (workflow is opinionated) |
| "Always simulate before execute" | Skill | No — manual (safety policy) |
| "Require confirmation above $500" | Skill | No — manual (business rule) |
| "Never act when policy denies" | Skill | No — manual (domain judgment) |

**Rule:** Tool metadata owns "what this tool is for." Skills own "how to operate safely across multiple tools."

### Runtime Auto-Assembly

The runtime builds the tool awareness section of the prompt automatically from the enriched registry:

```typescript
function buildToolPrompt(tools: ToolRegistryEntry[]): string {
  return tools
    .map(t => {
      let section = `## ${t.name}\n${t.description}\n`
      if (t.when_to_use?.length) {
        section += `Use when: ${t.when_to_use.join('; ')}\n`
      }
      if (t.related_tools?.length) {
        section += `Often used with: ${t.related_tools.join(', ')}\n`
      }
      if (t.examples?.length) {
        section += `Example: "${t.examples[0].user}"\n`
      }
      return section
    })
    .join('\n')
}
```

This replaces the hand-written routing table in `builtin-skills.ts`:
```
// BEFORE (manual, breaks when you add a tool)
- Balance of a specific token → wallet_balance
- Price of a token → get_price
- Portfolio value → get_portfolio
...

// AFTER (auto-generated from enriched registry)
// Runtime reads when_to_use from CommandsAllowlist entries
// No manual update needed when adding tools
```

### What Changes When You Add a New Tool

**Before (3-4 places):**
1. Write implementation
2. Add schema to CommandsAllowlist
3. Update builtin-skills.ts routing table
4. Maybe update SKILL.md

**After (1 place):**
1. Write implementation + add enriched entry to CommandsAllowlist (schema + `when_to_use` + `examples`)
2. Done — runtime auto-generates prompt, skills reference categories not tool names

### Important: `related_tools` Are Hints, Not Hard Constraints

- **OK:** "often used after search_token" — helps the LLM discover useful patterns
- **Not OK:** system enforces a strict tool call graph — overfits tool order, breaks on edge cases

The LLM should remain free to use tools in whatever order makes sense for the user's query. Hints help. Hard constraints hurt.

## Semi-Automated Skills

Skills contain workflow discipline, safety policy, and domain judgment — they can't be fully auto-generated. But maintenance can be reduced significantly.

### Three Automation Levers

**1. Compose from reusable rule fragments**

Instead of one monolithic SKILL.md per vertical, skills assemble from shared building blocks:

```yaml
# web3-operator/SKILL.md
compose:
  - rules/read-before-act.md          # shared across all web3 skills
  - rules/simulation-first.md         # shared across trade + defi
  - rules/confirmation-threshold.md   # shared across trade + defi
  - workflows/swap-flow.md            # specific to trade
```

Write a rule once, reuse across verticals. New vertical? Pick from existing rules, only write the new workflow-specific parts.

**2. Reference categories, not hardcoded tool names**

Skills should reference tool lanes/categories instead of listing specific tool names:

```markdown
# BEFORE (breaks when you add a tool)
Always run risk_check before dex_swap, wallet_transfer, hl_place_order, hl_cancel_order.

# AFTER (auto-expands from category metadata)
Always run a Reason-lane tool before any Act-lane tool.
```

Runtime resolves `Act-lane` → `[dex_swap, wallet_transfer, hl_place_order, ...]` from tool metadata. Add a new Act tool? The skill automatically covers it.

**3. Inject policy values from DB, don't duplicate in skill text**

Some "skill" content is really just config that already lives in the database:

```
confirmation_threshold_usd: 500   ← already in trading_policies table
allowed_chains: [solana, ethereum]  ← already in trading_policies table
daily_limit_usd: 1000              ← already in trading_policies table
```

Don't duplicate these in skill text. The skill just says "respect the trading policy" — the runtime injects actual values from `get_trading_policy` at execution time.

### What's Automated vs Manual in Skills

| Concern | Approach |
|---------|----------|
| Tool list in a skill | Auto-expanded from categories — never hardcode tool names |
| Policy thresholds | Read from DB at runtime — skill says "respect policy" |
| Shared rules (simulate-first, read-before-act) | Compose from reusable fragments — write once |
| Workflow sequencing (Read → Reason → Act) | Manual — human-authored, opinionated |
| Safety judgment ("explain risk to user") | Manual — human-authored, domain-specific |
| New vertical bootstrapping | Semi-auto — pick existing rule fragments + write new workflow |

### Target Skill Structure

```markdown
# web3-operator SKILL.md

## Workflow: Read → Reason → Act
Always gather state before reasoning. Always reason before acting.

## Safety Rules
- Run a Reason-lane tool before any Act-lane tool
- Simulate trades before execution (dry-run first)
- Respect the trading policy (limits, chains, confirmation threshold from DB)
- If risk assessment returns high risk, explain and ask for confirmation

## Sequencing Discipline
- Never skip the Reason step
- Never act on stale data (re-read if >60s old)
```

No "use get_price when the user asks about price" — that's auto-generated from tool metadata.
No "confirmation above $500" — that's read from `trading_policies` table at runtime.
No hardcoded tool names in safety rules — references lane categories instead.

### Summary

| Layer | Automation level | Owned by |
|-------|-----------------|----------|
| Tool awareness (what exists, when to use) | **Fully automated** from enriched metadata | Tool registry |
| Tool list in skills | **Automated** via category references | Runtime expansion |
| Policy values in skills | **Automated** via DB injection | Runtime |
| Shared rules across skills | **Semi-automated** via composable fragments | Human-authored once, reused |
| Workflow discipline & safety judgment | **Manual** | Human-authored per vertical |

## Service Infrastructure

Generic services that can be extracted to `lucid-tools/`:
- `services/dex/jupiter.ts` — Jupiter API client
- `services/dex/oneinch.ts` — 1inch API client
- `services/chain/rpc-fallback.ts` — Multi-provider RPC with failover
- `services/chain/circuit-breaker.ts` — Per-service circuit breaker

Services that stay in LucidMerged (SaaS-specific):
- `services/session-signer/` — Privy signing proxy → Next.js internal API
- `services/x402/` — x402 payment protocol (org billing context)

## Full Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 0: @lucid-fdn/agent-tools-core  (public, ~200 lines)       │
│  ─────────────────────────────────────────────────────────────────  │
│  defineTool()  ·  ToolDefinition types  ·  buildToolPrompt()       │
│  composeSkill()  ·  category/lane types                            │
│  The reusable foundation — anyone can npm install and use          │
└──────────┬──────────────────────┬──────────────────────┬───────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
│  Layer A:        │  │  Layer B:        │  │  Layer C:              │
│  lucid-plugins   │  │  lucid-tools     │  │  LucidMerged           │
│  (public)        │  │  (public)        │  │  (private)             │
│                  │  │                  │  │                        │
│  SKILL.md files  │  │  Tool packages   │  │  Runtime assembly      │
│  per vertical    │  │  per domain      │  │  Policy enforcement    │
│                  │  │                  │  │  Signer injection      │
│  Workflow rules  │  │  Implementations │  │  Internal tools        │
│  Safety policy   │  │  + schemas       │  │  CommandsAllowlist     │
│  Composable      │  │  Uses            │  │  (imports schemas,     │
│  fragments       │  │  defineTool()    │  │   adds runtime policy) │
│  Category refs   │  │  from core       │  │  buildToolPrompt()     │
│  (not tool names)│  │                  │  │  from core             │
└──────────────────┘  └──────────────────┘  └────────────────────────┘

What each layer owns:
  core   → "how to define a tool" (types, helpers, prompt builder)
  skills → "how to operate safely" (workflow, safety, judgment)
  tools  → "what the tool does" (implementation + rich metadata)
  runtime→ "who can use what" (policy, auth, signing, assembly)
```

### Relationship Rules

| From | To | Relationship |
|------|----|-------------|
| `agent-tools-core` | — | Depends on nothing. Pure types + helpers. |
| `lucid-tools` | `agent-tools-core` | Uses `defineTool()` for tool definitions |
| `lucid-plugins` | `agent-tools-core` | Uses category/lane types for references (optional) |
| `LucidMerged` | `agent-tools-core` | Uses `buildToolPrompt()`, `ToolDefinition` types |
| `LucidMerged` | `lucid-tools` | Imports tool functions + schemas |
| `LucidMerged` | `lucid-plugins` | Loads SKILL.md content via skill catalog |
| `lucid-plugins` | `lucid-tools` | References tool names/categories in guidance (text only, no code import) |

### Open-Source Reusability

| Package | Reusable by anyone? | What they get |
|---------|--------------------|--------------|
| `@lucid-fdn/agent-tools-core` | Yes | Build tools with rich metadata, auto-generate prompts for any LLM |
| `lucid-tools` packages | Yes | Ready-made web3/content/search tools, plug in any signer |
| `lucid-plugins` | Yes | Workflow templates for common agent verticals |
| `LucidMerged` | No | Your product moat — runtime, policy, internal tools |
