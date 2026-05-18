-- Migration: Seed Jira actions into oauth_action_catalog
-- 1 action total: 1 write (create-issue)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Write actions
('jira', 'Jira', 'create_issue',
 'Create an issue in Jira with summary, issue type, project, and optional description, assignee, and labels.',
 'https://api.atlassian.com/ex/jira', 'POST', 'jira',
 '{"type":"object","properties":{"summary":{"type":"string","description":"Issue summary/title (required)"},"description":{"type":"string","description":"Issue description"},"assignee":{"type":"string","description":"Account ID of the assignee"},"labels":{"type":"array","items":{"type":"string"},"description":"Array of label names to apply"},"project":{"type":"string","description":"Project key (e.g. PROJ) (required)"},"issueType":{"type":"string","description":"Issue type name (e.g. Bug, Task, Story) (required)"}},"required":["summary","project","issueType"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0)
ON CONFLICT (provider, action_name) DO NOTHING;
