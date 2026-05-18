-- Migration: Seed Zoom actions into oauth_action_catalog
-- 5 actions: create-meeting, create-user, delete-meeting, delete-user, whoami

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('zoom', 'Zoom', 'whoami',
 'Fetch current authenticated Zoom user information.',
 'https://api.zoom.us/v2/users/me', 'GET', 'zoom',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

-- Write actions
('zoom', 'Zoom', 'create_meeting',
 'Creates a meeting in Zoom. Supports instant, scheduled, recurring, and screen-share-only meeting types with configurable settings.',
 'https://api.zoom.us/v2/users/me/meetings', 'POST', 'zoom',
 '{"type":"object","properties":{"topic":{"type":"string","description":"Meeting topic/title"},"type":{"type":"string","enum":["instant","scheduled","recurringNoFixed","recurring","screenShareOnly"],"description":"Meeting type"},"agenda":{"type":"string","description":"Meeting agenda/description"},"duration":{"type":"number","description":"Meeting duration in minutes"},"password":{"type":"string","description":"Meeting password"},"recurrence":{"type":"object","properties":{"type":{"type":"string","enum":["daily","weekly","monthly"]},"repeat_interval":{"type":"number"},"weekly_days":{"type":"string","enum":["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]},"end_times":{"type":"number"},"end_date_time":{"type":"string"}},"description":"Recurrence settings for recurring meetings"},"settings":{"type":"object","properties":{"host_video":{"type":"boolean"},"participant_video":{"type":"boolean"},"join_before_host":{"type":"boolean"},"mute_upon_entry":{"type":"boolean"},"auto_recording":{"type":"string","enum":["local","cloud","none"]}},"description":"Meeting settings"}},"required":["topic","type"],"additionalProperties":false}'::jsonb,
 'write', false, false, 1),

('zoom', 'Zoom', 'create_user',
 'Creates a user in Zoom. Requires Pro account or higher. Supports create, autoCreate, custCreate, and ssoCreate actions.',
 'https://api.zoom.us/v2/users', 'POST', 'zoom',
 '{"type":"object","properties":{"firstName":{"type":"string","description":"User first name"},"lastName":{"type":"string","description":"User last name"},"email":{"type":"string","description":"User email address"},"action":{"type":"string","enum":["create","autoCreate","custCreate","ssoCreate"],"description":"User creation action type"},"display_name":{"type":"string","description":"Display name"}},"required":["firstName","lastName","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

-- Destructive actions
('zoom', 'Zoom', 'delete_meeting',
 'Deletes a meeting in Zoom by meeting ID.',
 'https://api.zoom.us/v2/meetings/:id', 'DELETE', 'zoom',
 '{"type":"object","properties":{"id":{"type":"string","description":"The meeting ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 3),

('zoom', 'Zoom', 'delete_user',
 'Deletes a user in Zoom by user ID. Requires Pro account or higher.',
 'https://api.zoom.us/v2/users/:id', 'DELETE', 'zoom',
 '{"type":"object","properties":{"id":{"type":"string","description":"The user ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 4)
ON CONFLICT (provider, action_name) DO NOTHING;
