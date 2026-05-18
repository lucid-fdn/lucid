# Agent Identity And Operating Context

Lucid separates an agent's identity from the company context the agent works inside. This is the most important rule for understanding how workspace, project, team, and agent memory fit together.

An **agent** can have identity documents: who it is, how it should behave, what tools it can use, and what state it should keep between runs.

A **workspace, project, or team** does not have a soul. Those scopes have operating context: what the company believes, what the project knows, what the team has learned, which policies apply, and which signals or feedback should influence current work.

This separation keeps agents personal and expressive without making company knowledge ambiguous or unsafe.

## Scope Model

Lucid resolves operating context through a ladder:

1. **Workspace** - company-wide thesis, policy, decisions, risks, recurring memory, and Daily Intel.
2. **Project** - project-specific goals, facts, decisions, risks, signals, and feedback.
3. **Team** - team roles, coordination rules, handoffs, current blockers, and recent outcomes.
4. **Agent** - agent-scoped operating context that is not part of identity, such as task-local notes or agent-facing feedback.
5. **User** - user-scoped preferences and working context where appropriate.

More specific scopes override broader scopes for policy inheritance. For example, a project policy can narrow a workspace policy, and a team policy can add specialist-specific operating rules. This does not change the agent's identity documents.

## Agent Identity Documents

Agent identity documents are versioned and agent-scoped. They are not shared workspace or project records.

Supported document types:

| Type | Meaning |
|---|---|
| `SOUL` | The agent's persistent persona, values, tone, and durable behavioral identity. |
| `USER` | User-facing identity information or audience assumptions the agent should respect. |
| `HEARTBEAT` | Agent operating-state cadence: current focus, rhythm, health, and check-in expectations. |
| `MEMORY_POLICY` | How the agent should treat memory extraction, retention, recall, and promotion. |
| `ACCESS_POLICY` | What the agent may access, refuse, or escalate. |
| `TOOL_POLICY` | Tool-use boundaries, required approvals, and prohibited tool behavior. |
| `CURRENT_CONTEXT` | Current task, mission, environment, or temporary operating frame. |

The legacy `soul_content` column remains a compatibility fallback. New systems should use versioned identity documents through the assistant identity API.

## Native Lucid Agent Cards

Agent Cards are Lucid's native packaging layer for agent personalization. They are not a foreign-branded import format and they do not create a second identity store.

An Agent Card contains profile, voice, style, examples, guardrails, knowledge references, memory policy, access policy, tool policy, and optional modes. Applying a card writes versioned agent identity documents. Exporting a card returns native Lucid JSON with a card hash.

The assistant command center exposes an Agent Card panel with:

- friendly editors for profile, voice, style, guardrails, examples, knowledge snippets, and policy JSON
- advanced JSON editing
- validate, preview apply, apply, export, and runtime prompt preview
- identity document version history and revert
- command palette actions for validate, preview prompt, export, and revert

Organization Cards and Project Cards are derived from shared context records. The panel can create organization and project card context, but it writes through the existing workspace and project context APIs. There are no separate organization-card or project-card tables.

## Heartbeat Naming

Lucid uses heartbeat in three different, namespaced ways:

| Name | Purpose |
|---|---|
| Pulse | Work orchestration: queues, leases, retries, and run admission. |
| Runtime heartbeat | Infrastructure liveness and metrics for dedicated or managed runtimes, via `/api/runtimes/heartbeat`. |
| Agent heartbeat | Agent operating state and check-in cadence, via `/api/assistants/{id}/heartbeat`. |

These are related operational concepts, but they are not interchangeable. Pulse is not the agent heartbeat. Runtime heartbeat is not the agent's identity state.

## Optional Web3 Identity

Web3 identity is optional. Agents can operate normally without a passport or wallet.

When available, identity documents can carry:

- `passport_id`
- `wallet_address`
- `identity_anchor`

These fields attach provenance to identity versions. They do not force every agent into an on-chain identity model. On-chain attestation, registry writes, and signing or verification of identity document versions are separate future proof flows.

## Shared Context Records

Shared context is the company/project/team brain. It is not the same as agent identity.

Supported record types:

| Type | Meaning |
|---|---|
| `thesis` | What the workspace, project, team, or agent currently believes. |
| `signal` | Reference intel, external evidence, market movement, customer input, or observed data. |
| `feedback` | Human or system feedback that should improve future behavior. |
| `daily_intel` | A daily rollup of relevant signals, decisions, risks, and feedback. |
| `memory` | Durable shared memory that is not user-private assistant memory. |
| `decision` | A decision that should guide future work. |
| `policy` | Operating policy inherited through the context ladder. |
| `risk` | Known risk, blocker, failure mode, or watch item. |
| `open_question` | A question that remains unresolved and should influence planning. |

Shared context records can be scoped to `workspace`, `project`, `team`, `agent`, or `user`.

Records have an explicit lifecycle:

| Status | Meaning |
|---|---|
| `draft` | Not ready for runtime prompt assembly. |
| `active` | Included in resolved context when the scope applies. |
| `resolved` | A risk or open question has been handled and is kept for audit/history. |
| `superseded` | A thesis or policy has been replaced by newer context. |
| `archived` | Removed from active operating context without claiming it was resolved or replaced. |

For thesis and policy evolution, records can point at `superseded_by_record_id`. This gives operators a reviewable replacement chain instead of silently rewriting beliefs or governance.

## Evidence And Provenance

Shared context supports structured source links. A record can link to:

- Knowledge pages, claims, and sources
- Commerce events
- Agent Ops runs
- Shared memories
- Agent heartbeats
- Engine Home candidates
- Docs
- External signals

Each link stores the target type, target id, optional label, optional URL, provenance note, observed timestamp, confidence, and metadata. The Workspace Brain, Project Brain, and Team Context UI expose a row detail drawer so operators can inspect evidence without crowding the main list.

Daily Intel records generated from existing context automatically link back to the source records used as inputs. Agent heartbeat context records link back to the heartbeat that produced them.

## Daily Intel

Daily Intel is a shared-context rollup, not a new memory store. It summarizes recent signals, feedback, decisions, risks, and open questions into compact records that agents can use during future work.

The worker rollup is optional and controlled by:

| Variable | Default | Purpose |
|---|---|---|
| `LUCID_DAILY_INTEL_ENABLED` | `false` | Enables scheduled Daily Intel rollups. |
| `DAILY_INTEL_INTERVAL_MS` | `86400000` | Rollup cadence, minimum 1 hour. |
| `DAILY_INTEL_WORKSPACE_BATCH_SIZE` | `25` | Maximum workspaces scanned per run. |

Agent heartbeats can also write a `daily_intel` context record for the agent scope when the heartbeat contains a useful focus or status update.

Operators can also generate Daily Intel manually from Workspace Brain, Project Brain, and Team Context. The button creates an editable draft from the last 24 hours of relevant signals, feedback, decisions, risks, open questions, and memories. Operators can edit the title/body and provenance links before publishing the record.

## Policy Inheritance

Policy records merge through the same scope ladder as other context:

1. Workspace policy
2. Project policy
3. Team policy
4. Agent policy
5. User policy

More specific scopes win when they define the same policy key. The resolved context API returns:

- `inherited_policy` - the merged effective policy object.
- `policy_sources` - policy records and keys that contributed to the merge.
- `policy_conflicts` - keys where a narrower scope overrode a broader policy.

The UI shows merged policy values and override warnings. Operators should use this for governance preview before relying on a team or project policy in runtime behavior.

## Runtime Prompt Assembly

OpenClaw runtime prompt assembly now follows this order:

1. Base system prompt.
2. Agent identity documents, with `soul_content` fallback.
3. Resolved shared operating context from workspace, project, team, agent, and user scopes.
4. Tool list and runtime capability instructions.
5. Memory and Knowledge prompt packets.
6. Conversation summary and recent turns.

This gives providers a stable prompt prefix for identity while keeping daily operating context explicit and bounded.

## Product UI

Lucid exposes operating context at every product level that needs it:

| Surface | Location | Scope |
|---|---|---|
| Workspace Brain | Workspace dashboard | Company-wide shared context inherited by projects, teams, and agents. |
| Project Brain | Project settings | Project-level shared context inherited by teams and agents in that project. |
| Team Context | Project team detail | Team-scoped shared context inherited by member agents. |
| Agent Operating Context | Agent command center | Agent identity documents, agent-scoped shared context, inherited context preview, and heartbeat history. |
| Agent Card | Agent command center | Native card editor for agent personalization, org/project card context creation, preview/apply/export, prompt preview, and identity version history. |

Workspace Brain, Project Brain, and Team Context all use the same shared operating context manager. Operators can create, edit, archive, resolve, and supersede thesis, signal, feedback, Daily Intel, memory, decision, policy, risk, and open-question records; attach evidence links; inspect row provenance in a detail drawer; generate Daily Intel drafts; inspect resolved context; preview merged inherited policy values; see policy override warnings; and verify the scope ladder. Inherited records are read-only from narrower scopes, so a team cannot accidentally rewrite workspace or project context.

The assistant command-center section exposes four agent-specific views:

| View | What users can do |
|---|---|
| Overview | Inspect active identity document coverage, resolved scopes, compiled prompt-section count, optional Web3 provenance, latest heartbeat, and recent resolved context records. |
| Identity | Create versioned agent identity documents for `SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, and `CURRENT_CONTEXT`; inspect document status, version, timestamp, and JSON content. |
| Context | Add agent-scoped shared context records, including thesis, signals, feedback, Daily Intel, memory, decisions, policy, risks, and open questions; inspect records inherited from workspace, project, team, and user scopes. |
| Heartbeat | Record agent operating status, focus, health JSON, and next heartbeat time; inspect recent heartbeat history and linked context records. |

## APIs

Identity:

- `GET /api/assistants/{id}/identity`
- `POST /api/assistants/{id}/identity`
- `PATCH /api/assistants/{id}/identity/{documentId}`

Agent Card:

- `GET /api/assistants/{id}/agent-card`
- `POST /api/assistants/{id}/agent-card/import`
- `GET /api/assistants/{id}/agent-card/export`
- `POST /api/assistants/{id}/agent-card/validate`
- `POST /api/assistants/{id}/agent-card/preview`

Agent heartbeat:

- `GET /api/assistants/{id}/heartbeat`
- `POST /api/assistants/{id}/heartbeat`

Shared operating context:

- `GET /api/workspaces/{id}/context`
- `POST /api/workspaces/{id}/context`
- `PATCH /api/workspaces/{id}/context/{recordId}`
- `DELETE /api/workspaces/{id}/context/{recordId}`
- `GET /api/workspaces/{id}/context?resolve=true`
- `POST /api/workspaces/{id}/context/daily-intel`
- `GET /api/workspaces/{id}/projects/{projectId}/context`
- `POST /api/workspaces/{id}/projects/{projectId}/context`
- `PATCH /api/workspaces/{id}/projects/{projectId}/context/{recordId}`
- `DELETE /api/workspaces/{id}/projects/{projectId}/context/{recordId}`
- `GET /api/workspaces/{id}/projects/{projectId}/context?resolve=true`
- `POST /api/workspaces/{id}/projects/{projectId}/context/daily-intel`
- `GET /api/crews/{id}/context?org_id={workspaceId}&project_id={projectId}`
- `POST /api/crews/{id}/context?org_id={workspaceId}&project_id={projectId}`
- `PATCH /api/crews/{id}/context/{recordId}?org_id={workspaceId}&project_id={projectId}`
- `DELETE /api/crews/{id}/context/{recordId}?org_id={workspaceId}&project_id={projectId}`
- `GET /api/crews/{id}/context?org_id={workspaceId}&project_id={projectId}&resolve=true`
- `POST /api/crews/{id}/context/daily-intel?org_id={workspaceId}&project_id={projectId}`
- `GET /api/assistants/{id}/context`
- `POST /api/assistants/{id}/context`
- `PATCH /api/assistants/{id}/context/{recordId}`
- `DELETE /api/assistants/{id}/context/{recordId}`
- `GET /api/assistants/{id}/context?resolve=true`

Team context intentionally lives under `/api/crews`. `/api/crews` is the current Team API. Do not create parallel team routes unless the migration plan explicitly calls for them.

## User Guidance

Use agent identity documents when the answer is about the agent itself:

- "Who are you?"
- "What tone should you use?"
- "What tools are you allowed to use?"
- "What memory rules should you follow?"
- "What is your current mission?"

Use shared context when the answer is about the company, project, team, or work:

- "What do we believe about this market?"
- "What did the launch team decide?"
- "What did yesterday's customer feedback say?"
- "What risks should the project watch?"
- "What policy applies to this team?"

## Current Product Status

The backend, contracts, APIs, migrations, worker runtime injection, optional Daily Intel job foundation, manual Daily Intel generation UI, workspace/project/team shared-context UI, evidence links, resolved/superseded lifecycle, merged policy preview, policy override warnings, and assistant-level Operating Context UI exist.

The UI is intentionally dense and operational. Workspace Brain, Project Brain, Team Context, and Agent Operating Context share the same model: explicit scope, resolved inheritance, policy preview, quick record creation, local edit/archive/lifecycle controls, provenance on demand, and no fake workspace/team identity documents.
