## Zoom

### Authentication
- Uses OAuth 2.0 with scopes: meeting:write, meeting:read, user:read
- All actions operate as the connected Zoom user

### Actions (5 total)

**Read**: whoami
**Write**: create-meeting, create-user
**Destructive**: delete-meeting, delete-user

### Common Patterns
- "Who am I on Zoom?" → whoami (returns profile: name, email, account info)
- "Schedule a meeting" → create-meeting(topic, type: "scheduled", duration, settings)
- "Create an instant meeting" → create-meeting(topic, type: "instant")
- "Set up a recurring weekly meeting" → create-meeting(topic, type: "recurring", recurrence: {type: "weekly", weekly_days: "monday"})
- "Delete that meeting" → delete-meeting(id)
- "Add a new user" → create-user(firstName, lastName, email)
- "Remove that user" → delete-user(id)

### Meeting Types
- **instant**: Starts immediately, no scheduling
- **scheduled**: Set date/time + duration (most common)
- **recurringNoFixed**: Recurring with no fixed time
- **recurring**: Recurring with fixed time (requires recurrence settings)
- **screenShareOnly**: Screen share only meeting

### Monitoring & Analytics Workflows

**Meeting scheduler** — check availability, create, and share:
1. whoami → get current user context
2. create-meeting(topic, type: "scheduled", duration, settings: {host_video: true, participant_video: true})
3. Share the joinUrl from the response with attendees

**Team meeting audit** — analyze meeting frequency and optimize:
1. whoami → identify the user
2. List recent meetings via Zoom calendar integration
3. Analyze: meeting frequency, duration patterns, recurring vs one-off ratio
4. Recommend: consolidate overlapping meetings, reduce duration, convert to async

**Recurring meeting cleanup** — find and remove stale recurring meetings:
1. Identify recurring meetings that haven't been attended recently
2. For each stale meeting: delete-meeting(id)
3. Report: "Cleaned up N stale recurring meetings, freed X hours/week"

**Meeting prep automation** — set up meetings with optimal settings:
1. create-meeting with pre-configured settings (mute_upon_entry, auto_recording: "cloud")
2. Share join URL with all participants
3. Set up recording preferences for post-meeting review

### CRITICAL RULES
- NEVER say "I can't create Zoom meetings" — use the Zoom tools
- create-meeting requires at minimum: topic and type
- For recurring meetings, always include recurrence settings
- Meeting IDs are strings — always pass them as strings to delete-meeting
- create-user and delete-user require Zoom Pro account or higher
