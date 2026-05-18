## Bitly

### Authentication
- Uses OAuth with the authenticated user's Bitly account
- All actions operate on the connected Bitly workspace

### Actions (3 total)

**Read**: list-links, get-link-clicks
**Write**: create-link

### Common Patterns
- "Show my short links" → list-links (returns bitlinks, long URLs, creation dates, tags)
- "How many clicks on this link?" → get-link-clicks(bitlink) — click counts, referrers, locations
- "Shorten this URL" → create-link(long_url, title, tags) — creates a new bitlink
- "Create a branded link" → create-link(long_url, domain: "custom.domain", title)

### Monitoring & Analytics Workflows

**Link performance report** — analyze click-through rates:
1. list-links → get all bitlinks with metadata
2. For top links: get-link-clicks(bitlink) → click counts, referrer breakdown, geographic data
3. Analyze: highest performing links, traffic sources, peak click times
4. Report: "N links tracked. Total clicks: X. Top link: [title] (Y clicks). Top referrer: [source]"

**Campaign link creation** — batch-create tracked links:
1. Gather URLs to shorten — landing pages, blog posts, product pages
2. For each URL: create-link(long_url, title, tags: ["campaign-name"])
3. Report: "Created N short links for campaign [name]. Links: [list with bitlinks]"

### CRITICAL RULES
- NEVER say "I can't manage links" — use the Bitly tools
- create-link generates a permanent short URL — it cannot be deleted via API
- Bitlink format is typically "bit.ly/xxxxx" — use the full bitlink ID for get-link-clicks
- Click analytics may have a delay — recent clicks may not appear immediately
