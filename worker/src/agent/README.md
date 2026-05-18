# Agent Runtime

Runs AI agent loops through an engine runner seam. OpenClaw is the stable embedded runtime today; Hermes is integrated through the same platform contracts with runtime-flavor-aware governance and dedicated native mutation support. The worker owns the engine-agnostic tool, governance, and runtime contracts.

## Architecture

```
processInboundEvent() / agentStream()
  → engines.runAgent()
      ├─ OpenClawEngineRunner.run()
      │   → OpenClawAgent.runOpenClawAgent()
      │       ├─ FEATURE_RUNTIME_V2=false → legacyRunOpenClawAgent()
      │       └─ FEATURE_RUNTIME_V2=true  → getRuntime('embedded').runTurn()
      │           ├─ buildAgentToolRuntime() → ToolSurface (client tools + executor + policy)
      │           └─ runEmbeddedPiAgent() → OpenClaw agent loop
      └─ HermesEngineRunner.run()
          → buildPrompt() + runHermesPromptDetailed()
          → governance usage estimate + timeout enforcement
```

## Key Files

| File | Purpose |
|------|---------|
| `OpenClawAgent.ts` | Main entry: context injection, model routing, prompt ordering, session isolation |
| `ConversationCompactor.ts` | Rolling summary generation (threshold 14 msgs, keep recent 6) |
| `contracts/` | Engine-agnostic tool/governance contracts wrapping existing implementations |
| `model-router.ts` | Deterministic fast/strong lane routing |
| `PluginBridge.ts` | Plugin execution: embedded MCP (first-party) vs HTTP (MCPGate) |
| `CommandsAllowlist.ts` | Tool schemas, capability gating, policy config |
| `BuiltInToolExecutor.ts` | 3-path dispatch: runtime tools → platform tools → built-in |
| `embedded-plugin-loader.ts` | 18 first-party MCP plugin factories |
| `board-memory-loader.ts` | Org-level shared knowledge (8K cap, XML delimiter) |

## Subdirectories

| Dir | Purpose |
|-----|---------|
| `runtime/` | AgentRuntime interface: EmbeddedRuntime + GatewayRuntime (stub) |
| `contracts/` | Engine-agnostic contracts: tool runtime, governance, usage estimation |
| `tool-surface/` | Tool assembly: builder, executor, deny list, collision guard |
| `runtime-tools/` | Agent primitives: scheduler, messaging, subagent, crew, soul |
| `platform-tools/` | Elevated tools: wallet, DEX, Hyperliquid, Polymarket |
| `tools/` | Built-in tools: web3-operator, content, code-interpreter |
| `skills/` | Skill system: built-in + catalog merge, snapshot builder |
| `oauth-tools/` | Nango integration tools (282 actions across 36 providers) |

## Prompt Ordering (Stable → Variable)

```
1. [STABLE]      System prompt (persona/instructions)
2. [STABLE]      ## Additional Tools
3. [STABLE]      Name suppression
3.5 [STABLE]     ## Agent Identity (soul_content)
4. [SEMI-STABLE] ## Memories (per-user)
4.5 [SEMI-STABLE] ## Organization Knowledge (board memory)
4.6 [SEMI-STABLE] ## Crew Context
5. [VARIABLE]    ## Conversation Summary
6. [VARIABLE]    ## Recent Conversation
```

Stable prefix enables provider prompt caching.

## Tool Execution (Two-Tier)

```
Tool call arrives
  ├─ Engine runtime asks AgentToolRuntime for a tool surface
  ├─ Built-in? → BuiltInToolExecutor
  │   ├── @lucid-fdn/web3-operator (12 tools)
  │   ├── runtime-tools/ (7 tools)
  │   ├── platform-tools/ (5 tools, Privy signing)
  │   └── tools/ (other built-in)
  └─ Plugin? → PluginBridge
      ├── First-party → Embedded MCP (~1-5ms)
      └── Community → MCPGate HTTP (~50-200ms)
```

Hermes currently consumes the same platform contracts with engine-specific behavior preserved:
- Lucid-governed tools run through the shared bridge and governance helpers
- shared Hermes explicitly denies durable native memory/skill mutation today; this is the active rollout policy, not an implicit fallback
- `candidate_only` is implemented in the policy model but remains dormant until an explicit shared-learning rollout is approved
- durable native mutation belongs in `c1_managed` and `c2a_autonomous`
- dedicated Hermes can execute native `memory` and `skill_manage` mutations locally inside the runtime process
- native mutation proposals, reviews, and promotions are surfaced back to Mission Control through the control-plane event and persistence layer

## Native Mutation Lifecycle

Hermes-native mutation now follows an explicit lifecycle instead of ad hoc local writes:

1. runtime flavor determines mutation policy:
   - `shared` → `deny`
   - `c1_managed` / `c2a_autonomous` → `allow`
   - `candidate_only` exists for later staged-learning rollout
2. dedicated Hermes may execute native `memory` / `skill_manage` mutations locally
3. the runtime emits typed native mutation candidate events to Lucid
4. Mission Control persists, reviews, approves, rejects, or promotes those candidates
5. memory promotions can apply into assistant/org durable memory
6. promoted skills can become org-private installed skills and later be published into the broader catalog flow

## SaaS Adaptations (vs OpenClaw defaults)

| Adaptation | Why |
|------------|-----|
| Per-run session isolation | Multi-tenant: `$TMPDIR/lucid-openclaw-sessions/<runId>/`, wiped after |
| `skills.load.disabled: true` | Prevent filesystem skill scanning (cross-tenant risk) |
| `plugins.enabled: false` | Prevent auto-loading via jiti |
| web_fetch size pinning (2MB/50K) | Prevent upstream defaults from inflating shared SaaS memory |
| Null content interceptor | TrustGate rejects `content: null` (OpenAI spec allows it) |
