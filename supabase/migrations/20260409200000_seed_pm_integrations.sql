-- Migration: Seed PM tool integrations into plugin_catalog
--
-- 4 providers: Linear, Asana, Monday.com, Jira
-- (Trello is already seeded in 20260329400001_seed_tier2_plugin_catalog.sql)
--
-- These integrations are used both by:
--   1. Agent tools (Nango actions: create/update issues, etc.)
--   2. PM Sync adapter layer (worker/src/pm-sync/ — bidirectional sync)

INSERT INTO plugin_catalog (
  slug, name, description, version, category,
  tool_manifest, source, risk_level, verified, max_tools, is_published,
  kind, transport, trust_level, execution_mode, auth_type, auth_provider
) VALUES

-- ── Linear ─────────────────────────────────────────────────────────────────
('linear', 'Linear', 'Create issues, manage sprints, and track projects in Linear.',
 '1.0.0', 'project-management',
 '[{"name":"fetch_teams","description":"List all teams in the Linear workspace","parameters":{"type":"object","properties":{"limit":{"type":"number","minimum":1,"maximum":50,"description":"Max teams to return (default 50)"}},"additionalProperties":false}},{"name":"fetch_fields","description":"Introspect the schema — list available fields for a given model type","parameters":{"type":"object","properties":{"name":{"type":"string","description":"Model type to introspect (e.g. Issue, Project, Team)"}},"required":["name"],"additionalProperties":false}},{"name":"fetch_models","description":"List all available model types in the Linear API","parameters":{"type":"object","properties":{},"additionalProperties":false}},{"name":"create_issue","description":"Create a new issue in a Linear team","parameters":{"type":"object","properties":{"teamId":{"type":"string","description":"Team ID (required — use fetch-teams to get this)"},"title":{"type":"string","description":"Issue title (required)"},"description":{"type":"string","description":"Issue description (Markdown supported)"},"priority":{"type":"number","enum":[0,1,2,3,4],"description":"Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"},"assigneeId":{"type":"string","description":"User ID to assign"},"projectId":{"type":"string","description":"Project ID to add the issue to"},"estimate":{"type":"number","description":"Story points estimate"},"labelIds":{"type":"array","items":{"type":"string"},"description":"Label IDs to apply"}},"required":["teamId","title"],"additionalProperties":false}}]'::jsonb,
 'first-party', 'write', true, 10, true,
 'integration', 'nango', 'verified', 'in_process', 'oauth2', 'linear'),

-- ── Asana ──────────────────────────────────────────────────────────────────
('asana', 'Asana', 'Create tasks, manage projects, and track work in Asana.',
 '1.0.0', 'project-management',
 '[{"name":"fetch_workspaces","description":"List workspaces the authenticated user belongs to","parameters":{"type":"object","properties":{},"additionalProperties":false}},{"name":"fetch_projects","description":"List projects in a workspace","parameters":{"type":"object","properties":{"workspace":{"type":"string","description":"Workspace GID (required)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max projects to return (default 20)"}},"required":["workspace"],"additionalProperties":false}},{"name":"create_task","description":"Create a new task in Asana","parameters":{"type":"object","properties":{"name":{"type":"string","description":"Task name (required)"},"projects":{"type":"array","items":{"type":"string"},"description":"Project GIDs to add the task to"},"workspace":{"type":"string","description":"Workspace GID (required if no projects specified)"},"assignee":{"type":"string","description":"User GID to assign"},"due_on":{"type":"string","description":"Due date (YYYY-MM-DD)"},"due_at":{"type":"string","description":"Due date+time (ISO 8601)"},"notes":{"type":"string","description":"Task description/notes"}},"required":["name"],"additionalProperties":false}},{"name":"update_task","description":"Update an existing Asana task","parameters":{"type":"object","properties":{"id":{"type":"string","description":"Task GID (required)"},"name":{"type":"string","description":"Updated task name"},"completed":{"type":"boolean","description":"Mark task as completed"},"assignee":{"type":"string","description":"User GID to reassign"},"due_on":{"type":"string","description":"Due date (YYYY-MM-DD)"},"notes":{"type":"string","description":"Updated description/notes"}},"required":["id"],"additionalProperties":false}},{"name":"delete_task","description":"Permanently delete an Asana task (irreversible)","parameters":{"type":"object","properties":{"id":{"type":"string","description":"Task GID (required)"}},"required":["id"],"additionalProperties":false}}]'::jsonb,
 'first-party', 'write', true, 10, true,
 'integration', 'nango', 'verified', 'in_process', 'oauth2', 'asana'),

-- ── Monday.com ─────────────────────────────────────────────────────────────
('monday', 'Monday.com', 'Create items, manage boards, and track status in Monday.com.',
 '1.0.0', 'project-management',
 '[{"name":"list_boards","description":"List boards the authenticated user has access to","parameters":{"type":"object","properties":{"limit":{"type":"number","minimum":1,"maximum":50,"description":"Max boards to return (default 25)"},"page":{"type":"number","minimum":1,"description":"Page number for pagination"}},"additionalProperties":false}},{"name":"list_items","description":"List items on a board with column values","parameters":{"type":"object","properties":{"board_id":{"type":"string","description":"Board ID (required)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max items to return (default 25)"},"page":{"type":"number","minimum":1,"description":"Page number"}},"required":["board_id"],"additionalProperties":false}},{"name":"create_item","description":"Create a new item on a Monday.com board","parameters":{"type":"object","properties":{"board_id":{"type":"string","description":"Board ID (required)"},"item_name":{"type":"string","description":"Item name (required)"},"column_values":{"type":"object","description":"Column values as JSON (key: column_id, value: column-type-specific JSON)"},"group_id":{"type":"string","description":"Group ID to place the item in"}},"required":["board_id","item_name"],"additionalProperties":false}},{"name":"update_column","description":"Update a column value on an item","parameters":{"type":"object","properties":{"board_id":{"type":"string","description":"Board ID (required)"},"item_id":{"type":"string","description":"Item ID (required)"},"column_id":{"type":"string","description":"Column ID (required)"},"value":{"type":"string","description":"New value (JSON string, format depends on column type)"}},"required":["board_id","item_id","column_id","value"],"additionalProperties":false}},{"name":"list_groups","description":"List groups (sections) on a board","parameters":{"type":"object","properties":{"board_id":{"type":"string","description":"Board ID (required)"}},"required":["board_id"],"additionalProperties":false}}]'::jsonb,
 'first-party', 'write', true, 10, true,
 'integration', 'nango', 'verified', 'in_process', 'oauth2', 'monday'),

-- ── Jira ───────────────────────────────────────────────────────────────────
('jira', 'Jira', 'Create issues, manage sprints, and track bugs in Jira Cloud.',
 '1.0.0', 'project-management',
 '[{"name":"create_issue","description":"Create a new issue in a Jira project","parameters":{"type":"object","properties":{"summary":{"type":"string","description":"Issue title (required)"},"project":{"type":"string","description":"Project key (required, e.g. PROJ, ENG)"},"issueType":{"type":"string","description":"Issue type (required: Bug, Task, Story, Epic)"},"description":{"type":"string","description":"Issue description (Jira wiki markup: h3. for headers, * for bullets)"},"priority":{"type":"string","description":"Priority name (Highest, High, Medium, Low, Lowest)"},"assignee":{"type":"string","description":"Assignee account ID"},"labels":{"type":"array","items":{"type":"string"},"description":"Labels to apply"}},"required":["summary","project","issueType"],"additionalProperties":false}}]'::jsonb,
 'first-party', 'write', true, 10, true,
 'integration', 'nango', 'verified', 'in_process', 'oauth2', 'jira')

ON CONFLICT (slug) DO UPDATE SET
  tool_manifest = EXCLUDED.tool_manifest,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  auth_provider = EXCLUDED.auth_provider,
  updated_at = now();
