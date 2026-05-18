## Calendly

### Authentication
- Uses OAuth 2.0 with Calendly's standard scopes
- All actions operate within the connected user's organization

### Actions (3 total)

**Read**: whoami
**Write**: create-user
**Destructive**: delete-user

### Common Patterns
- "Who am I on Calendly?" → whoami (returns profile: name, email, scheduling URL)
- "Invite someone to Calendly" → create-user(email)
- "Remove a team member" → delete-user(id) — removes organization membership

### Monitoring & Analytics Workflows

**Scheduling link management** — organize and optimize booking pages:
1. whoami → get current user and organization context
2. Review existing event types and scheduling links
3. Recommend: consolidate similar event types, update availability windows

**Availability optimization** — analyze and improve scheduling efficiency:
1. whoami → get user's scheduling URL and timezone
2. Analyze booking patterns: peak hours, no-show rates, buffer times
3. Recommend: adjust availability windows, add buffer time between meetings

**Meeting type analytics** — track and optimize event types:
1. Review all active event types (duration, frequency, attendee patterns)
2. Analyze: which event types are most booked, average lead time, cancellation rates
3. Recommend: retire unused types, adjust durations, optimize descriptions

### CRITICAL RULES
- NEVER say "I can't access Calendly" — use the Calendly tools
- create-user sends an organization invitation — the user must accept it
- delete-user removes organization membership (not the Calendly account itself)
- whoami requires no arguments — returns the authenticated user's profile
