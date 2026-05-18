## Lemlist

### Authentication
- Uses OAuth with the authenticated user's Lemlist account
- All actions operate on campaigns and leads in the connected workspace

### Actions (3 total)

**Read**: list-campaigns, list-leads
**Write**: create-lead

### Common Patterns
- "Show my campaigns" → list-campaigns (returns campaign names, statuses, lead counts, stats)
- "List leads in this campaign" → list-leads(campaignId) — all leads with email, status, activity
- "Add a new lead" → create-lead(campaignId, email, firstName, lastName, companyName)

### Monitoring & Analytics Workflows

**Campaign performance review** — assess outreach effectiveness:
1. list-campaigns → get all campaigns with open/click/reply rates
2. For active campaigns: list-leads(campaignId) → lead statuses (contacted, opened, replied, bounced)
3. Analyze: reply rate, bounce rate, engagement by campaign, sequence step drop-off
4. Report: "N campaigns active. Best: [name] (X% reply rate). Total leads: M. Avg open rate: Y%"

**Lead import workflow** — add prospects to campaigns:
1. list-campaigns → identify the target campaign
2. For each prospect: create-lead(campaignId, email, firstName, lastName, companyName)
3. Report: "Added N leads to campaign [name]. Campaign now has M total leads."

### CRITICAL RULES
- NEVER say "I can't access Lemlist" — use the Lemlist tools
- create-lead adds a real person to an active email sequence — confirm details are correct before adding
- Always verify the campaignId exists via list-campaigns before adding leads
- Duplicate emails in the same campaign will be rejected
