-- Migration: Seed remaining Slack actions into oauth_action_catalog
-- 20 new actions: 8 read + 10 write + 1 destructive (3 already in DB: send_message, list_channels, list_users)

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- ═══════════════════════════════════════════════════════════════
-- Read actions
-- ═══════════════════════════════════════════════════════════════

('slack', 'Slack', 'get_channel_info',
 'Retrieve conversation details including topic, purpose, and membership state.',
 'https://slack.com/api/conversations.info', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"}},"required":["channel_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('slack', 'Slack', 'get_conversation_history',
 'Fetch paginated message history for a conversation within optional time bounds.',
 'https://slack.com/api/conversations.history', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"limit":{"type":"number","description":"Number of messages to return (default 100, max 1000)"},"oldest":{"type":"string","description":"Start of time range (Unix timestamp)"},"latest":{"type":"string","description":"End of time range (Unix timestamp)"},"cursor":{"type":"string","description":"Pagination cursor"}},"required":["channel_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('slack', 'Slack', 'get_thread_replies',
 'Fetch paginated thread replies for a conversation thread.',
 'https://slack.com/api/conversations.replies', 'GET', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"ts":{"type":"string","description":"Thread timestamp of the parent message"},"limit":{"type":"number","description":"Number of replies to return"},"cursor":{"type":"string","description":"Pagination cursor"}},"required":["channel_id","ts"],"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('slack', 'Slack', 'get_user_info',
 'Retrieve a user''s account details including profile and avatar fields.',
 'https://slack.com/api/users.info', 'GET', 'slack',
 '{"type":"object","properties":{"user_id":{"type":"string","description":"User ID"}},"required":["user_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('slack', 'Slack', 'list_conversations',
 'List Slack conversations with optional type filters and cursor pagination.',
 'https://slack.com/api/conversations.list', 'GET', 'slack',
 '{"type":"object","properties":{"types":{"type":"string","description":"Comma-separated list of channel types (public_channel, private_channel, mpim, im)"},"limit":{"type":"number","description":"Number of conversations to return (default 100, max 1000)"},"cursor":{"type":"string","description":"Pagination cursor"},"exclude_archived":{"type":"boolean","description":"Exclude archived channels (default true)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('slack', 'Slack', 'list_pins',
 'List all items pinned in a specific channel.',
 'https://slack.com/api/pins.list', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"}},"required":["channel_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 8),

('slack', 'Slack', 'search_messages',
 'Search for messages in Slack matching a query string.',
 'https://slack.com/api/search.messages', 'GET', 'slack',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query string"},"count":{"type":"number","description":"Number of results per page (default 20, max 100)"},"page":{"type":"number","description":"Page number"},"sort":{"type":"string","description":"Sort order: score or timestamp"},"sort_dir":{"type":"string","description":"Sort direction: asc or desc"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 9),

('slack', 'Slack', 'search_files',
 'Search workspace files with pagination.',
 'https://slack.com/api/search.files', 'POST', 'slack',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query string"},"count":{"type":"number","description":"Number of results per page (default 20, max 100)"},"page":{"type":"number","description":"Page number"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 10),

('slack', 'Slack', 'find_user_by_email',
 'Look up a Slack user by email address.',
 'https://slack.com/api/users.lookupByEmail', 'POST', 'slack',
 '{"type":"object","properties":{"email":{"type":"string","description":"Email address to look up"}},"required":["email"],"additionalProperties":false}'::jsonb,
 'read', true, true, 11),

-- ═══════════════════════════════════════════════════════════════
-- Write actions
-- ═══════════════════════════════════════════════════════════════

('slack', 'Slack', 'post_message',
 'Post a message to a channel, DM, or thread.',
 'https://slack.com/api/chat.postMessage', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"text":{"type":"string","description":"Message text"},"thread_ts":{"type":"string","description":"Thread timestamp to reply in"},"unfurl_links":{"type":"boolean","description":"Enable link unfurling"},"unfurl_media":{"type":"boolean","description":"Enable media unfurling"}},"required":["channel_id","text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 11),

('slack', 'Slack', 'create_conversation',
 'Create a new public or private Slack channel.',
 'https://slack.com/api/conversations.create', 'POST', 'slack',
 '{"type":"object","properties":{"name":{"type":"string","description":"Channel name"},"is_private":{"type":"boolean","description":"Whether the channel is private (default false)"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 12),

('slack', 'Slack', 'add_reaction',
 'Add an emoji reaction to a specific Slack message.',
 'https://slack.com/api/reactions.add', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"timestamp":{"type":"string","description":"Timestamp of the message to react to"},"name":{"type":"string","description":"Emoji name without colons (e.g. thumbsup)"}},"required":["channel_id","timestamp","name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 13),

('slack', 'Slack', 'schedule_message',
 'Schedule a Slack message to a channel or thread.',
 'https://slack.com/api/chat.scheduleMessage', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"text":{"type":"string","description":"Message text"},"post_at":{"type":"number","description":"Unix timestamp for when the message should be sent"},"thread_ts":{"type":"string","description":"Thread timestamp to reply in"}},"required":["channel_id","text","post_at"],"additionalProperties":false}'::jsonb,
 'write', false, false, 14),

('slack', 'Slack', 'send_ephemeral_message',
 'Send a message visible only to one user in a channel.',
 'https://slack.com/api/chat.postEphemeral', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"user_id":{"type":"string","description":"User ID who will see the ephemeral message"},"text":{"type":"string","description":"Message text"}},"required":["channel_id","user_id","text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 15),

('slack', 'Slack', 'set_channel_purpose',
 'Update a channel''s purpose text.',
 'https://slack.com/api/conversations.setPurpose', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"purpose":{"type":"string","description":"New purpose text for the channel"}},"required":["channel_id","purpose"],"additionalProperties":false}'::jsonb,
 'write', false, false, 16),

('slack', 'Slack', 'set_channel_topic',
 'Set the topic of a channel.',
 'https://slack.com/api/conversations.setTopic', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"topic":{"type":"string","description":"New topic text for the channel"}},"required":["channel_id","topic"],"additionalProperties":false}'::jsonb,
 'write', false, false, 17),

('slack', 'Slack', 'update_message',
 'Edit an existing message in a Slack channel.',
 'https://slack.com/api/chat.update', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"ts":{"type":"string","description":"Timestamp of the message to update"},"text":{"type":"string","description":"Updated message text"}},"required":["channel_id","ts","text"],"additionalProperties":false}'::jsonb,
 'write', true, false, 18),

('slack', 'Slack', 'join_channel',
 'Join a public or private channel.',
 'https://slack.com/api/conversations.join', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"}},"required":["channel_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 19),

('slack', 'Slack', 'mark_as_read',
 'Move a conversation''s read cursor to a specific message timestamp.',
 'https://slack.com/api/conversations.mark', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"ts":{"type":"string","description":"Timestamp of the message to mark as read"}},"required":["channel_id","ts"],"additionalProperties":false}'::jsonb,
 'write', false, false, 20),

-- ═══════════════════════════════════════════════════════════════
-- Destructive actions
-- ═══════════════════════════════════════════════════════════════

('slack', 'Slack', 'delete_message',
 'Delete a message from a channel.',
 'https://slack.com/api/chat.delete', 'POST', 'slack',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID"},"ts":{"type":"string","description":"Timestamp of the message to delete"}},"required":["channel_id","ts"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 21)

ON CONFLICT (provider, action_name) DO NOTHING;
