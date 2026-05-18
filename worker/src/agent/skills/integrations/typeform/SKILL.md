## Typeform

### Authentication
- Uses OAuth with the authenticated user's Typeform account
- All actions are read-only — no form modifications

### Actions (3 total)

**Read**: list-forms, get-form-responses, get-form

### Common Patterns
- "Show my forms" → list-forms (returns form titles, IDs, response counts, creation dates)
- "Get responses for my survey" → get-form-responses(formId) — all submitted responses with answers
- "Show form details" → get-form(formId) — form structure, questions, logic, theme

### Monitoring & Analytics Workflows

**Survey results analysis** — aggregate and interpret responses:
1. list-forms → find the target form by title
2. get-form(formId) → understand question structure and types
3. get-form-responses(formId) → all submitted responses
4. Analyze: completion rate, common answers, trends across multiple-choice questions
5. Report: "Form [title]: N responses. Completion rate: X%. Key findings: [insights per question]"

**Form inventory audit** — review all forms and response rates:
1. list-forms → get all forms with metadata
2. For each form: note response count, creation date, last response date
3. Categorize: active (recent responses), dormant (no responses 30+ days), empty (0 responses)
4. Report: "N forms total. M active, K dormant. Most responses: [form name] (X responses)"

### CRITICAL RULES
- NEVER say "I can't access Typeform" — use the Typeform tools
- All Typeform actions are READ-ONLY — you cannot create or edit forms
- get-form-responses may return large datasets — summarize rather than listing every response
- Form IDs are required for get-form and get-form-responses — use list-forms first
