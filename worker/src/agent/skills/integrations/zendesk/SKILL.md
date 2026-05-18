## Zendesk

### Authentication
- Uses OAuth 2.0 with the connected Zendesk account
- All actions operate within the connected Zendesk subdomain

### Actions (8 total)

**Read**: search-tickets, fetch-article, fetch-articles
**Write**: create-ticket, create-user, create-category, create-section
**Destructive**: delete-user

### Common Patterns
- "Search for open tickets" → search-tickets(query: "status:open")
- "Find tickets assigned to me" → search-tickets(query: "assignee:me")
- "Find urgent tickets" → search-tickets(query: "priority:urgent status:open")
- "Get a help article" → fetch-article(id: "article_id")
- "List all help articles" → fetch-articles()
- "Create a support ticket" → create-ticket(ticket: { comment: { body: "..." }, status: "open" })
- "Add a new agent" → create-user(firstName, lastName, email, role: "agent")
- "Create a help center category" → create-category(category: { name: "...", description: "..." })
- "Add a section to a category" → create-section(category_id, section: { name: "..." })
- "Remove a user" → delete-user(id: "user_id")

### Monitoring & Analytics Workflows

**Ticket triage pipeline** — search, categorize, and prioritize tickets:
1. search-tickets(query: "status:new") → get all new unassigned tickets
2. Analyze each ticket: extract topic, urgency signals, customer tier from description
3. Categorize: bug report, feature request, billing, how-to question, incident
4. Assign priority: urgent (outage/security), high (broken feature), normal (question), low (enhancement)
5. Summarize: "N new tickets: X urgent, Y high, Z normal. Top themes: [billing, API errors]"

**Knowledge base gap finder** — compare articles with common tickets:
1. fetch-articles() → get all help center article titles and IDs
2. search-tickets(query: "status:solved created>30daysAgo") → recent solved tickets
3. Analyze: extract common question themes from solved tickets
4. Cross-reference: identify topics with many tickets but no matching article
5. Summarize: "Knowledge gaps found: [topic1] (15 tickets, no article), [topic2] (8 tickets, outdated article)"

**SLA breach detector** — find tickets at risk of SLA violation:
1. search-tickets(query: "status:open status:pending") → all active tickets
2. Analyze: check created_at and updated_at timestamps against SLA thresholds
3. Flag tickets approaching breach: first response SLA, resolution SLA
4. Escalate: list tickets by urgency with time remaining
5. Summarize: "N tickets at SLA risk: X breaching in <1h, Y breaching in <4h"

**Customer satisfaction workflow** — analyze ticket patterns for satisfaction signals:
1. search-tickets(query: "status:solved updated>7daysAgo") → recently solved tickets
2. Analyze: resolution time, number of replies, reopened tickets, satisfaction ratings
3. Identify patterns: slow resolution categories, frequently reopened topics
4. Summarize: "Avg resolution: Xh. Reopened rate: Y%. Slowest category: billing (Zh avg)"

**Help center content organizer** — create categories and sections for new topics:
1. fetch-articles() → audit existing help center structure
2. Analyze: identify uncategorized content, missing sections for common topics
3. create-category(category: { name: "New Topic Area", description: "..." }) → create new category
4. create-section(category_id, section: { name: "Getting Started" }) → add sections
5. Summarize: "Created category [name] with N sections. Ready for article migration."

### CRITICAL RULES
- NEVER say "I can't access Zendesk" — use the Zendesk tools
- search-tickets uses Zendesk search syntax (status:, assignee:, tags:, priority:, type:, etc.)
- fetch-articles returns metadata only (title, ID, URL) — use fetch-article for full content
- create-ticket requires a ticket object with at least a comment body
- delete-user is DESTRUCTIVE and irreversible — confirm with the user before executing
