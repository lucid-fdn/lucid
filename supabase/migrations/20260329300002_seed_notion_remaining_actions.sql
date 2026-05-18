-- Migration: Seed remaining Notion actions into oauth_action_catalog
-- 9 new actions: 5 read + 3 write + 1 archive (4 already in DB: search, get_database, query_database, create_page)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- ═══════════════════════════════════════════════════════════════
-- Read actions
-- ═══════════════════════════════════════════════════════════════

('notion', 'Notion', 'get_page',
 'Get a Notion page with its properties and content blocks.',
 'https://api.notion.com/v1/pages/:page_id', 'GET', 'notion',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Notion page ID"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('notion', 'Notion', 'retrieve_page',
 'Fetch page properties and metadata by page ID.',
 'https://api.notion.com/v1/pages/:page_id', 'GET', 'notion',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Notion page ID"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('notion', 'Notion', 'retrieve_block_children',
 'Get paginated list of child blocks within a block or page.',
 'https://api.notion.com/v1/blocks/:block_id/children', 'GET', 'notion',
 '{"type":"object","properties":{"block_id":{"type":"string","description":"Block or page ID"},"page_size":{"type":"number","description":"Number of results per page (max 100)"},"cursor":{"type":"string","description":"Pagination cursor"}},"required":["block_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('notion', 'Notion', 'list_comments',
 'Retrieve unresolved comments from a page or block.',
 'https://api.notion.com/v1/comments', 'GET', 'notion',
 '{"type":"object","properties":{"block_id":{"type":"string","description":"Block or page ID to retrieve comments from"},"page_size":{"type":"number","description":"Number of results per page (max 100)"},"cursor":{"type":"string","description":"Pagination cursor"}},"required":["block_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('notion', 'Notion', 'list_users',
 'Get paginated list of all workspace users.',
 'https://api.notion.com/v1/users', 'GET', 'notion',
 '{"type":"object","properties":{"page_size":{"type":"number","description":"Number of results per page (max 100)"},"cursor":{"type":"string","description":"Pagination cursor"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 8),

-- ═══════════════════════════════════════════════════════════════
-- Write actions
-- ═══════════════════════════════════════════════════════════════

('notion', 'Notion', 'update_page',
 'Modify page properties, icon, cover, or archived status.',
 'https://api.notion.com/v1/pages/:page_id', 'PATCH', 'notion',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Notion page ID"},"properties":{"type":"object","description":"Page properties to update"},"icon":{"type":"object","description":"Page icon (emoji or external URL)"},"cover":{"type":"object","description":"Page cover image"},"archived":{"type":"boolean","description":"Set to true to archive the page"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 9),

('notion', 'Notion', 'append_block_children',
 'Add new child blocks to a page or block (max 100).',
 'https://api.notion.com/v1/blocks/:block_id/children', 'PATCH', 'notion',
 '{"type":"object","properties":{"block_id":{"type":"string","description":"Block or page ID to append children to"},"children":{"type":"array","items":{"type":"object","additionalProperties":true},"description":"Array of block objects to append (max 100)"},"after":{"type":"string","description":"Block ID to append after"}},"required":["block_id","children"],"additionalProperties":false}'::jsonb,
 'write', false, false, 10),

('notion', 'Notion', 'create_comment',
 'Add a comment to a page or existing discussion thread.',
 'https://api.notion.com/v1/comments', 'POST', 'notion',
 '{"type":"object","properties":{"parent":{"type":"object","properties":{"page_id":{"type":"string","description":"Page ID to comment on"}},"description":"Parent page reference"},"rich_text":{"type":"array","description":"Comment content as rich text array"},"discussion_id":{"type":"string","description":"Discussion thread ID to reply to"}},"required":["rich_text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 11),

-- ═══════════════════════════════════════════════════════════════
-- Archive action (write, not destructive — reversible)
-- ═══════════════════════════════════════════════════════════════

('notion', 'Notion', 'archive_page',
 'Move a page to trash by setting archived to true.',
 'https://api.notion.com/v1/pages/:page_id', 'POST', 'notion',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Notion page ID to archive"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 12)

ON CONFLICT (provider, action_name) DO NOTHING;
