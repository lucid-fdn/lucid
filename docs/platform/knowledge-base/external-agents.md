# External Agents And Lucid Knowledge

Lucid Knowledge can be used by BYO, C2A, local, and MCP-style agents without giving those agents database credentials.

The product rule is simple:

- operators create a scoped external Knowledge client in Mission Control
- the token is shown once
- the client receives an HTTP endpoint and MCP config
- every operation is routed through the shared Knowledge operation contract
- every operation is audited in `knowledge_operation_events`

## Endpoints

HTTP operation endpoint:

```text
POST /api/knowledge/external/operations
Authorization: Bearer <lkc_token>
```

MCP-style endpoint:

```text
GET /api/knowledge/mcp
POST /api/knowledge/mcp
Authorization: Bearer <lkc_token>
```

The HTTP endpoint accepts the canonical shape:

```json
{
  "operation": "knowledge.retrieve_context",
  "input": {
    "query": "What should this agent know before continuing?"
  }
}
```

For compatibility with simple local clients, flattened legacy calls also work:

```json
{
  "operation": "knowledge.think",
  "query": "What changed since the last run?",
  "mode": "answer"
}
```

Transcript and artifact imports use the same endpoint. Local agents should create an import job, preview redacted/deduped items, then commit only approved preview items:

```json
{
  "operation": "knowledge.imports.preview",
  "input": {
    "import_job_id": "<job-id>",
    "raw_text": "Meeting transcript or browser artifact text"
  }
}
```

`knowledge.imports.commit` writes previewed items as evidence-backed Knowledge Claims. The shared executor never commits raw pasted transcript/artifact content directly into RAG; it uses redacted, capped preview content with provenance back to the import job and item.

Claim provenance is available through operator-authenticated routes:

```text
GET /api/knowledge/claims/{claimId}/evidence?org_id={workspaceId}
GET /api/knowledge/claims/{claimId}/explain?org_id={workspaceId}
```

Use the evidence route when a UI needs source rows. Use the explain route when an operator or agent needs the claim, governance events, evidence counts, lifecycle status, and replacement/expiry summary in one packet.

## Scopes

External clients use per-operation scopes:

- `knowledge:read`
- `knowledge:write`
- `knowledge:governance`
- `knowledge:sources`
- `knowledge:claims`
- `knowledge:evals`
- `agent_ops:launch`
- `agent_ops:read`
- `agent_ops:governance`

Write/governance clients require an admin or owner to create them. Project- and team-bound tokens are enforced before execution.

Revocation is explicit. Clients store `status`, `revoked_at`, `expires_at`, `last_used_at`, and scoped `scopes`; execution verifies the token hash, active status, expiry, project/team binding, and required operation scopes on every call.

## Mission Control

Mission Control Knowledge includes **Connect a Local Agent**. It creates:

- one-time token
- external HTTP endpoint
- MCP endpoint
- copyable MCP config
- allowed operations list
- verify-connection action

Tokens are never stored or returned again after creation. The database stores only `token_hash`.

## Runtime Model

This is engine- and runtime-agnostic. OpenClaw, Hermes, shared workers, local coding agents, MCP clients, and future runtimes all call the same Knowledge operation contract.

Do not add direct Supabase access for local agents.

Runtime capabilities are exposed through the canonical capability registry in `contracts/runtime-capabilities.ts` and `src/lib/mission-control/capability-registry.ts`. Engines should advertise capabilities such as `knowledge.read`, `knowledge.write`, `knowledge.claims`, `knowledge.forget`, `agent_ops.run`, `browser.trust_shield`, `engine_home.candidate`, and `eval.cross_provider` rather than branching product behavior on engine names.
