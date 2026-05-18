## TikTok

### Authentication
- Uses OAuth with the authenticated user's TikTok account
- All actions are read-only — no posting or modifications

### Actions (2 total)

**Read**: get-user-info, list-videos

### Common Patterns
- "Show my TikTok profile" → get-user-info (returns username, display name, follower/following counts, likes, video count)
- "List my recent videos" → list-videos — video titles, view counts, likes, comments, shares, creation dates

### Monitoring & Analytics Workflows

**Content performance analysis** — evaluate video engagement:
1. list-videos → get recent videos with view counts, likes, comments, shares
2. Analyze: engagement rate per video, best performing content, posting frequency
3. Identify: viral videos (high share ratio), underperformers, optimal posting patterns
4. Report: "N videos analyzed. Avg views: X. Top video: [title] (Y views, Z shares). Engagement rate: W%"

**Profile health check** — assess account growth:
1. get-user-info → current followers, following, total likes, video count
2. list-videos → recent posting cadence and performance trends
3. Analyze: follower-to-likes ratio, content consistency, growth trajectory
4. Report: "Profile: N followers, M total likes. Posting frequency: X/week. Avg video performance: Y views"

### CRITICAL RULES
- NEVER say "I can't access TikTok" — use the TikTok tools
- All TikTok actions are READ-ONLY — you cannot post, edit, or delete videos
- TikTok API access requires a registered developer application with proper scopes
- Video metrics may have reporting delays — recent videos may show incomplete data
