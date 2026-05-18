-- Migration: Seed Aircall actions into oauth_action_catalog
-- 2 actions total: 1 write + 1 destructive

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Write actions
('aircall', 'Aircall', 'create_user',
 'Creates a user in Aircall with first name, last name, and email.',
 'https://api.aircall.io/v1/users', 'POST', 'aircall',
 '{"type":"object","properties":{"firstName":{"type":"string","description":"First name of the user"},"lastName":{"type":"string","description":"Last name of the user"},"email":{"type":"string","description":"Email address of the user"}},"required":["firstName","lastName","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0),

-- Destructive actions
('aircall', 'Aircall', 'delete_user',
 'Deletes a user in Aircall by ID. This action is irreversible.',
 'https://api.aircall.io/v1/users', 'DELETE', 'aircall',
 '{"type":"object","properties":{"id":{"type":"string","description":"The user ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 1)
ON CONFLICT (provider, action_name) DO NOTHING;
