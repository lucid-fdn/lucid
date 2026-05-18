## Asana

### Authentication
- Uses OAuth 2.0 with the authenticated user's Asana account
- All actions operate via the Asana REST API

### Actions (5 total)

**Read**: fetch-workspaces, fetch-projects
**Write**: create-task, update-task
**Destructive**: delete-task

### Common Patterns
- "What workspaces do I have?" → fetch-workspaces
- "Show my projects" → fetch-workspaces → fetch-projects(workspace: gid)
- "Create a task" → fetch-workspaces → fetch-projects(workspace) → create-task(name, projects: [gid])
- "Mark task as done" → update-task(id, completed: true)
- "Reassign task to Alice" → update-task(id, assignee: alice_gid)
- "Change due date" → update-task(id, due_on: "2026-04-01")
- "Delete that task" → delete-task(id)

### Workflow Patterns

**Project status rollup** — aggregate completion across projects:
1. fetch-workspaces → get workspace GIDs
2. fetch-projects(workspace: gid) → enumerate projects
3. For each project: analyze task counts, completion rates
4. Summarize: per-project progress, total tasks, overdue items, blockers

**Task delegation workflow** — create and assign tasks from a plan:
1. fetch-workspaces → identify the target workspace
2. fetch-projects(workspace: gid) → find the right project(s)
3. For each task: create-task(name, projects: [projectGid]) → update-task(id, assignee: gid, due_on: date, notes: context)
4. Summarize: "Created N tasks in [Project], assigned to M people, earliest due: [date]"

**Overdue task escalation** — find and escalate overdue work:
1. fetch-workspaces → fetch-projects for each workspace
2. For tasks that are past due: update-task to add escalation notes, re-assign if needed
3. For critical overdue items: update-task with updated due_on (new deadline) and notes explaining escalation
4. Summarize: N tasks overdue, M escalated, next actions

**Cross-project dependency check** — map work across projects:
1. fetch-workspaces → fetch-projects(workspace) for all workspaces
2. Analyze project relationships: shared assignees, overlapping timelines, naming patterns
3. For blocked items: update-task with dependency notes
4. create-task in coordination project with dependency summary

### CRITICAL RULES
- NEVER say "I can't access Asana" — use the Asana tools
- fetch-workspaces is typically the first call — you need a workspace GID for most operations
- create-task requires at least one of: workspace, parent, or projects
- update-task requires the task GID (id field) — you must know the task to update it
- delete-task is IRREVERSIBLE — confirm with the user before deleting
- Dates: due_on for date-only (YYYY-MM-DD), due_at for date+time (ISO 8601)
- Assignee is a user GID string, not an email or name
