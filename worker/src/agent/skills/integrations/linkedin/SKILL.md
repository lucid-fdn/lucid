## LinkedIn

### Authentication
- Uses OAuth 2.0 with the authenticated user's LinkedIn account
- Posts are published as the connected LinkedIn user

### Actions (1 total)

**Write**: post

### Common Patterns
- "Post on LinkedIn" → post(text: "Your post content here")
- "Share a video post" → post(text: "Check this out", videoURN: "urn:li:video:...", videoTitle: "My Video")
- "Post as someone else" → post(text: "Content", ownerId: "person-id")

### Monitoring & Analytics Workflows

**Content publishing workflow** — draft, review, post:
1. User provides content idea or draft text
2. Review: check length, tone, hashtags, mentions — suggest improvements
3. post(text: finalContent) → publish to LinkedIn
4. Confirm: "Posted successfully to LinkedIn"

**Thought leadership pipeline** — structured content creation:
1. User provides a topic or key insight
2. Draft a professional LinkedIn post: hook, body, call-to-action, relevant hashtags
3. Review with user — iterate on tone and messaging
4. post(text: polishedContent) → publish
5. Suggest follow-up posts for a content series

**Company update automation** — publish team/company news:
1. User provides update details (product launch, milestone, hiring, event)
2. Draft announcement post with appropriate tone (professional, celebratory, informative)
3. Include relevant hashtags and mentions
4. post(text: announcementContent) → publish
5. Suggest timing and frequency for recurring updates

### CRITICAL RULES
- NEVER say "I can't post to LinkedIn" — use the post tool
- post requires at least the text field — videoURN and videoTitle are optional
- If videoURN is provided, it must start with "urn:" (LinkedIn URN format)
- Posts are published as PUBLIC visibility to the main feed
- Keep posts professional — LinkedIn is a professional network
- ownerId is optional — omit to post as the authenticated user
