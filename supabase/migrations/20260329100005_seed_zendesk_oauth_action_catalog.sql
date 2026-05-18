-- Migration: Seed Zendesk actions into oauth_action_catalog
-- 8 actions total: 3 read + 3 write + 1 destructive + 1 read (no input)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('zendesk', 'Zendesk', 'search_tickets',
 'Search for tickets in Zendesk based on a query string. It can take up to a few minutes for new tickets and users to be indexed for search.',
 'https://zendesk.com/api/v2/search.json', 'GET', 'zendesk',
 '{"type":"object","properties":{"query":{"type":"string","description":"Zendesk search query string (e.g. status:open, assignee:me, tags:urgent)"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('zendesk', 'Zendesk', 'fetch_article',
 'Fetch a single full help center article by ID.',
 'https://zendesk.com/api/v2/help_center/articles', 'GET', 'zendesk',
 '{"type":"object","properties":{"id":{"type":"string","description":"The article ID to fetch"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('zendesk', 'Zendesk', 'fetch_articles',
 'Fetch all help center articles metadata. Returns a list of article titles, IDs, and URLs.',
 'https://zendesk.com/api/v2/help_center/articles', 'GET', 'zendesk',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

-- Write actions
('zendesk', 'Zendesk', 'create_ticket',
 'Create a Zendesk ticket with comment body, optional assignee, type, status, and metadata.',
 'https://zendesk.com/api/v2/tickets', 'POST', 'zendesk',
 '{"type":"object","properties":{"ticket":{"type":"object","properties":{"comment":{"type":"object","properties":{"body":{"type":"string","description":"Plain text comment body"},"html_body":{"type":"string","description":"HTML comment body"}},"additionalProperties":false},"assignee_email":{"type":"string","description":"Email of the assignee"},"assignee_id":{"type":"number","description":"ID of the assignee"},"brand_id":{"type":"number","description":"Brand ID"},"due_at":{"type":"string","description":"Due date in ISO 8601 format"},"type":{"type":"string","enum":["problem","incident","question","task"],"description":"Ticket type"},"status":{"type":"string","enum":["new","open","pending","hold","solved","closed"],"description":"Ticket status"},"metadata":{"type":"object","description":"Additional metadata"}},"additionalProperties":false},"required":["ticket"]},"required":["ticket"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('zendesk', 'Zendesk', 'create_user',
 'Create an admin or agent user in Zendesk. Defaults to agent if a role is not provided.',
 'https://zendesk.com/api/v2/users', 'POST', 'zendesk',
 '{"type":"object","properties":{"firstName":{"type":"string","description":"First name of the user"},"lastName":{"type":"string","description":"Last name of the user"},"email":{"type":"string","description":"Email address of the user"},"role":{"type":"string","enum":["admin","agent"],"description":"User role (defaults to agent)"}},"required":["firstName","lastName","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4),

('zendesk', 'Zendesk', 'create_category',
 'Create a category within the help center for organizing sections and articles.',
 'https://zendesk.com/api/v2/help_center/categories', 'POST', 'zendesk',
 '{"type":"object","properties":{"category":{"type":"object","properties":{"name":{"type":"string","description":"Category name"},"description":{"type":"string","description":"Category description"}},"required":["name"],"additionalProperties":false}},"required":["category"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

('zendesk', 'Zendesk', 'create_section',
 'Create a section within a category in the help center.',
 'https://zendesk.com/api/v2/help_center/sections', 'POST', 'zendesk',
 '{"type":"object","properties":{"category_id":{"type":"number","description":"ID of the parent category"},"section":{"type":"object","properties":{"name":{"type":"string","description":"Section name"},"description":{"type":"string","description":"Section description"}},"required":["name"],"additionalProperties":false}},"required":["category_id","section"],"additionalProperties":false}'::jsonb,
 'write', false, false, 6),

-- Destructive actions
('zendesk', 'Zendesk', 'delete_user',
 'Delete a user in Zendesk by ID. This action is irreversible.',
 'https://zendesk.com/api/v2/users', 'DELETE', 'zendesk',
 '{"type":"object","properties":{"id":{"type":"string","description":"The user ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 7)
ON CONFLICT (provider, action_name) DO NOTHING;
