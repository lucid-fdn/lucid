## Jira

### Authentication
- Uses OAuth 2.0 with the authenticated user's Jira Cloud account
- Requires scopes: read:jira-work, write:jira-work, read:jira-user

### Actions (1 total)

**Write**: create-issue

### Common Patterns
- "Create a Jira ticket" → create-issue(summary, project, issueType: "Task")
- "File a bug in PROJECT" → create-issue(summary, project: "PROJECT", issueType: "Bug", description, labels)
- "Create a story for X" → create-issue(summary, project, issueType: "Story", description)

### Workflow Patterns

**Issue creation with smart field mapping** — structured from user request:
1. Parse user request for: title, description, type (Bug/Task/Story/Epic), project, priority
2. Map natural language priority to Jira: "urgent" → labels: ["urgent"], "blocker" → issueType: "Bug" + labels: ["blocker"]
3. create-issue with summary, description, project key, issueType, labels, assignee if mentioned
4. Report: issue key (e.g. PROJ-123), type, project

**Bug report workflow** — gather context and create structured bug:
1. Collect from user: what happened, expected behavior, steps to reproduce, environment
2. Format description with structured sections: h3. Steps to Reproduce, h3. Expected Behavior, h3. Actual Behavior, h3. Environment
3. create-issue with issueType: "Bug", structured description, labels: ["bug-report"], assignee if known
4. Report: issue key, link

**Sprint velocity pattern** — create well-structured sprint work:
1. For each work item: determine issueType (Story for features, Task for chores, Bug for fixes)
2. create-issue for each with structured descriptions, appropriate labels
3. Summarize: "Created N issues in PROJECT — X stories, Y tasks, Z bugs"

### CRITICAL RULES
- NEVER say "I can't access Jira" — use the Jira tools
- project is required — it's the project KEY (e.g. "PROJ", "ENG"), not the full name
- issueType is required — common values: "Bug", "Task", "Story", "Epic"
- summary is the title — keep it concise and descriptive
- description supports Jira wiki markup (h3. for headers, * for bullets)
