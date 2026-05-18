## Facebook

### Authentication
- Uses OAuth with the authenticated user's Facebook account
- All actions operate on Pages the user manages

### Actions (3 total)

**Read**: list-pages, get-page-insights
**Write**: create-post (requires confirmation — public posting)

### Common Patterns
- "Show my Facebook pages" → list-pages (returns page names, IDs, categories, follower counts)
- "How's my page performing?" → get-page-insights(pageId) — reach, engagement, impressions, page views
- "Post an update" → create-post(pageId, message) — requires user confirmation

### Monitoring & Analytics Workflows

**Page performance dashboard** — overview of all managed pages:
1. list-pages → get all pages with follower counts and categories
2. For each page: get-page-insights(pageId) → reach, engagement, impressions
3. Compare: identify highest-performing page, engagement trends
4. Report: "Managing N pages. Total reach: X. Top page: [name] (Y followers, Z% engagement)"

**Content publishing workflow** — draft and publish page posts:
1. list-pages → identify the target page
2. Draft the post content with the user — review message, links, call-to-action
3. create-post(pageId, message) → publish after user confirmation
4. Report: "Post published to [page name]. Content: [excerpt]. Audience: N followers"

### CRITICAL RULES
- NEVER say "I can't access Facebook" — use the Facebook tools
- create-post publishes publicly to a Facebook Page — ALWAYS confirm with the user before posting
- Page insights require the user to be an admin of the page
- Facebook rate limits apply — avoid rapid successive API calls
