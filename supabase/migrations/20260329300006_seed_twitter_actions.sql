-- Migration: Seed Twitter / X actions into oauth_action_catalog
-- 23 actions total: 13 read + 5 write + 4 undo/write + 1 destructive

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Read actions
('twitter-v2', 'Twitter / X', 'get_tweet',
 'Get a tweet by ID with public metrics.',
 'https://api.twitter.com/2/tweets/:tweet_id', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to retrieve"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('twitter-v2', 'Twitter / X', 'get_user_tweets',
 'Get recent tweets from a user timeline.',
 'https://api.twitter.com/2/users/:userId/tweets', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of tweets (5-100, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('twitter-v2', 'Twitter / X', 'search_tweets',
 'Search recent tweets matching a query (last 7 days).',
 'https://api.twitter.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"query":{"type":"string","minLength":1,"maxLength":512,"description":"Search query (1-512 chars)"},"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 10)"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('twitter-v2', 'Twitter / X', 'get_mentions',
 'Get recent mentions of the authenticated user.',
 'https://api.twitter.com/2/users/:userId/mentions', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of mentions (5-100, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('twitter-v2', 'Twitter / X', 'get_replies',
 'Get replies/comments on a specific tweet.',
 'https://api.twitter.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to get replies for"},"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 20)"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('twitter-v2', 'Twitter / X', 'get_my_replies',
 'Get all recent replies directed at the authenticated user.',
 'https://api.twitter.com/2/tweets/search/recent', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":10,"maximum":100,"description":"Number of results (10-100, default 25)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('twitter-v2', 'Twitter / X', 'get_user_info',
 'Get Twitter user profile information by username.',
 'https://api.twitter.com/2/users/by/username/:username', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('twitter-v2', 'Twitter / X', 'get_followers',
 'Get followers of a user.',
 'https://api.twitter.com/2/users/:userId/followers', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":1,"maximum":1000,"description":"Number of results (1-1000, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('twitter-v2', 'Twitter / X', 'get_following',
 'Get accounts a user is following.',
 'https://api.twitter.com/2/users/:userId/following', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":1,"maximum":1000,"description":"Number of results (1-1000, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 8),

('twitter-v2', 'Twitter / X', 'get_liked_tweets',
 'Get tweets liked by a user.',
 'https://api.twitter.com/2/users/:userId/liked_tweets', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"username":{"type":"string","description":"Username (without @). Omit for authenticated user."},"max_results":{"type":"number","minimum":5,"maximum":100,"description":"Number of results (5-100, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 9),

('twitter-v2', 'Twitter / X', 'get_liking_users',
 'Get users who liked a specific tweet.',
 'https://api.twitter.com/2/tweets/:tweet_id/liking_users', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to get liking users for"},"max_results":{"type":"number","minimum":1,"maximum":100,"description":"Number of results (1-100, default 20)"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 10),

('twitter-v2', 'Twitter / X', 'get_bookmarks',
 'Get bookmarked tweets for the authenticated user.',
 'https://api.twitter.com/2/users/:userId/bookmarks', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_results":{"type":"number","minimum":1,"maximum":100,"description":"Number of results (1-100, default 20)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 11),

('twitter-v2', 'Twitter / X', 'get_notifications',
 'Get a combined notifications feed (mentions, replies, likes).',
 'https://api.twitter.com/2/users/:userId/mentions', 'GET', 'twitter-v2',
 '{"type":"object","properties":{"max_per_type":{"type":"number","minimum":5,"maximum":50,"description":"Max results per type (5-50, default 10)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 12),

-- Write actions
('twitter-v2', 'Twitter / X', 'post_tweet',
 'Post a tweet on behalf of the authenticated user.',
 'https://api.twitter.com/2/tweets', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":280,"description":"Tweet text (max 280 chars)"},"reply_to_tweet_id":{"type":"string","description":"Tweet ID to reply to"},"quote_tweet_id":{"type":"string","description":"Tweet ID to quote"}},"required":["text"],"additionalProperties":false}'::jsonb,
 'write', false, false, 13),

('twitter-v2', 'Twitter / X', 'like_tweet',
 'Like a tweet.',
 'https://api.twitter.com/2/users/:userId/likes', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to like"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 14),

('twitter-v2', 'Twitter / X', 'retweet',
 'Retweet a tweet.',
 'https://api.twitter.com/2/users/:userId/retweets', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to retweet"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 15),

('twitter-v2', 'Twitter / X', 'follow_user',
 'Follow a user on X.',
 'https://api.twitter.com/2/users/:userId/following', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"target_username":{"type":"string","description":"Username of the account to follow (without @)"}},"required":["target_username"],"additionalProperties":false}'::jsonb,
 'write', false, false, 16),

('twitter-v2', 'Twitter / X', 'bookmark_tweet',
 'Bookmark a tweet for later reference.',
 'https://api.twitter.com/2/users/:userId/bookmarks', 'POST', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to bookmark"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', false, false, 17),

-- Undo/destructive write actions
('twitter-v2', 'Twitter / X', 'unlike_tweet',
 'Unlike a previously liked tweet.',
 'https://api.twitter.com/2/users/:userId/likes/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to unlike"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 18),

('twitter-v2', 'Twitter / X', 'unretweet',
 'Remove a retweet.',
 'https://api.twitter.com/2/users/:userId/retweets/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to unretweet"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 19),

('twitter-v2', 'Twitter / X', 'unfollow_user',
 'Unfollow a user on X.',
 'https://api.twitter.com/2/users/:userId/following/:targetId', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"target_username":{"type":"string","description":"Username of the account to unfollow (without @)"}},"required":["target_username"],"additionalProperties":false}'::jsonb,
 'write', true, false, 20),

('twitter-v2', 'Twitter / X', 'remove_bookmark',
 'Remove a tweet from bookmarks.',
 'https://api.twitter.com/2/users/:userId/bookmarks/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to remove from bookmarks"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 21),

-- Destructive action
('twitter-v2', 'Twitter / X', 'delete_tweet',
 'Delete a tweet by ID.',
 'https://api.twitter.com/2/tweets/:tweet_id', 'DELETE', 'twitter-v2',
 '{"type":"object","properties":{"tweet_id":{"type":"string","description":"The tweet ID to delete"}},"required":["tweet_id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 22)

ON CONFLICT (provider, action_name) DO NOTHING;
