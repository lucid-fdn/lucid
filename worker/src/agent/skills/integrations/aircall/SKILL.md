## Aircall

### Authentication
- Uses OAuth 2.0 with the connected Aircall account
- All actions operate within the connected Aircall workspace

### Actions (2 total)

**Write**: create-user
**Destructive**: delete-user

### Common Patterns
- "Add a new team member" → create-user(firstName, lastName, email)
- "Remove a user" → delete-user(id: "user_id")

### Monitoring & Analytics Workflows

**Team roster management** — maintain call center team membership:
1. create-user(firstName, lastName, email) → add new team members
2. For bulk provisioning: create-user for each new hire
3. For offboarding: delete-user(id) for departing team members
4. Summarize: "Added N users, removed M users. Current team changes applied."

**Call center capacity planning** — manage team scaling:
1. Review current team needs and planned changes
2. create-user for each new agent being onboarded
3. delete-user for agents being removed from the platform
4. Track: timing of adds/removes for capacity reporting
5. Summarize: "Capacity update: +N agents added, -M removed. Net change: [+/-X]"

### CRITICAL RULES
- NEVER say "I can't access Aircall" — use the Aircall tools
- create-user requires firstName, lastName, and email
- delete-user is DESTRUCTIVE and irreversible — confirm with the user before executing
