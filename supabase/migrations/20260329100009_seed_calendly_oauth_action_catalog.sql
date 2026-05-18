-- Migration: Seed Calendly actions into oauth_action_catalog
-- 3 actions: whoami, create-user, delete-user

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('calendly', 'Calendly', 'whoami',
 'Fetch current authenticated Calendly user information.',
 'https://api.calendly.com/users/me', 'GET', 'calendly',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

-- Write actions
('calendly', 'Calendly', 'create_user',
 'Creates a user in Calendly by inviting them via email to the organization.',
 'https://api.calendly.com/organizations/:org_id/invitations', 'POST', 'calendly',
 '{"type":"object","properties":{"email":{"type":"string","description":"Email address of the user to invite"}},"required":["email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 1),

-- Destructive actions
('calendly', 'Calendly', 'delete_user',
 'Deletes a user from the Calendly organization by membership ID.',
 'https://api.calendly.com/organization_memberships/:id', 'DELETE', 'calendly',
 '{"type":"object","properties":{"id":{"type":"string","description":"The organization membership ID to remove"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 2)
ON CONFLICT (provider, action_name) DO NOTHING;
