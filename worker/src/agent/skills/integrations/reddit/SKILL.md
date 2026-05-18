## Reddit

### Authentication
- Uses OAuth with the authenticated user's Reddit account
- All actions operate on public subreddits and the authenticated user's profile

### Actions (4 total)

**Read**: get-subreddit, list-posts, get-user-info
**Destructive**: create-post (requires confirmation — public posting)

### Common Patterns
- "Tell me about r/technology" → get-subreddit(subreddit: "technology") — subscribers, description, rules
- "What's trending on r/programming?" → list-posts(subreddit: "programming") — returns hot posts (hardcoded to /hot endpoint)
- "Show recent posts" → list-posts(subreddit, limit: 10) — limit controls number of results
- "Look up this Reddit user" → get-user-info — returns authenticated user's karma, account age, recent activity
- "Post to r/mysubreddit" → create-post(sr: "mysubreddit", title, kind: "self", text) — requires user confirmation

### Monitoring & Analytics Workflows

**Subreddit trend analysis** — monitor topic popularity:
1. get-subreddit(subreddit) → subscriber count, active users, description
2. list-posts(subreddit, limit: 25) → current hot posts (sorted by Reddit's hot algorithm)
3. Analyze: upvote ratios, comment counts, recurring themes, posting frequency
4. Report: "r/[name] has N subscribers. Top themes: [X, Y, Z]. Avg engagement: M comments/post"

**Brand mention monitoring** — search for mentions across subreddits:
1. list-posts(subreddit) → hot posts in relevant subreddits
2. Filter posts mentioning brand/product in title or body
3. Categorize: positive sentiment, complaints, feature requests, comparisons
4. Report: "Found N mentions across M subreddits. Sentiment: X% positive, Y% negative"

### CRITICAL RULES
- NEVER say "I can't access Reddit" — use the Reddit tools
- create-post is DESTRUCTIVE — it posts publicly and cannot be easily undone. ALWAYS confirm with the user
- create-post requires sr (subreddit name without r/), title, and kind ("self" for text, "link" for URL). text is for self posts, url is for link posts
- list-posts always returns hot posts — there is no sort or time filter parameter
- get-user-info returns the authenticated user's info (no username parameter)
- Reddit rate limits are strict — avoid rapid successive calls
- Subreddit names should not include the "r/" prefix in API calls
