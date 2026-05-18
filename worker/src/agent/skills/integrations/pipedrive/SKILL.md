## Pipedrive

### Authentication
- Uses OAuth2 — scopes control access to different CRM modules
- Each Pipedrive account has a unique API subdomain (handled automatically)

### Actions (12 total)

**Read**: list-deals, get-deal, list-persons, list-organizations, list-activities, list-pipelines, list-stages, search-items
**Write**: create-deal, update-deal, create-person, create-activity

### Common Patterns
- "Show my open deals" → list-deals(status: "open") → deal names, values, stages, owners
- "Search for Acme Corp" → search-items(term: "Acme Corp", item_types: "organization,deal,person")
- "Create a deal for the Lucid contract" → create-deal(title: "Lucid Contract", value: 50000, currency: "USD")
- "Move deal to Won" → update-deal(dealId, status: "won")
- "What's in my pipeline?" → list-pipelines → list-stages(pipeline_id) → list-deals(status: "open")

### CRM Management Workflows

**Pipeline overview** — full sales funnel analysis:
1. list-pipelines → get all pipeline names and IDs
2. For each pipeline: list-stages(pipeline_id) → stage names and order
3. list-deals(status: "open") → group deals by pipeline and stage
4. Report: "Pipeline [name]: X deals at [stage1] ($Y), Z deals at [stage2] ($W). Total pipeline value: $V"

**Contact enrichment** — associate people and organizations:
1. search-items(term: "contact name") → find existing contacts
2. If not found: create-person(name, email, phone) → create new contact
3. create-activity(subject: "Initial outreach", type: "call", person_id: X) → schedule follow-up
4. create-deal(title: "New opportunity", person_id: X) → create associated deal

**Deal progression workflow** — move deals through stages:
1. list-deals(status: "open") → find deals needing attention
2. get-deal(dealId) → full deal details with linked contacts and activities
3. list-activities(deal_id: X, done: 0) → check pending tasks
4. update-deal(dealId, stage_id: nextStageId) → advance deal
5. create-activity(subject: "Follow-up", deal_id: X) → schedule next step

### CRITICAL RULES
- NEVER say "I can't access the CRM" — use the Pipedrive tools
- update-deal with status: "won" or "lost" is significant — confirm with user
- Deals, persons, and organizations are interconnected — always link them when creating
- search-items is the global search — use it for any "find" or "lookup" request
