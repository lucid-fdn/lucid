-- Migration: Seed Fireflies actions into oauth_action_catalog
-- 1 action: add-to-live

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Write actions
('fireflies', 'Fireflies', 'add_to_live',
 'Add the Fireflies.ai bot to an ongoing meeting for live transcription. Sends a GraphQL mutation to the Fireflies API.',
 'https://api.fireflies.ai/graphql', 'POST', 'fireflies',
 '{"type":"object","properties":{"query":{"type":"string","description":"GraphQL mutation query to add bot to meeting"},"variables":{"type":"object","description":"GraphQL variables for the mutation"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0)
ON CONFLICT (provider, action_name) DO NOTHING;
