# Agent Memory

Memory gives your agents the ability to remember information about users across conversations. Instead of starting fresh every time, agents can recall preferences, facts, and context from previous interactions.

Agent Memory is one layer of [Lucid Knowledge](../knowledge-base/lucid-knowledge.md). Lucid Knowledge is the broader workspace brain that also includes project facts, team operating knowledge, documents, source governance, evidence, Brain Ops, and optional Lucid-L2 proof pointers. Use Agent Memory for user-scoped preferences and facts; use the Knowledge Manager at `/<workspace>/knowledge` for governed workspace, project, team, document, and source management.

Lucid also has a separate [Agent Identity And Operating Context](operating-context.md) model. Agent identity documents describe the agent itself. Shared context records describe the workspace, project, team, agent-facing work context, or user context the agent should consider.

## How Memory Works

Lucid's memory system operates automatically in the background:

1. **Extraction** — After each conversation turn, the system analyzes the conversation and extracts important facts (e.g., "User prefers dark roast coffee", "User's company is Acme Corp")
2. **Deduplication** — Extracted facts are checked against existing memories to avoid duplicates
3. **Embedding** — Each memory is converted to a vector embedding for semantic search
4. **Storage** — Memories are stored encrypted and scoped to the specific user
5. **Recall** — Before each response, the agent receives bounded Knowledge context that can include relevant assistant memories, project/team/org facts, documents, and evidence depending on scope and policy

## Memory Categories

Memories are automatically categorized:

| Category | Examples |
|----------|---------|
| **Fact** | "User works at Acme Corp", "User has 3 employees" |
| **Preference** | "User prefers concise answers", "User likes technical details" |
| **Instruction** | "Always greet by name", "Don't suggest competitor products" |
| **Context** | "User is migrating from AWS to GCP", "Working on Q2 budget" |

## Memory Settings

Configure memory on your agent's detail page:

### Memory Enabled

Master switch. When disabled, the agent doesn't extract or recall memories. Default: **enabled**.

### Memory Strategy

Controls how often memories are extracted:

| Strategy | Behavior | Best For |
|----------|----------|----------|
| **Auto** | Extract every 5 conversation turns | Most agents (default) |
| **Aggressive** | Extract every turn | High-value conversations |
| **Conservative** | Extract every 10 turns | Cost-sensitive deployments |
| **Off** | Never extract (recall still works) | When you only want manual memories |

### Memory Window Size

How many recent memories to load before each response. Default: **10**. Higher values give more context but increase token usage.

## Privacy and Security

- **User-scoped** — Memories are isolated per user per channel. No cross-user leakage.
- **Encrypted at rest** — Memory content is encrypted using AES-GCM-256 with per-tenant keys.
- **Org-isolated** — Row-level security ensures memories never cross organization boundaries.
- **No training** — Memories are never used to train AI models.

## Relationship To Knowledge And RAG

Agent Memory is optimized for user-specific continuity. Knowledge/RAG is optimized for company knowledge, project facts, team process, source documents, and governed retrieval.

- Use **Agent Memory** for preferences, user facts, recurring instructions, and conversation-derived context.
- Use **Lucid Knowledge** for workspace, project, team, and document-backed facts that multiple agents or channels should reuse.
- Use **Knowledge Claims** for evidence-backed beliefs, risks, decisions, hunches, bets, and preferences that need confidence, provenance, lifecycle status, and retrieval citations.
- Use **Knowledge Think** when an agent or operator needs a scoped synthesis from memory, claims, RAG, graph/evidence, and search results.
- Use **Shared Operating Context** for thesis, signals, feedback, Daily Intel, shared memory, decisions, policy, risks, and open questions across workspace, project, team, agent, or user scopes.
- Use **Agent Identity Documents** for agent-only identity and rules: `SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, and `CURRENT_CONTEXT`.
- Use **source governance** to pause, archive, approve, or exclude documents and sources from retrieval.
- Use **Mission Control → Knowledge** for deeper operator review, Brain Ops, retrieval eval replay, graph provenance, engine-home candidates, and Lucid-L2 proof status.

## Best Practices

- **Start with auto strategy** — It balances memory quality with cost
- **Monitor memory extraction** — Check Mission Control's conversation intelligence and Knowledge surfaces for extraction success, citations, and recall quality
- **Write prompts that encourage sharing** — Agents that ask good questions get better memories
- **Don't over-rely on memory** — Important company knowledge should also be captured in Lucid Knowledge with source governance and evidence
