## HubSpot

### Authentication
- Uses OAuth 2.0 with the authenticated user's HubSpot account
- All actions operate on the connected HubSpot portal

### Actions (49 total)

**Read**: whoami, get-contact, get-company, get-deal, get-ticket, get-owner, get-marketing-email, list-contacts, list-companies, list-deals, list-tickets, list-forms, list-marketing-emails, search-contacts, search-companies, search-deals, search-tickets, fetch-account-information, fetch-pipelines, fetch-properties, fetch-roles, fetch-custom-objects
**Write**: create-contact, create-company, create-deal, create-ticket, create-task, create-note, create-marketing-email, clone-marketing-email, create-property, create-association, batch-create-companies, create-user, update-contact, update-company, update-deal, update-ticket, update-task, update-marketing-email, batch-update-companies, change-user-role
**Destructive**: delete-contact, delete-company, delete-deal, delete-ticket, delete-task, delete-marketing-email, delete-user, delete-a-workflow

### Common Patterns
- "Who am I on HubSpot?" → whoami (returns user ID, email, portal info)
- "Find contacts at Acme" → search-contacts(query: "Acme")
- "Show my deals" → list-deals or search-deals
- "Get deal details" → get-deal(dealId)
- "Create a contact" → create-contact(email, firstname, lastname, ...)
- "Update deal stage" → update-deal(dealId, dealstage)
- "Log a note on contact 123" → create-note(body, timestamp, association: {objectType: "contact", objectId: "123"})
- "Create a follow-up task" → create-task(subject, dueDate, contactIds, ...)
- "What pipelines do I have?" → fetch-pipelines(objectType: "deals")
- "What properties exist on contacts?" → fetch-properties(objectType: "contacts")
- "Link a contact to a company" → create-association(fromObjectType: "contacts", fromObjectId, toObjectType: "companies", toObjectId)

### CRM Workflow Patterns

**Sales pipeline health check** — assess deal flow and identify stale deals:
1. fetch-pipelines(objectType: "deals") → understand pipeline stages
2. list-deals or search-deals → pull all active deals
3. For each deal: check dealstage, closedate, amount, last modified date
4. Analyze: deals per stage, average time in stage, overdue close dates, deals without activity
5. Flag stale deals (no updates in 30+ days), identify bottleneck stages
6. Optionally: create-task for sales reps to follow up on stale deals

**Contact enrichment workflow** — find and fill missing data:
1. search-contacts(query) or list-contacts → identify target contacts
2. For contacts missing fields: check email, phone, company, jobtitle, lifecyclestage
3. fetch-properties(objectType: "contacts") → understand available properties
4. update-contact for each contact with available enrichment data
5. create-note documenting what was enriched and data sources

**Ticket escalation pipeline** — identify overdue tickets and create follow-up:
1. search-tickets(priority: "HIGH") → find high-priority tickets
2. For each ticket: get-ticket(ticketId) → check pipeline stage, created date, last update
3. Identify overdue tickets (no update in X days, still open)
4. create-task for each overdue ticket with assignee and due date
5. Optionally: update-ticket to change priority or add internal notes

**Lead qualification workflow** — score and route new contacts:
1. search-contacts with lifecyclestage filter → find new leads
2. For each lead: get-contact → review all properties (company, jobtitle, phone)
3. Analyze: company size, title seniority, engagement signals
4. update-contact to set lifecyclestage (lead → MQL → SQL) based on scoring
5. create-association to link qualified leads to their companies
6. create-task for sales rep assignment on qualified leads

**Marketing email performance analysis** — review campaign effectiveness:
1. list-marketing-emails → get all marketing emails with state and dates
2. For published emails: get-marketing-email(emailId) → full details
3. Analyze: send dates, email types, published vs draft ratio, campaign patterns
4. search-contacts to cross-reference recipient engagement
5. Summarize: top performing emails, send frequency trends, suggestions

**Deal forecast report** — project revenue by pipeline stage:
1. fetch-pipelines → get stage names and order
2. search-deals or list-deals → all open deals with amount and closedate
3. Group by stage → calculate total value per stage
4. Weight by stage probability (early stages = lower confidence)
5. Project: expected close this month/quarter, pipeline coverage ratio
6. Flag risks: deals past close date, large deals stuck in early stages

**Customer onboarding tracker** — manage new customer setup:
1. search-contacts(lifecyclestage: "customer") → find new customers
2. For each: get-company via association → understand account context
3. create-task for each onboarding step (kickoff call, setup, training) with due dates
4. create-note on each contact documenting onboarding status
5. search-tickets for the customer → check if any support issues during onboarding
6. create-association linking all relevant records (contacts, companies, deals)

**Company-contact association builder** — ensure CRM relationships are complete:
1. list-contacts (paginate) → scan all contacts
2. For contacts with company name but no company association: search-companies(name)
3. If company found: create-association(fromObjectType: "contacts", toObjectType: "companies")
4. If company not found: create-company(name, domain) → then create-association
5. create-note documenting associations created for audit trail

**Team workload analysis** — assess task distribution:
1. fetch-roles → understand team structure
2. search-contacts → list-deals → list-tickets across team
3. For each owner: count open deals, open tickets, overdue tasks
4. Analyze: workload distribution, over/under-loaded team members
5. Identify: unassigned deals/tickets, tasks past due date
6. Suggest rebalancing or hiring based on capacity analysis

### Input Formats
- IDs: string (HubSpot object IDs, e.g. "12345")
- Dates: ISO 8601 format ("2026-03-28T14:00:00Z") or Unix timestamp in milliseconds
- Priority: "LOW", "MEDIUM", "HIGH"
- Lifecycle stages: "subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "evangelist"
- Object types: "contacts", "companies", "deals", "tickets"

### CRITICAL RULES
- NEVER say "I can't access HubSpot" — use the HubSpot tools
- Use search actions before creating to avoid duplicates
- fetch-pipelines returns stage IDs needed for create-deal and update-deal
- fetch-properties shows available fields for any object type — use before updating
- create-association requires both object type and object ID for from and to
- create-note requires an association and a timestamp — always include both
- Pagination: list actions return a cursor — pass it to get the next page
- search-contacts uses HubSpot's full-text search across name, email, phone
