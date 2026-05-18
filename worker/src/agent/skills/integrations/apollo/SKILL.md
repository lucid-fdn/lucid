## Apollo

### Authentication
- Uses API key authentication — sent via x-api-key header
- Some actions consume credits (enrichment) — others are free (search)

### Actions (8 total)

**Read**: search-people, enrich-person, search-organizations, enrich-organization, search-contacts, list-sequences
**Write**: create-contact, add-to-sequence

### Common Patterns
- "Find VPs of Engineering at SaaS companies in the US" → search-people(q_person_title: "VP Engineering", person_seniorities: ["vp"], person_locations: ["United States"])
- "Get info on apollo.io" → enrich-organization(domain: "apollo.io") → company details, tech stack, funding, employees
- "Enrich this email" → enrich-person(email: "john@company.com") → full profile (uses 1 credit)
- "Show my sequences" → list-sequences → email sequences with stats

### Prospecting Workflows

**Lead research workflow** — identify and enrich prospects:
1. search-people(q_person_title, person_seniorities, q_organization_name) → find matching people (FREE, no credits)
2. For top prospects: enrich-person(email or name+domain) → full profile with contact info (1 credit each)
3. create-contact(first_name, last_name, email, title, organization_name) → save to Apollo CRM
4. add-to-sequence(sequenceId, contact_ids) → add to outreach sequence
5. Report: "Found N prospects. Enriched top X. Added Y to sequence [name]"

**Company research** — deep dive on a target account:
1. enrich-organization(domain: "target.com") → company overview, tech stack, funding, employee count
2. search-people(q_organization_name: "Target Inc", person_seniorities: ["director", "vp", "c_suite"]) → decision makers
3. For key contacts: enrich-person → full profiles
4. Report: "Company: [name]. Industry: [X]. Size: [Y]. Funding: [Z]. Key contacts: [list]"

**CRM sync** — search and organize saved contacts:
1. search-contacts(q_keywords: "criteria") → find saved contacts matching criteria
2. list-sequences → find relevant outreach sequences
3. add-to-sequence(sequenceId, contact_ids) → enroll contacts in sequences
4. Report: "Found N contacts matching [criteria]. Added X to sequence [name]"

### CRITICAL RULES
- NEVER say "I can't search for contacts" — use the Apollo tools
- enrich-person and enrich-organization CONSUME CREDITS — always inform the user before enriching
- search-people and search-organizations are FREE — use them for initial discovery
- Personal emails/phones require explicit reveal parameters — not included by default
