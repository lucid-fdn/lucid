-- Migration: Seed Airtable actions into oauth_action_catalog
-- 4 actions: whoami, list_webhooks, create_webhook, delete_webhook

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('airtable', 'Airtable', 'whoami',
 'Fetch current user information (user ID and email).',
 'https://api.airtable.com/v0/meta/whoami', 'GET', 'airtable',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('airtable', 'Airtable', 'list_webhooks',
 'List all webhooks available for an Airtable base.',
 'https://api.airtable.com/v0/bases/:baseId/webhooks', 'GET', 'airtable',
 '{"type":"object","properties":{"baseId":{"type":"string","description":"The Airtable base ID"}},"required":["baseId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

-- Write actions
('airtable', 'Airtable', 'create_webhook',
 'Create a webhook for a particular Airtable base to receive change notifications.',
 'https://api.airtable.com/v0/bases/:baseId/webhooks', 'POST', 'airtable',
 '{"type":"object","properties":{"baseId":{"type":"string","description":"The Airtable base ID"},"specification":{"type":"object","description":"Webhook specification with filter options (dataTypes, changeTypes, fromSources)"}},"required":["baseId","specification"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

-- Destructive action
('airtable', 'Airtable', 'delete_webhook',
 'Delete an existing webhook from an Airtable base.',
 'https://api.airtable.com/v0/bases/:baseId/webhooks/:webhookId', 'DELETE', 'airtable',
 '{"type":"object","properties":{"baseId":{"type":"string","description":"The Airtable base ID"},"webhookId":{"type":"string","description":"The webhook ID to delete"}},"required":["baseId","webhookId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 3)
ON CONFLICT (provider, action_name) DO NOTHING;
