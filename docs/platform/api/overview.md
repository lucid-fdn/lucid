# API Overview

Lucid provides REST APIs for programmatic access to the platform. Use the API to create agents, manage plugins, ingest knowledge base documents, and more.

## Authentication

All API requests require authentication via API key:

```
Authorization: Bearer your-api-key
```

Generate API keys in **Workspace Settings > API Keys**.

## Base URL

```
https://lucid.foundation/api
```

## Core Endpoints

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/assistants` | List all agents in the workspace |
| `POST` | `/assistants` | Create a new agent |
| `GET` | `/assistants/:id` | Get agent details |
| `PATCH` | `/assistants/:id` | Update agent configuration |
| `DELETE` | `/assistants/:id` | Delete an agent |

### Agent Identity, Heartbeat, And Context

Agent identity documents describe the agent itself. Shared operating context describes the workspace, project, team, agent-facing context, or user context around the agent.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/assistants/:id/identity` | List versioned identity documents and the compiled identity package |
| `POST` | `/assistants/:id/identity` | Create a new identity document version |
| `PATCH` | `/assistants/:id/identity/:documentId` | Update identity document status or content |
| `GET` | `/assistants/:id/heartbeat` | List recent agent heartbeat records |
| `POST` | `/assistants/:id/heartbeat` | Record agent operating state, focus, health, and next heartbeat time |
| `GET` | `/assistants/:id/context` | List agent-scoped shared context records |
| `POST` | `/assistants/:id/context` | Create an agent-scoped shared context record |
| `PATCH` | `/assistants/:id/context/:recordId` | Update an agent-scoped shared context record, including status, replacement pointer, metadata, and evidence links |
| `DELETE` | `/assistants/:id/context/:recordId` | Archive an agent-scoped shared context record |
| `GET` | `/assistants/:id/context?resolve=true` | Resolve inherited workspace/project/team/agent/user context for the agent |

Identity document types are `SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, and `CURRENT_CONTEXT`. Web3 identity is optional; passport and wallet anchors appear only when available.

Shared context record types are `thesis`, `signal`, `feedback`, `daily_intel`, `memory`, `decision`, `policy`, `risk`, and `open_question`. Record statuses are `draft`, `active`, `resolved`, `superseded`, and `archived`.

Shared context records can carry `links` to `knowledge_page`, `knowledge_claim`, `knowledge_source`, `commerce_event`, `agent_ops_run`, `memory`, `heartbeat`, `candidate`, `doc`, and `external_signal` targets. Use these links for provenance rather than embedding source IDs only in prose.

### Workspace, Project, And Team Context

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/workspaces/:id/context` | List workspace-scoped shared context records |
| `POST` | `/workspaces/:id/context` | Create a workspace-scoped shared context record |
| `PATCH` | `/workspaces/:id/context/:recordId` | Update a workspace-scoped shared context record |
| `DELETE` | `/workspaces/:id/context/:recordId` | Archive a workspace-scoped shared context record |
| `GET` | `/workspaces/:id/context?resolve=true` | Resolve workspace context |
| `POST` | `/workspaces/:id/context/daily-intel` | Generate a Daily Intel preview or publish an edited Daily Intel record |
| `GET` | `/workspaces/:id/projects/:projectId/context` | List project-scoped shared context records |
| `POST` | `/workspaces/:id/projects/:projectId/context` | Create a project-scoped shared context record |
| `PATCH` | `/workspaces/:id/projects/:projectId/context/:recordId` | Update a project-scoped shared context record |
| `DELETE` | `/workspaces/:id/projects/:projectId/context/:recordId` | Archive a project-scoped shared context record |
| `GET` | `/workspaces/:id/projects/:projectId/context?resolve=true` | Resolve inherited workspace/project context |
| `POST` | `/workspaces/:id/projects/:projectId/context/daily-intel` | Generate or publish project Daily Intel |
| `GET` | `/crews/:id/context?org_id=:workspaceId&project_id=:projectId` | List team-scoped context records on the current Team API |
| `POST` | `/crews/:id/context?org_id=:workspaceId&project_id=:projectId` | Create a team-scoped context record |
| `PATCH` | `/crews/:id/context/:recordId?org_id=:workspaceId&project_id=:projectId` | Update a team-scoped context record |
| `DELETE` | `/crews/:id/context/:recordId?org_id=:workspaceId&project_id=:projectId` | Archive a team-scoped context record |
| `GET` | `/crews/:id/context?org_id=:workspaceId&project_id=:projectId&resolve=true` | Resolve inherited workspace/project/team/user context |
| `POST` | `/crews/:id/context/daily-intel?org_id=:workspaceId&project_id=:projectId` | Generate or publish team Daily Intel |

`/api/crews` is the current Team API. New clients should pass `project_id`; the default-project fallback exists for compatibility only.

`?resolve=true` responses include `inherited_policy`, `policy_sources`, and `policy_conflicts`. Clients should render the merged policy and warnings instead of showing policy keys only.

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/assistants/:id/chat` | Send a message to an agent (streaming response) |
| `POST` | `/ai/chat` | Send a message without an agent (direct model chat) |

### Plugins

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/orgs/:orgId/plugins` | List installed plugins |
| `POST` | `/orgs/:orgId/plugins` | Install a plugin |
| `GET` | `/assistants/:id/plugins` | List activated plugins on an agent |
| `POST` | `/assistants/:id/plugins` | Activate a plugin on an agent |

### Knowledge Base (RAG)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ai/rag/documents` | List documents |
| `POST` | `/ai/rag/documents` | Upload/ingest a document |
| `DELETE` | `/ai/rag/documents/:id` | Delete a document |

### Mission Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/mission-control/agents` | Fleet overview |
| `GET` | `/mission-control/agents/:id` | Agent detail with context |
| `POST` | `/mission-control/agents/:id/control` | Send control command (pause/resume/kill) |
| `GET` | `/mission-control/feed` | Live event feed |
| `GET` | `/mission-control/approvals` | Pending approvals |
| `POST` | `/mission-control/approvals/:id` | Approve or deny |

## Request Format

All request bodies use JSON:

```json
{
  "name": "My Agent",
  "system_prompt": "You are a helpful assistant.",
  "model": "gpt-4o"
}
```

## Response Format

Responses return JSON with consistent structure:

```json
{
  "data": { ... },
  "error": null
}
```

Error responses:

```json
{
  "data": null,
  "error": {
    "message": "Agent not found",
    "code": "NOT_FOUND"
  }
}
```

## Rate Limits

| Plan | Rate Limit |
|------|-----------|
| Starter | 60 requests/minute |
| Pro | 300 requests/minute |
| Business | 1000 requests/minute |
| Enterprise | Custom |

Rate limit headers are included in responses:
- `X-RateLimit-Limit` — Max requests per window
- `X-RateLimit-Remaining` — Remaining requests
- `X-RateLimit-Reset` — Time until reset (Unix timestamp)

## SDKs

- **JavaScript/TypeScript** — `raijin-labs-lucid-ai` npm package
- **Python** — Coming soon

## Webhooks

Configure webhooks in workspace settings to receive events:
- Agent status changes
- Approval requests
- Cost limit alerts
- Health score drops
