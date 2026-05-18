-- Migration: Seed Gong actions into oauth_action_catalog
-- 1 action: fetch-call-transcripts

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('gong', 'Gong', 'fetch_call_transcripts',
 'Fetches a list of call transcripts from Gong. Supports filtering by date range, workspace, and specific call IDs. Returns transcripts with speaker IDs, topics, and timestamped sentences.',
 'https://api.gong.io/v2/calls/transcript', 'POST', 'gong',
 '{"type":"object","properties":{"from":{"type":"string","description":"Start date filter (ISO 8601 format)"},"to":{"type":"string","description":"End date filter (ISO 8601 format)"},"workspace_id":{"type":"string","description":"Gong workspace ID to filter by"},"call_id":{"type":"array","items":{"type":"string"},"description":"Array of specific call IDs to fetch transcripts for"},"cursor":{"type":"string","description":"Pagination cursor for fetching next page of results"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0)
ON CONFLICT (provider, action_name) DO NOTHING;
