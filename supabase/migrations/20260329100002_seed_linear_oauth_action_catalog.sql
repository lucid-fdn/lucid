-- Migration: Seed Linear actions into oauth_action_catalog
-- 4 actions total: 2 read (fetch-teams, fetch-fields, fetch-models) + 1 write (create-issue)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('linear', 'Linear', 'fetch_teams',
 'Fetch the teams from Linear with optional pagination.',
 'https://api.linear.app/graphql', 'POST', 'linear',
 '{"type":"object","properties":{"after":{"type":"string","description":"Pagination cursor for fetching the next page"},"pageSize":{"type":"number","description":"Number of teams per page (default 50)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('linear', 'Linear', 'fetch_fields',
 'Introspection endpoint to fetch the fields available for a given Linear model/entity.',
 'https://api.linear.app/graphql', 'POST', 'linear',
 '{"type":"object","properties":{"name":{"type":"string","description":"Name of the Linear entity/model to introspect (e.g. Issue, Project, Team)"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('linear', 'Linear', 'fetch_models',
 'Introspection endpoint to fetch the models (entity types) available in the Linear API.',
 'https://api.linear.app/graphql', 'POST', 'linear',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

-- Write actions
('linear', 'Linear', 'create_issue',
 'Create an issue in Linear with title, team, and optional fields like description, assignee, priority, project, milestone, estimate, and due date.',
 'https://api.linear.app/graphql', 'POST', 'linear',
 '{"type":"object","properties":{"teamId":{"type":"string","description":"ID of the team to create the issue in (required)"},"title":{"type":"string","description":"Issue title (required)"},"description":{"type":"string","description":"Issue description (markdown supported)"},"projectId":{"type":"string","description":"ID of the project to associate the issue with"},"milestoneId":{"type":"string","description":"ID of the project milestone"},"assigneeId":{"type":"string","description":"ID of the user to assign the issue to"},"priority":{"type":"number","description":"Priority level (0=none, 1=urgent, 2=high, 3=medium, 4=low)"},"parentId":{"type":"string","description":"ID of the parent issue (for sub-issues)"},"estimate":{"type":"number","description":"Story point estimate"},"dueDate":{"type":"string","description":"Due date in ISO 8601 format"}},"required":["teamId","title"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3)
ON CONFLICT (provider, action_name) DO NOTHING;
