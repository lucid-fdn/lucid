-- Migration: Seed X (Twitter) actions into oauth_action_catalog
-- 23 actions total: 5 original + 6 engagement + 7 social graph/bookmarks + 3 analytics + 2 notifications

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('twitter', 'X', 'get_user_info',
 'Get user profile information by username or for the authenticated user.',
 'https://api.x.com/2/users/me', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('twitter', 'X', 'search_tweets',
 'Search recent tweets matching a query (last 7 days). Supports X search operators.',
 'https://api.x.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":512,"description":"Search query (supports from:, to:, has:, is: operators)"},"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 10)"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('twitter', 'X', 'get_user_tweets',
 'Get recent tweets from a user timeline.',
 'https://api.x.com/2/users/:id/tweets', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of tweets (5-100, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('twitter', 'X', 'get_tweet',
 'Get a single tweet by ID with full engagement metrics.',
 'https://api.x.com/2/tweets/:id', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to retrieve"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('twitter', 'X', 'get_mentions',
 'Get recent mentions of the authenticated user.',
 'https://api.x.com/2/users/:id/mentions', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of mentions (5-100, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

-- Write actions
('twitter', 'X', 'post_tweet',
 'Post a tweet. Supports replies and quote tweets.',
 'https://api.x.com/2/tweets', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":280,"description":"Tweet text (max 280 chars)"},"reply_to_tweet_id":{"type":"string","description":"Tweet ID to reply to"},"quote_tweet_id":{"type":"string","description":"Tweet ID to quote"}},"required":["text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

('twitter', 'X', 'like_tweet',
 'Like a tweet on behalf of the authenticated user.',
 'https://api.x.com/2/users/:id/likes', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to like"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 6),

('twitter', 'X', 'unlike_tweet',
 'Unlike a previously liked tweet.',
 'https://api.x.com/2/users/:id/likes/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to unlike"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 7),

('twitter', 'X', 'retweet',
 'Retweet a tweet on behalf of the authenticated user.',
 'https://api.x.com/2/users/:id/retweets', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to retweet"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 8),

('twitter', 'X', 'unretweet',
 'Undo a retweet.',
 'https://api.x.com/2/users/:id/retweets/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to unretweet"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 9),

-- Social graph actions
('twitter', 'X', 'follow_user',
 'Follow a user on X.',
 'https://api.x.com/2/users/:id/following', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"target_username":{"type":"string","description":"Username of the account to follow (without @)"}},"required":["target_username"],"additionalProperties":false}'::jsonb,
 'write', true, false, 10),

('twitter', 'X', 'unfollow_user',
 'Unfollow a user on X.',
 'https://api.x.com/2/users/:id/following/:target_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"target_username":{"type":"string","description":"Username of the account to unfollow (without @)"}},"required":["target_username"],"additionalProperties":false}'::jsonb,
 'write', true, false, 11),

('twitter', 'X', 'get_followers',
 'Get followers of a user.',
 'https://api.x.com/2/users/:id/followers', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":1,"maximum":1000,"description":"Number of results (1-1000, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 12),

('twitter', 'X', 'get_following',
 'Get accounts a user is following.',
 'https://api.x.com/2/users/:id/following', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":1,"maximum":1000,"description":"Number of results (1-1000, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 13),

-- Bookmark actions
('twitter', 'X', 'bookmark_tweet',
 'Bookmark a tweet for later reference.',
 'https://api.x.com/2/users/:id/bookmarks', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to bookmark"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 14),

('twitter', 'X', 'remove_bookmark',
 'Remove a tweet from bookmarks.',
 'https://api.x.com/2/users/:id/bookmarks/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to remove from bookmarks"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 15),

('twitter', 'X', 'get_bookmarks',
 'Get bookmarked tweets for the authenticated user.',
 'https://api.x.com/2/users/:id/bookmarks', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":1,"maximum":100,"description":"Number of results (1-100, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 16),

-- Analytics actions
('twitter', 'X', 'get_replies',
 'Get replies/comments on a specific tweet (last 7 days).',
 'https://api.x.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to get replies for"},"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 20)"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 17),

('twitter', 'X', 'get_liked_tweets',
 'Get tweets liked by a user.',
 'https://api.x.com/2/users/:id/liked_tweets', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of results (5-100, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 18),

('twitter', 'X', 'get_liking_users',
 'Get users who liked a specific tweet.',
 'https://api.x.com/2/tweets/:id/liking_users', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to get liking users for"},"max_results":{"type":"number","minimum":1,"maximum":100,"description":"Number of results (1-100, default 20)"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 19),

-- Notification/reply actions
('twitter', 'X', 'get_my_replies',
 'Get all recent replies and comments directed at the authenticated user (last 7 days).',
 'https://api.x.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 25)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 20),

('twitter', 'X', 'get_notifications',
 'Combined notifications feed: mentions, replies, and likes on recent tweets.',
 'https://api.x.com/2/users/me', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_per_type":{"type":"number","minimum":5,"maximum":50,"description":"Max results per type (5-50, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 21),

-- Destructive action
('twitter', 'X', 'delete_tweet',
 'Delete a tweet (must be authored by the authenticated user).',
 'https://api.x.com/2/tweets/:id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to delete"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 22);
