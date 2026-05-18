-- Migration: Seed GitHub actions into oauth_action_catalog
-- 5 actions: list_repos, list_issues, list_pull_requests, create_issue, write_file

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('github', 'GitHub', 'list_repos',
 'List GitHub repositories for the authenticated user.',
 'https://api.github.com/user/repos', 'GET', 'github',
 '{"type":"object","properties":{"type":{"type":"string","enum":["all","owner","member"],"description":"Filter by repo type (default: all)"},"sort":{"type":"string","enum":["created","updated","pushed","full_name"],"description":"Sort field (default: updated)"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (1-100, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('github', 'GitHub', 'list_issues',
 'List issues in a GitHub repository. Filters out pull requests.',
 'https://api.github.com/repos/:owner/:repo/issues', 'GET', 'github',
 '{"type":"object","properties":{"owner":{"type":"string","description":"Repository owner (user or org)"},"repo":{"type":"string","description":"Repository name"},"state":{"type":"string","enum":["open","closed","all"],"description":"Issue state filter (default: open)"},"labels":{"type":"string","description":"Comma-separated label names"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (1-100, default 10)"}},"required":["owner","repo"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('github', 'GitHub', 'list_pull_requests',
 'List pull requests in a GitHub repository.',
 'https://api.github.com/repos/:owner/:repo/pulls', 'GET', 'github',
 '{"type":"object","properties":{"owner":{"type":"string","description":"Repository owner (user or org)"},"repo":{"type":"string","description":"Repository name"},"state":{"type":"string","enum":["open","closed","all"],"description":"PR state filter (default: open)"},"per_page":{"type":"number","minimum":1,"maximum":100,"description":"Results per page (1-100, default 10)"}},"required":["owner","repo"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

-- Write actions
('github', 'GitHub', 'create_issue',
 'Create a new issue in a GitHub repository.',
 'https://api.github.com/repos/:owner/:repo/issues', 'POST', 'github',
 '{"type":"object","properties":{"owner":{"type":"string","description":"Repository owner (user or org)"},"repo":{"type":"string","description":"Repository name"},"title":{"type":"string","description":"Issue title"},"body":{"type":"string","description":"Issue body (markdown supported)"},"labels":{"type":"array","items":{"type":"string"},"description":"Label names to apply"},"assignees":{"type":"array","items":{"type":"string"},"description":"Usernames to assign"}},"required":["owner","repo","title"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('github', 'GitHub', 'write_file',
 'Write content to a file in a GitHub repository. Creates the file if it does not exist, updates it otherwise.',
 'https://api.github.com/repos/:owner/:repo/contents/:path', 'PUT', 'github',
 '{"type":"object","properties":{"owner":{"type":"string","description":"Repository owner (user or org)"},"repo":{"type":"string","description":"Repository name"},"path":{"type":"string","description":"File path within the repository"},"message":{"type":"string","description":"Commit message for the file change"},"content":{"type":"string","description":"File content (plain text, will be base64-encoded)"},"sha":{"type":"string","description":"SHA of the file being replaced (required for updates, omit for new files)"}},"required":["owner","repo","path","message","content"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4)
ON CONFLICT (provider, action_name) DO NOTHING;
