-- Migration: Seed Tier 2 OAuth actions into oauth_action_catalog
-- 14 providers, 47 actions total

-- ═══════════════════════════════════════════════════════════════
-- Discord (5 actions: 4 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('discord', 'Discord', 'list_guilds',
 'List guilds the authenticated user belongs to.',
 'https://discord.com/api/v10/users/@me/guilds', 'GET', 'discord',
 '{"type":"object","properties":{"limit":{"type":"number","minimum":1,"maximum":200,"description":"Max guilds to return (1-200, default 200)"},"before":{"type":"string","description":"Get guilds before this guild ID"},"after":{"type":"string","description":"Get guilds after this guild ID"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('discord', 'Discord', 'list_channels',
 'List channels in a guild.',
 'https://discord.com/api/v10/guilds/:guild_id/channels', 'GET', 'discord',
 '{"type":"object","properties":{"guild_id":{"type":"string","description":"Guild ID (required)"}},"required":["guild_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('discord', 'Discord', 'get_guild_info',
 'Get detailed information about a guild.',
 'https://discord.com/api/v10/guilds/:guild_id', 'GET', 'discord',
 '{"type":"object","properties":{"guild_id":{"type":"string","description":"Guild ID (required)"},"with_counts":{"type":"boolean","description":"Include approximate member and presence counts"}},"required":["guild_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('discord', 'Discord', 'list_members',
 'List members of a guild with pagination.',
 'https://discord.com/api/v10/guilds/:guild_id/members', 'GET', 'discord',
 '{"type":"object","properties":{"guild_id":{"type":"string","description":"Guild ID (required)"},"limit":{"type":"number","minimum":1,"maximum":1000,"description":"Max members to return (1-1000, default 1)"},"after":{"type":"string","description":"Get members after this user ID"}},"required":["guild_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('discord', 'Discord', 'send_message',
 'Send a message to a channel.',
 'https://discord.com/api/v10/channels/:channel_id/messages', 'POST', 'discord',
 '{"type":"object","properties":{"channel_id":{"type":"string","description":"Channel ID (required)"},"content":{"type":"string","description":"Message content (required, max 2000 chars)"}},"required":["channel_id","content"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Trello (5 actions: 3 read + 2 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('trello', 'Trello', 'list_boards',
 'List boards the authenticated user has access to.',
 'https://api.trello.com/1/members/me/boards', 'GET', 'trello',
 '{"type":"object","properties":{"filter":{"type":"string","enum":["all","closed","members","open","organization","public","starred"],"description":"Filter boards (default: all)"},"fields":{"type":"string","description":"Comma-separated board fields to return"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('trello', 'Trello', 'list_cards',
 'List cards in a Trello list.',
 'https://api.trello.com/1/lists/:list_id/cards', 'GET', 'trello',
 '{"type":"object","properties":{"list_id":{"type":"string","description":"List ID (required)"},"filter":{"type":"string","enum":["all","closed","none","open","visible"],"description":"Filter cards (default: visible)"}},"required":["list_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('trello', 'Trello', 'list_lists',
 'List all lists on a board.',
 'https://api.trello.com/1/boards/:board_id/lists', 'GET', 'trello',
 '{"type":"object","properties":{"board_id":{"type":"string","description":"Board ID (required)"},"filter":{"type":"string","enum":["all","closed","none","open"],"description":"Filter lists (default: all)"}},"required":["board_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('trello', 'Trello', 'create_card',
 'Create a new card on a Trello list.',
 'https://api.trello.com/1/cards', 'POST', 'trello',
 '{"type":"object","properties":{"name":{"type":"string","description":"Card name (required)"},"idList":{"type":"string","description":"List ID to create the card in (required)"},"desc":{"type":"string","description":"Card description"},"pos":{"type":"string","description":"Position: top, bottom, or a positive float"},"due":{"type":"string","description":"Due date in ISO 8601 format"},"idLabels":{"type":"string","description":"Comma-separated label IDs"},"idMembers":{"type":"string","description":"Comma-separated member IDs"}},"required":["name","idList"],"additionalProperties":false}'::jsonb,
 'write', false, false, 3),

('trello', 'Trello', 'update_card',
 'Update an existing Trello card.',
 'https://api.trello.com/1/cards/:card_id', 'PUT', 'trello',
 '{"type":"object","properties":{"card_id":{"type":"string","description":"Card ID (required)"},"name":{"type":"string","description":"Updated card name"},"desc":{"type":"string","description":"Updated description"},"closed":{"type":"boolean","description":"Whether the card is archived"},"idList":{"type":"string","description":"Move card to this list ID"},"due":{"type":"string","description":"Due date in ISO 8601 format"},"dueComplete":{"type":"boolean","description":"Whether the due date is complete"}},"required":["card_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 4)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Reddit (4 actions: 3 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('reddit', 'Reddit', 'get_subreddit',
 'Get information about a subreddit.',
 'https://oauth.reddit.com/r/:subreddit/about', 'GET', 'reddit',
 '{"type":"object","properties":{"subreddit":{"type":"string","description":"Subreddit name without r/ prefix (required)"}},"required":["subreddit"],"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('reddit', 'Reddit', 'list_posts',
 'List hot posts from a subreddit.',
 'https://oauth.reddit.com/r/:subreddit/hot', 'GET', 'reddit',
 '{"type":"object","properties":{"subreddit":{"type":"string","description":"Subreddit name without r/ prefix (required)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of posts to return (1-100, default 25)"}},"required":["subreddit"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('reddit', 'Reddit', 'get_user_info',
 'Get information about the authenticated Reddit user.',
 'https://oauth.reddit.com/api/v1/me', 'GET', 'reddit',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('reddit', 'Reddit', 'create_post',
 'Create a new post in a subreddit.',
 'https://oauth.reddit.com/api/submit', 'POST', 'reddit',
 '{"type":"object","properties":{"sr":{"type":"string","description":"Subreddit name without r/ prefix (required)"},"title":{"type":"string","description":"Post title (required)"},"kind":{"type":"string","enum":["self","link"],"description":"Post type: self (text) or link (required)"},"text":{"type":"string","description":"Post body text (for self posts)"},"url":{"type":"string","description":"URL to link to (for link posts)"},"nsfw":{"type":"boolean","description":"Mark as NSFW"},"spoiler":{"type":"boolean","description":"Mark as spoiler"}},"required":["sr","title","kind"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 3)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- PayPal (4 actions: 2 read + 2 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('paypal', 'PayPal', 'get_balance',
 'Get the balance for all currencies in the PayPal account.',
 'https://api-m.paypal.com/v2/wallet/balance-accounts', 'GET', 'paypal',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('paypal', 'PayPal', 'list_transactions',
 'List transactions for the PayPal account within a date range.',
 'https://api-m.paypal.com/v1/reporting/transactions', 'GET', 'paypal',
 '{"type":"object","properties":{"start_date":{"type":"string","description":"Start date in ISO 8601 format (required)"},"end_date":{"type":"string","description":"End date in ISO 8601 format (required)"},"page_size":{"type":"number","minimum":1,"maximum":500,"description":"Results per page (1-500, default 100)"},"page":{"type":"number","minimum":1,"description":"Page number (default 1)"},"transaction_status":{"type":"string","description":"Filter by status (e.g. S for success, D for denied)"}},"required":["start_date","end_date"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('paypal', 'PayPal', 'create_invoice',
 'Create a draft invoice in PayPal.',
 'https://api-m.paypal.com/v2/invoicing/invoices', 'POST', 'paypal',
 '{"type":"object","properties":{"detail":{"type":"object","description":"Invoice detail object with invoice_number, invoice_date, currency_code, etc."},"primary_recipients":{"type":"array","items":{"type":"object"},"description":"Array of recipient objects with billing_info.email_address"},"items":{"type":"array","items":{"type":"object"},"description":"Array of item objects with name, quantity, unit_amount"}},"required":["detail","items"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2),

('paypal', 'PayPal', 'send_invoice',
 'Send an existing draft invoice to the recipient.',
 'https://api-m.paypal.com/v2/invoicing/invoices/:invoice_id/send', 'POST', 'paypal',
 '{"type":"object","properties":{"invoice_id":{"type":"string","description":"Invoice ID (required)"},"send_to_invoicer":{"type":"boolean","description":"Send a copy to the invoicer"},"send_to_recipient":{"type":"boolean","description":"Send to the recipient (default true)"}},"required":["invoice_id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 3)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Typeform (3 actions: 3 read)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('typeform', 'Typeform', 'list_forms',
 'List forms in the authenticated Typeform account.',
 'https://api.typeform.com/forms', 'GET', 'typeform',
 '{"type":"object","properties":{"page":{"type":"number","minimum":1,"description":"Page number (default 1)"},"page_size":{"type":"number","minimum":1,"maximum":200,"description":"Results per page (1-200, default 10)"},"search":{"type":"string","description":"Search by form title"},"workspace_id":{"type":"string","description":"Filter by workspace ID"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('typeform', 'Typeform', 'get_form_responses',
 'Get responses for a specific form.',
 'https://api.typeform.com/forms/:form_id/responses', 'GET', 'typeform',
 '{"type":"object","properties":{"form_id":{"type":"string","description":"Form ID (required)"},"page_size":{"type":"number","minimum":1,"maximum":1000,"description":"Responses per page (1-1000, default 25)"},"since":{"type":"string","description":"Responses after this date (ISO 8601)"},"until":{"type":"string","description":"Responses before this date (ISO 8601)"},"after":{"type":"string","description":"Pagination cursor (response token)"},"completed":{"type":"boolean","description":"Filter by completion status"}},"required":["form_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('typeform', 'Typeform', 'get_form',
 'Get details of a specific form including fields and settings.',
 'https://api.typeform.com/forms/:form_id', 'GET', 'typeform',
 '{"type":"object","properties":{"form_id":{"type":"string","description":"Form ID (required)"}},"required":["form_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Bitly (3 actions: 2 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('bitly', 'Bitly', 'create_link',
 'Create a shortened Bitly link.',
 'https://api-ssl.bitly.com/v4/shorten', 'POST', 'bitly',
 '{"type":"object","properties":{"long_url":{"type":"string","description":"The long URL to shorten (required)"},"domain":{"type":"string","description":"Custom domain (default: bit.ly)"},"title":{"type":"string","description":"Title for the link"},"group_guid":{"type":"string","description":"Group GUID to associate the link with"},"tags":{"type":"array","items":{"type":"string"},"description":"Tags to apply to the link"}},"required":["long_url"],"additionalProperties":false}'::jsonb,
 'write', false, false, 0),

('bitly', 'Bitly', 'list_links',
 'List shortened links (bitlinks) for the default group.',
 'https://api-ssl.bitly.com/v4/groups/:group_guid/bitlinks', 'GET', 'bitly',
 '{"type":"object","properties":{"group_guid":{"type":"string","description":"Group GUID (required, use default group)"},"size":{"type":"number","minimum":1,"maximum":100,"description":"Number of links to return (default 50)"},"page":{"type":"number","minimum":1,"description":"Page number"},"keyword":{"type":"string","description":"Filter by keyword in long URL"}},"required":["group_guid"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('bitly', 'Bitly', 'get_link_clicks',
 'Get click metrics for a specific bitlink.',
 'https://api-ssl.bitly.com/v4/bitlinks/:bitlink/clicks/summary', 'GET', 'bitly',
 '{"type":"object","properties":{"bitlink":{"type":"string","description":"Bitlink ID (e.g. bit.ly/abc123) (required)"},"unit":{"type":"string","enum":["minute","hour","day","week","month"],"description":"Time unit for aggregation (default: day)"},"units":{"type":"number","description":"Number of time units to query (-1 for all, default 30)"}},"required":["bitlink"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Instagram (3 actions: 3 read)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('instagram', 'Instagram', 'get_profile',
 'Get the authenticated Instagram user profile.',
 'https://graph.instagram.com/v18.0/me', 'GET', 'instagram',
 '{"type":"object","properties":{"fields":{"type":"string","description":"Comma-separated fields to return (default: id,username,media_count,account_type)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('instagram', 'Instagram', 'list_media',
 'List recent media posts for the authenticated user.',
 'https://graph.instagram.com/v18.0/me/media', 'GET', 'instagram',
 '{"type":"object","properties":{"fields":{"type":"string","description":"Comma-separated fields (default: id,caption,media_type,media_url,timestamp,permalink)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of media items to return (default 25)"},"after":{"type":"string","description":"Pagination cursor"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('instagram', 'Instagram', 'get_media_insights',
 'Get insights (engagement metrics) for a specific media post.',
 'https://graph.instagram.com/v18.0/:media_id/insights', 'GET', 'instagram',
 '{"type":"object","properties":{"media_id":{"type":"string","description":"Media ID (required)"},"metric":{"type":"string","description":"Comma-separated metrics (e.g. engagement,impressions,reach,saved)"}},"required":["media_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Facebook (3 actions: 2 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('facebook', 'Facebook', 'list_pages',
 'List Facebook Pages managed by the authenticated user.',
 'https://graph.facebook.com/v18.0/me/accounts', 'GET', 'facebook',
 '{"type":"object","properties":{"fields":{"type":"string","description":"Comma-separated fields (default: id,name,category,access_token)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of pages to return (default 25)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('facebook', 'Facebook', 'create_post',
 'Create a post on a Facebook Page.',
 'https://graph.facebook.com/v18.0/:page_id/feed', 'POST', 'facebook',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Page ID (required)"},"message":{"type":"string","description":"Post text content"},"link":{"type":"string","description":"URL to share"},"published":{"type":"boolean","description":"Publish immediately (default true)"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 1),

('facebook', 'Facebook', 'get_page_insights',
 'Get insights (analytics) for a Facebook Page.',
 'https://graph.facebook.com/v18.0/:page_id/insights', 'GET', 'facebook',
 '{"type":"object","properties":{"page_id":{"type":"string","description":"Page ID (required)"},"metric":{"type":"string","description":"Comma-separated metrics (e.g. page_impressions,page_engaged_users,page_views_total)"},"period":{"type":"string","enum":["day","week","days_28"],"description":"Aggregation period (default: day)"},"since":{"type":"string","description":"Start date (Unix timestamp or ISO 8601)"},"until":{"type":"string","description":"End date (Unix timestamp or ISO 8601)"}},"required":["page_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- TikTok (2 actions: 2 read)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('tiktok', 'TikTok', 'get_user_info',
 'Get the authenticated TikTok user profile information.',
 'https://open.tiktokapis.com/v2/user/info/', 'GET', 'tiktok',
 '{"type":"object","properties":{"fields":{"type":"string","description":"Comma-separated fields (default: open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('tiktok', 'TikTok', 'list_videos',
 'List videos posted by the authenticated user.',
 'https://open.tiktokapis.com/v2/video/list/', 'POST', 'tiktok',
 '{"type":"object","properties":{"max_count":{"type":"number","minimum":1,"maximum":20,"description":"Number of videos to return (1-20, default 10)"},"cursor":{"type":"number","description":"Pagination cursor"},"fields":{"type":"string","description":"Comma-separated fields (default: id,title,create_time,cover_image_url,share_url,view_count,like_count,comment_count)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Canva (3 actions: 2 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('canva', 'Canva', 'list_designs',
 'List designs in the authenticated Canva account.',
 'https://api.canva.com/rest/v1/designs', 'GET', 'canva',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query to filter designs"},"continuation":{"type":"string","description":"Pagination cursor"},"ownership":{"type":"string","enum":["owned","shared","any"],"description":"Filter by ownership (default: owned)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('canva', 'Canva', 'get_design',
 'Get details of a specific Canva design.',
 'https://api.canva.com/rest/v1/designs/:design_id', 'GET', 'canva',
 '{"type":"object","properties":{"design_id":{"type":"string","description":"Design ID (required)"}},"required":["design_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('canva', 'Canva', 'create_design',
 'Create a new design in Canva.',
 'https://api.canva.com/rest/v1/designs', 'POST', 'canva',
 '{"type":"object","properties":{"design_type":{"type":"object","properties":{"type":{"type":"string","description":"Design type (e.g. Poster, Presentation, InstagramPost)"}},"description":"Design type specification"},"title":{"type":"string","description":"Design title"},"asset_id":{"type":"string","description":"Template asset ID to start from"}},"additionalProperties":false}'::jsonb,
 'write', false, false, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Lemlist (3 actions: 2 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('lemlist', 'Lemlist', 'list_campaigns',
 'List all campaigns in the Lemlist account.',
 'https://api.lemlist.com/api/campaigns', 'GET', 'lemlist',
 '{"type":"object","properties":{"offset":{"type":"number","description":"Number of campaigns to skip"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of campaigns to return (default 100)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('lemlist', 'Lemlist', 'list_leads',
 'List leads in a specific campaign.',
 'https://api.lemlist.com/api/campaigns/:campaign_id/leads', 'GET', 'lemlist',
 '{"type":"object","properties":{"campaign_id":{"type":"string","description":"Campaign ID (required)"},"offset":{"type":"number","description":"Number of leads to skip"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of leads to return (default 100)"}},"required":["campaign_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('lemlist', 'Lemlist', 'create_lead',
 'Add a lead to a campaign.',
 'https://api.lemlist.com/api/campaigns/:campaign_id/leads', 'POST', 'lemlist',
 '{"type":"object","properties":{"campaign_id":{"type":"string","description":"Campaign ID (required)"},"email":{"type":"string","description":"Lead email address (required)"},"firstName":{"type":"string","description":"First name"},"lastName":{"type":"string","description":"Last name"},"companyName":{"type":"string","description":"Company name"},"phone":{"type":"string","description":"Phone number"}},"required":["campaign_id","email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- HeyGen (3 actions: 2 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('heygen', 'HeyGen', 'list_avatars',
 'List available avatars for video generation.',
 'https://api.heygen.com/v2/avatars', 'GET', 'heygen',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('heygen', 'HeyGen', 'create_video',
 'Create a new video with an avatar and script.',
 'https://api.heygen.com/v2/video/generate', 'POST', 'heygen',
 '{"type":"object","properties":{"video_inputs":{"type":"array","items":{"type":"object"},"description":"Array of video input objects with character (avatar_id, type) and voice (input_text, type) (required)"},"dimension":{"type":"object","properties":{"width":{"type":"number"},"height":{"type":"number"}},"description":"Video dimensions"},"title":{"type":"string","description":"Video title"}},"required":["video_inputs"],"additionalProperties":false}'::jsonb,
 'write', false, false, 1),

('heygen', 'HeyGen', 'get_video_status',
 'Get the status and details of a generated video.',
 'https://api.heygen.com/v1/video_status.get', 'GET', 'heygen',
 '{"type":"object","properties":{"video_id":{"type":"string","description":"Video ID (required)"}},"required":["video_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Whoop (4 actions: 4 read)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('whoop', 'Whoop', 'get_profile',
 'Get the authenticated Whoop user profile.',
 'https://api.prod.whoop.com/developer/v1/user/profile/basic', 'GET', 'whoop',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('whoop', 'Whoop', 'get_recovery',
 'Get recovery data for the authenticated user.',
 'https://api.prod.whoop.com/developer/v1/recovery', 'GET', 'whoop',
 '{"type":"object","properties":{"start":{"type":"string","description":"Start date in ISO 8601 format"},"end":{"type":"string","description":"End date in ISO 8601 format"},"limit":{"type":"number","minimum":1,"maximum":25,"description":"Number of records to return (default 10)"},"nextToken":{"type":"string","description":"Pagination token"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('whoop', 'Whoop', 'get_sleep',
 'Get sleep data for the authenticated user.',
 'https://api.prod.whoop.com/developer/v1/activity/sleep', 'GET', 'whoop',
 '{"type":"object","properties":{"start":{"type":"string","description":"Start date in ISO 8601 format"},"end":{"type":"string","description":"End date in ISO 8601 format"},"limit":{"type":"number","minimum":1,"maximum":25,"description":"Number of records to return (default 10)"},"nextToken":{"type":"string","description":"Pagination token"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('whoop', 'Whoop', 'get_workout',
 'Get workout data for the authenticated user.',
 'https://api.prod.whoop.com/developer/v1/activity/workout', 'GET', 'whoop',
 '{"type":"object","properties":{"start":{"type":"string","description":"Start date in ISO 8601 format"},"end":{"type":"string","description":"End date in ISO 8601 format"},"limit":{"type":"number","minimum":1,"maximum":25,"description":"Number of records to return (default 10)"},"nextToken":{"type":"string","description":"Pagination token"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 3)

ON CONFLICT (provider, action_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- Amazon SES (2 actions: 1 read + 1 write)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

('amazon', 'Amazon SES', 'send_email',
 'Send an email via Amazon SES.',
 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails', 'POST', 'amazon',
 '{"type":"object","properties":{"FromEmailAddress":{"type":"string","description":"Sender email address (required)"},"Destination":{"type":"object","properties":{"ToAddresses":{"type":"array","items":{"type":"string"},"description":"Recipient email addresses"},"CcAddresses":{"type":"array","items":{"type":"string"},"description":"CC email addresses"},"BccAddresses":{"type":"array","items":{"type":"string"},"description":"BCC email addresses"}},"description":"Email destination (required)"},"Content":{"type":"object","properties":{"Simple":{"type":"object","properties":{"Subject":{"type":"object","properties":{"Data":{"type":"string"}},"description":"Email subject"},"Body":{"type":"object","properties":{"Text":{"type":"object","properties":{"Data":{"type":"string"}},"description":"Plain text body"},"Html":{"type":"object","properties":{"Data":{"type":"string"}},"description":"HTML body"}}}}}},"description":"Email content (required)"}},"required":["FromEmailAddress","Destination","Content"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 0),

('amazon', 'Amazon SES', 'list_email_templates',
 'List email templates in Amazon SES.',
 'https://email.us-east-1.amazonaws.com/v2/email/templates', 'GET', 'amazon',
 '{"type":"object","properties":{"PageSize":{"type":"number","minimum":1,"maximum":100,"description":"Number of templates to return (default 10)"},"NextToken":{"type":"string","description":"Pagination token"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1)

ON CONFLICT (provider, action_name) DO NOTHING;
