## Linear

### Authentication
- Uses OAuth 2.0 with the authenticated user's Linear account
- All actions operate via the Linear GraphQL API

### Actions (4 total)

**Read**: fetch-teams, fetch-fields, fetch-models
**Write**: create-issue

### Common Patterns
- "What teams do I have?" → fetch-teams (returns team IDs and names, paginated)
- "What fields does an Issue have?" → fetch-fields(name: "Issue") — introspects the schema
- "What entities are in Linear?" → fetch-models — lists all available model types
- "Create a bug ticket" → fetch-teams to get teamId → create-issue(teamId, title, priority: 1)
- "Add an issue to project X" → fetch-teams → create-issue with projectId

### Workflow Patterns

**Sprint planning assistant** — structured issue creation from a plan:
1. fetch-teams → identify the target team(s)
2. fetch-fields(name: "Issue") → discover available fields, priorities, states
3. For each planned item: create-issue with teamId, title, description, priority, estimate, assigneeId
4. Group by priority: urgent (1) first, then high (2), medium (3), low (4)
5. Summarize: "Created N issues across M teams, total estimate: X points"

**Bug triage workflow** — classify and create from a bug description:
1. Analyze the bug description for severity signals (data loss=urgent, broken feature=high, cosmetic=low)
2. fetch-teams → identify the owning team based on the component/area
3. create-issue with: appropriate priority (1-4), descriptive title, structured description (Steps to Reproduce, Expected, Actual), assigneeId if obvious owner
4. Report: issue URL, assigned priority, team

**Sprint health check** — assess current sprint state:
1. fetch-teams → get all team IDs
2. fetch-models → confirm available entities
3. fetch-fields(name: "Issue") → understand status fields and workflow states
4. Summarize: team count, available workflow states, field capabilities

**Cross-team dependency tracker** — map dependencies across teams:
1. fetch-teams → enumerate all teams
2. For each team: fetch-fields(name: "Issue") to understand custom fields
3. Analyze: identify shared fields, common labels, cross-team patterns
4. create-issue in coordinating team with dependency summary + links

### Agents API (actor=app)

When `FEATURE_LINEAR_AGENT=true`, agents can receive work directly from Linear via the Agents API:

**How it works**:
- Humans assign issues to the agent or @mention it in comments
- Linear sends an `AgentSessionEvent` webhook
- Agent emits a thought within 10s, then processes the issue asynchronously
- Activities (thoughts, actions, plans, responses) appear in Linear's agent panel
- Agent can ask clarifying questions via elicitation (polls for human response)
- Session status tracked: pending → active → awaiting_input → complete/error/cancelled

**Activity types**:
- `thought` — ephemeral internal reasoning (replaces previous)
- `action` — tool calls with name/input/result (ephemeral)
- `elicitation` — ask human for clarification (permanent, blocks for response)
- `response` — final answer (permanent)
- `error` — failure report (permanent)

**Key files**:
- `worker/src/pm-sync/adapters/linear/agent-client.ts` — GraphQL activity emission
- `worker/src/pm-sync/adapters/linear/agent-handler.ts` — Webhook → session → run
- `worker/src/pm-sync/adapters/linear/agent-run-processor.ts` — Main agent run logic
- `worker/src/pm-sync/adapters/linear/elicitation-handler.ts` — Clarification flow
- `worker/src/pulse/executors/linear-agent-session.ts` — Pulse step executor

**Nango integration**: Uses `linear-agent` provider key (separate from `linear` for user-level OAuth). Stored per-org in `org_pm_config.config.agentConnectionId`.

### CRITICAL RULES
- NEVER say "I can't access Linear" — use the Linear tools
- fetch-teams is required before create-issue — you need a teamId
- priority is numeric: 0=none, 1=urgent, 2=high, 3=medium, 4=low
- fetch-fields introspects the GraphQL schema — use it to discover available fields
- fetch-models lists entity types — use it when the user asks about Linear's data model
