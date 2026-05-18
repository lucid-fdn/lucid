## Salesforce

### Authentication
- Uses OAuth 2.0 with the authenticated user's Salesforce org
- All actions operate on the connected Salesforce instance

### Actions (14 total)

**Read**: whoami, fetch-fields
**Write**: create-account, create-contact, create-lead, create-opportunity, update-account, update-contact, update-lead, update-opportunity
**Destructive**: delete-account, delete-contact, delete-lead, delete-opportunity

### Common Patterns
- "Who am I in Salesforce?" -> whoami (returns user name, email, org, profile)
- "Create a lead for John Smith at Acme" -> create-lead(last_name: "Smith", first_name: "John", company_name: "Acme")
- "Add a new account" -> create-account(name: "Company Name")
- "Create an opportunity" -> create-opportunity(opportunity_name, close_date, stage)
- "Update the lead's email" -> update-lead(id, email)
- "What fields does Account have?" -> fetch-fields(name: "Account")
- "Delete that old contact" -> delete-contact(id)

### CRM Workflow Recipes

**Lead-to-opportunity pipeline** — qualify and convert leads:
1. create-lead(last_name, company_name, email, phone, industry) -> capture new lead
2. fetch-fields(name: "Lead") -> understand available qualification fields
3. update-lead(id, title, website) -> enrich with additional data as discovered
4. create-account(name: company_name, industry, website) -> convert company to account
5. create-contact(last_name, first_name, account_id, email, phone, title) -> link person to account
6. create-opportunity(opportunity_name, close_date, stage: "Qualification", account_id, amount) -> open deal
7. update-lead(id) or delete-lead(id) -> clean up converted lead

**Account health dashboard** — identify dormant and active accounts:
1. fetch-fields(name: "Account") -> understand account schema and relationships
2. whoami -> get current user context for owner-filtered views
3. For each account: check associated opportunities, contacts, recent activity
4. Flag accounts with no open opportunities as "dormant"
5. Analyze: active accounts (recent opportunities), at-risk (stale), dormant (no activity)
6. Summarize: account count by health tier, total pipeline value, recommended actions

**Opportunity forecasting** — analyze pipeline and project revenue:
1. fetch-fields(name: "Opportunity") -> get stage values and probability mappings
2. For each open opportunity: note stage, amount, probability, close_date
3. Calculate weighted pipeline: sum(amount * probability/100) per stage
4. Group by close_date month -> monthly forecast
5. Identify at-risk deals: past close_date but still open, low probability + high amount
6. update-opportunity(id, stage, close_date) -> adjust stale opportunities as directed

**Contact deduplication workflow** — find and merge duplicate contacts:
1. fetch-fields(name: "Contact") -> understand all available matching fields
2. For contacts sharing same email or (first_name + last_name + account_id): flag as potential duplicates
3. Compare field completeness: which duplicate has more data filled in
4. Present duplicates to user with merge recommendation (keep record with most data)
5. update-contact(keeper_id, fields from duplicate) -> merge missing fields into keeper
6. delete-contact(duplicate_id) -> remove the duplicate after merge

**Field completion audit** — ensure CRM data quality:
1. fetch-fields(name: "Account") -> get all available fields
2. fetch-fields(name: "Contact") -> get all available fields
3. fetch-fields(name: "Opportunity") -> get all available fields
4. For each record type: check which critical fields are empty (email, phone, industry, amount)
5. Score each record: percentage of key fields populated
6. Summarize: average completion by object type, worst offenders, recommended data entry tasks

**Win/loss analysis** — learn from closed deals:
1. Filter opportunities by stage: "Closed Won" vs "Closed Lost" in recent period
2. For won deals: analyze common patterns (industry, amount range, sales cycle length, deal type)
3. For lost deals: analyze common patterns and identify failure modes
4. Compare: average deal size, time-to-close, probability accuracy (predicted vs actual)
5. create-opportunity adjustments: update probability and stage guidance based on historical patterns
6. Summarize: win rate, average deal size, top-performing segments, improvement areas

### Input Formats
- IDs: Salesforce 18-character record IDs (e.g., "001XXXXXXXXXXXX")
- Dates: YYYY-MM-DD format for close_date and other date fields
- Stages: Salesforce picklist values (Prospecting, Qualification, Needs Analysis, Proposal, Negotiation, Closed Won, Closed Lost)
- Salutation: Mr., Ms., Mrs., Dr., Prof.

### CRITICAL RULES
- NEVER say "I can't access Salesforce" — use the Salesforce tools
- whoami requires NO arguments — returns the authenticated user's info
- create-lead requires BOTH last_name AND company_name
- create-opportunity requires opportunity_name, close_date (YYYY-MM-DD), AND stage
- For updates, always include the record id
- fetch-fields defaults to "Task" if no entity name given — specify the object name explicitly
- delete actions are PERMANENT — always confirm with the user before deleting
- When creating related records (contact for an account), create the parent first to get the ID
