---
slug: lucid-knowledge
name: Lucid Knowledge Operations
description: Use Lucid's shared Memory and Knowledge operation contract safely across runtimes and channels.
category: knowledge
version: "1.0"
author: Lucid
trust_tier: lucid_first_party
capability_tier: tool_backed
engine_support:
  - engine: openclaw
    support_level: adapted
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay, runtime_native]
  - engine: hermes
    support_level: adapted
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay]
---

# Lucid Knowledge Operations

Use this skill when an agent needs to retrieve, explain, write, correct, or govern Lucid Knowledge through the shared operation contract.

## Rule

Call the Knowledge operation API instead of reading memory, RAG, source, evidence, graph, or L2 tables directly.

The contract endpoint is:

```http
GET /api/knowledge/operations
POST /api/knowledge/operations
```

Worker and external-agent callers should use the worker bridge client in `worker/src/knowledge/operations-client.ts` when available.

## Core Operations

- `knowledge.retrieve_context` gets a bounded `KnowledgePromptPacket` for a query and scope.
- `knowledge.explain` answers why Lucid knows a fact, including source, evidence, timeline, and versions.
- `knowledge.write_project` writes or corrects project brain with evidence.
- `knowledge.write_team` writes or corrects team brain with evidence.
- `knowledge.remember_org` stores lightweight org context or policy.
- `knowledge.forget_org` removes obsolete org board memory.
- `knowledge.list_sources` inspects source governance.
- `knowledge.update_source` changes source policy, retrieval inclusion, trust, federation, retention, or status.
- `knowledge.list_entities` searches graph entities.
- `knowledge.graph_neighbors` expands one graph entity.
- `knowledge.update_maintenance_event` triages Brain Ops findings.

## Safety

- Read operations require workspace membership.
- Write and governance operations require admin or owner.
- Do not promote engine-local state into Lucid Knowledge unless it is compact, provenanced, policy-approved, and reversible.
- Do not place raw browser sessions, raw channel transcripts, or engine home files into shared Knowledge.
- Use evidence handles whenever writing or correcting project/team knowledge.
