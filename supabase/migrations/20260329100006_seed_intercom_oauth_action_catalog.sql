-- Migration: Seed Intercom actions into oauth_action_catalog
-- 4 actions total: 2 read + 1 write + 1 destructive

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('intercom', 'Intercom', 'whoami',
 'Fetch current authenticated user information from Intercom.',
 'https://api.intercom.io/me', 'GET', 'intercom',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('intercom', 'Intercom', 'fetch_article',
 'Fetch a single article from Intercom by ID.',
 'https://api.intercom.io/articles', 'GET', 'intercom',
 '{"type":"object","properties":{"id":{"type":"string","description":"The article ID to fetch"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

-- Write actions
('intercom', 'Intercom', 'create_contact',
 'Creates a contact in Intercom with name, email, and optional fields like phone, avatar, and external ID.',
 'https://api.intercom.io/contacts', 'POST', 'intercom',
 '{"type":"object","properties":{"firstName":{"type":"string","description":"First name of the contact"},"lastName":{"type":"string","description":"Last name of the contact"},"email":{"type":"string","description":"Email address of the contact"},"external_id":{"type":"string","description":"External ID for the contact"},"phone":{"type":"string","description":"Phone number"},"avatar":{"type":"string","description":"URL of the avatar image"},"signed_up_at":{"type":"number","description":"Unix timestamp of when the contact signed up"},"last_seen_at":{"type":"number","description":"Unix timestamp of when the contact was last seen"},"owner_id":{"type":"string","description":"ID of the admin who owns this contact"},"unsubscribed_from_emails":{"type":"boolean","description":"Whether the contact is unsubscribed from emails"}},"required":["firstName","lastName","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

-- Destructive actions
('intercom', 'Intercom', 'delete_contact',
 'Deletes a contact in Intercom by ID. This action is irreversible.',
 'https://api.intercom.io/contacts', 'DELETE', 'intercom',
 '{"type":"object","properties":{"id":{"type":"string","description":"The contact ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 3)
ON CONFLICT (provider, action_name) DO NOTHING;
