## Instagram

### Authentication
- Uses OAuth with the authenticated user's Instagram Business/Creator account
- All actions are read-only — no posting or modifications

### Actions (3 total)

**Read**: get-profile, list-media, get-media-insights

### Common Patterns
- "Show my Instagram profile" → get-profile (returns username, bio, follower/following counts, media count)
- "List my recent posts" → list-media — returns media items with captions, timestamps, types
- "How's my latest post performing?" → get-media-insights(mediaId) — impressions, reach, engagement, saves

### Monitoring & Analytics Workflows

**Content performance audit** — analyze post engagement:
1. list-media → get recent posts with types (image, video, carousel, reel)
2. For top posts: get-media-insights(mediaId) → impressions, reach, likes, comments, saves
3. Analyze: engagement rate per post type, best performing content themes
4. Report: "N posts analyzed. Avg engagement: X%. Best format: [reels/carousels]. Top post: [caption excerpt] (Y reach)"

**Profile growth tracking** — follower and content metrics:
1. get-profile → current followers, following, media count
2. list-media → posting frequency (timestamps), content mix
3. Analyze: posts per week, follower-to-content ratio, bio completeness
4. Report: "Profile: N followers, M posts. Posting frequency: X/week. Growth indicators: [observations]"

### CRITICAL RULES
- NEVER say "I can't access Instagram" — use the Instagram tools
- All Instagram actions are READ-ONLY — you cannot post, like, or comment
- Instagram API requires a Business or Creator account — personal accounts won't work
- Media insights are only available for posts on Business/Creator accounts
