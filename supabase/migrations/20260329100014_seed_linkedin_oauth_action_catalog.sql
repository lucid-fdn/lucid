-- Migration: Seed LinkedIn actions into oauth_action_catalog
-- 1 action: post

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Write action
('linkedin', 'LinkedIn', 'post',
 'Create a LinkedIn post with optional video attachment. Posts as the authenticated user.',
 'https://api.linkedin.com/rest/posts', 'POST', 'linkedin',
 '{"type":"object","properties":{"text":{"type":"string","description":"Post text content (commentary)"},"videoURN":{"type":"string","description":"LinkedIn video/image/document URN (must start with urn:). Optional."},"videoTitle":{"type":"string","description":"Title for the video attachment. Required if videoURN is provided."},"ownerId":{"type":"string","description":"LinkedIn person ID. Omit to use the authenticated user."}},"required":["text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0)
ON CONFLICT (provider, action_name) DO NOTHING;
