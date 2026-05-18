-- Migration: Seed Asana actions into oauth_action_catalog
-- 5 actions total: 2 read (fetch-workspaces, fetch-projects) + 2 write (create-task, update-task) + 1 destructive (delete-task)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('asana', 'Asana', 'fetch_workspaces',
 'Fetch the workspaces of the authenticated user with an optional limit (default 10).',
 'https://app.asana.com/api/1.0/workspaces', 'GET', 'asana',
 '{"type":"object","properties":{"limit":{"type":"number","description":"Maximum number of workspaces to return (default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('asana', 'Asana', 'fetch_projects',
 'Fetch projects in a given workspace with an optional limit (default 10).',
 'https://app.asana.com/api/1.0/projects', 'GET', 'asana',
 '{"type":"object","properties":{"workspace":{"type":"string","description":"Workspace GID to fetch projects from (required)"},"limit":{"type":"number","description":"Maximum number of projects to return (default 10)"}},"required":["workspace"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

-- Write actions
('asana', 'Asana', 'create_task',
 'Create a task in Asana. Must specify at least one of workspace, parent, or projects.',
 'https://app.asana.com/api/1.0/tasks', 'POST', 'asana',
 '{"type":"object","properties":{"name":{"type":"string","description":"Task name/title (required)"},"workspace":{"type":"string","description":"Workspace GID"},"parent":{"type":"string","description":"Parent task GID (for subtasks)"},"projects":{"type":"array","items":{"type":"string"},"description":"Array of project GIDs to add the task to"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

('asana', 'Asana', 'update_task',
 'Update a task in Asana. Can modify name, assignee, due date, completion status, notes, projects, tags, and parent.',
 'https://app.asana.com/api/1.0/tasks', 'PUT', 'asana',
 '{"type":"object","properties":{"id":{"type":"string","description":"Task GID to update (required)"},"name":{"type":"string","description":"Updated task name"},"assignee":{"type":"string","description":"Assignee user GID"},"due_at":{"type":"string","description":"Due date/time in ISO 8601 format"},"due_on":{"type":"string","description":"Due date (date only, YYYY-MM-DD)"},"completed":{"type":"boolean","description":"Whether the task is completed"},"notes":{"type":"string","description":"Task notes/description"},"projects":{"type":"array","items":{"type":"string"},"description":"Array of project GIDs"},"tags":{"type":"array","items":{"type":"string"},"description":"Array of tag GIDs"},"workspace":{"type":"string","description":"Workspace GID"},"parent":{"type":"string","description":"Parent task GID"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 3),

-- Destructive actions
('asana', 'Asana', 'delete_task',
 'Delete a task by its GID. This action is irreversible.',
 'https://app.asana.com/api/1.0/tasks', 'DELETE', 'asana',
 '{"type":"object","properties":{"id":{"type":"string","description":"Task GID to delete (required)"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 4)
ON CONFLICT (provider, action_name) DO NOTHING;
