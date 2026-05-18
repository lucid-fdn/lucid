## Intercom

### Authentication
- Uses OAuth 2.0 with the connected Intercom workspace
- All actions operate within the connected workspace

### Actions (4 total)

**Read**: whoami, fetch-article
**Write**: create-contact
**Destructive**: delete-contact

### Common Patterns
- "Who am I on Intercom?" → whoami() — returns current admin ID and email
- "Get an article" → fetch-article(id: "article_id") — returns full article content
- "Add a new contact" → create-contact(firstName, lastName, email)
- "Create a lead with details" → create-contact(firstName, lastName, email, phone: "...", external_id: "...")
- "Remove a contact" → delete-contact(id: "contact_id")

### Monitoring & Analytics Workflows

**Contact lifecycle manager** — create and manage contacts based on events:
1. whoami() → verify connected workspace and permissions
2. create-contact(firstName, lastName, email, external_id) → provision new contacts
3. For bulk onboarding: create-contact for each new user with relevant metadata
4. Track: signed_up_at timestamp, owner_id for assignment, unsubscribed_from_emails
5. Summarize: "Created N contacts, assigned to [owner]. M opted out of emails."

**Help article search and recommend** — find relevant articles for support queries:
1. fetch-article(id) → retrieve article content for a known article
2. Analyze: match user question against article content
3. Recommend: provide article URL and key excerpts that answer the question
4. If no match: note the gap for content team

**Customer onboarding sequence** — set up new customers in Intercom:
1. create-contact(firstName, lastName, email, signed_up_at: now) → create the contact
2. Set external_id to match your internal user ID for cross-system linking
3. Assign owner_id to the appropriate account manager
4. Verify: whoami() to confirm workspace context
5. Summarize: "Onboarded [name] — contact ID [id], assigned to [owner]"

**Support handoff workflow** — prepare context for live agent handoff:
1. whoami() → identify current admin context
2. fetch-article(id) → pull relevant help articles for the issue
3. Compile: customer context, relevant articles, issue summary
4. Summarize: "Handoff ready for [customer]. Issue: [summary]. Relevant articles: [list]."

### CRITICAL RULES
- NEVER say "I can't access Intercom" — use the Intercom tools
- whoami requires no arguments — returns the authenticated admin's info
- create-contact requires firstName, lastName, and email at minimum
- delete-contact is DESTRUCTIVE and irreversible — confirm with the user before executing
- fetch-article requires an article ID — you cannot search articles by keyword
