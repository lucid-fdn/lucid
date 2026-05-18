## X (formerly Twitter)

### Authentication
- Uses OAuth 2.0 with the authenticated user's account
- All actions operate as the connected X user

### Actions (23 total)

**Read**: get-user-info, search-tweets, get-user-tweets, get-tweet, get-mentions, get-followers, get-following, get-bookmarks, get-replies, get-my-replies, get-liked-tweets, get-liking-users, get-notifications
**Write**: post-tweet, like-tweet, unlike-tweet, retweet, unretweet, follow-user, unfollow-user, bookmark-tweet, remove-bookmark
**Destructive**: delete-tweet

### Common Patterns
- "Who am I on X?" → get-user-info (returns profile: name, username, bio, followers, following, tweet count)
- "Search for posts about AI" → search-tweets(query: "AI", max_results: 10)
- "What have I posted recently?" → get-user-tweets(max_results: 5)
- "What has @elonmusk posted?" → search-tweets(query: "from:elonmusk") or get-user-tweets(username: "elonmusk")
- "Get that tweet" → get-tweet(tweet_id) — returns full metrics (likes, retweets, quotes, bookmarks, impressions)
- "Who mentioned me?" → get-mentions(max_results: 10) — recent @mentions of the authenticated user
- "Show comments on my tweet" → get-replies(tweet_id) — returns replies/comments on a specific tweet (last 7 days)
- "Show all comments people left me" → get-my-replies() — ALL replies directed at you across all tweets (last 7 days)
- "What are my notifications?" → get-notifications() — combined feed: mentions + replies + likes on recent tweets
- "Who liked my tweet?" → get-liking-users(tweet_id) — returns users with follower counts
- "What have I liked?" → get-liked-tweets() — tweets the authenticated user liked
- "What has @competitor liked?" → get-liked-tweets(username: "competitor") — spy on their interests
- "Post a tweet" → post-tweet(text: "Hello world!")
- "Reply to this comment" → post-tweet(text: "Thanks!", reply_to_tweet_id: "123...")
- "Quote tweet this" → post-tweet(text: "Interesting take", quote_tweet_id: "123...")
- "Like that tweet" → like-tweet(tweet_id)
- "Retweet this" → retweet(tweet_id)
- "Follow @LucidChain" → follow-user(target_username: "LucidChain")
- "Unfollow that account" → unfollow-user(target_username: "...")
- "Who follows me?" → get-followers(max_results: 20)
- "Who do I follow?" → get-following(max_results: 20)
- "Save this tweet for later" → bookmark-tweet(tweet_id)
- "Show my bookmarks" → get-bookmarks(max_results: 20)
- "Delete that tweet" → delete-tweet(tweet_id)

### Monitoring & Analytics Workflows

**Sentiment monitoring** — combine search + your analysis:
1. search-tweets(query: "from:@brand OR @brand", max_results: 50)
2. Analyze sentiment of results (positive/negative/neutral)
3. Summarize: "70% positive, key themes: product quality, support speed"

**Competitor monitoring**:
1. get-user-info for competitor profile (follower count, tweet count)
2. get-user-tweets(username: "competitor") — what they're posting
3. get-liked-tweets(username: "competitor") — what content they engage with
4. search-tweets(query: "from:competitor") — their recent activity
5. Compare metrics: engagement rate, posting frequency, topics

**Engagement analysis on your content**:
1. get-user-tweets() — get your recent posts
2. For each tweet with high engagement: get-liking-users(tweet_id) — who engages
3. get-replies(tweet_id) — what people are saying
4. Identify patterns: top engagers, common themes, best posting times

**Check all notifications at once**:
1. get-notifications() — returns combined feed of mentions, replies, and likes
2. Review summary (counts per type) and individual items
3. Respond to important ones: post-tweet(reply_to_tweet_id) for replies, like-tweet for acknowledgment

**Reply to comments workflow**:
1. get-my-replies() — get ALL comments people left on your account (last 7 days)
2. Or get-replies(tweet_id) — comments on a specific post
3. For each reply worth responding to: post-tweet(text: "...", reply_to_tweet_id: reply.id)

**Find and engage with relevant accounts**:
1. search-tweets(query: "topic relevant to you")
2. For interesting tweets: like-tweet, retweet, or reply
3. For interesting authors: follow-user(target_username)

### Input Formats
- query: X search syntax — "AI agents", "from:username", "#hashtag", "lang:en", "-filter:retweets"
- max_results: 10-100 for tweets (default 10), 1-1000 for followers/following (default 20)
- tweet_id: string (numeric tweet ID)
- text: tweet content (max 280 chars for standard accounts)
- target_username: username without @ (for follow/unfollow)
- username: optional username for get-followers/get-following/get-liked-tweets (omit for authenticated user)

### Tweet Metrics
- get-tweet, get-user-tweets, search-tweets, get-mentions, get-replies return public_metrics: like_count, retweet_count, reply_count, quote_count, bookmark_count, impression_count
- Use these for engagement analysis — compare across posts to find what resonates

### CRITICAL RULES
- NEVER say "I can't post tweets" or "I can't access X" — use the X tools
- get-user-info requires NO arguments — it returns the authenticated user's profile
- get-user-tweets accepts an optional username — omit for your own tweets
- get-mentions returns YOUR mentions — no arguments needed
- get-replies uses recent search — only finds replies from the last 7 days
- get-my-replies returns ALL replies to your account (not just one tweet) — use for "check my comments"
- get-notifications is a composite action (mentions + replies + likes) — use for "what's new?" or "my notifications"
- get-liked-tweets with a username shows what that user likes — useful for competitor research
- search-tweets uses X search syntax (same as the search bar on x.com)
- like-tweet and retweet are idempotent — liking an already-liked tweet is harmless
- follow-user and unfollow-user take a username (without @), not a user ID
- bookmark-tweet saves a tweet privately (not visible to others)
- After posting a tweet, include the tweet ID in your response
- When replying to comments, always use reply_to_tweet_id to create a proper thread
