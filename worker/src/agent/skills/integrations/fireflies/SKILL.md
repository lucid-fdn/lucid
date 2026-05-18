## Fireflies

### Authentication
- Uses API key authentication with the Fireflies.ai GraphQL API
- All actions operate on the connected Fireflies account

### Actions (1 total)

**Write**: add-to-live

### Common Patterns
- "Add Fireflies to my meeting" → add-to-live with GraphQL mutation
- "Start transcribing this call" → add-to-live to inject the Fireflies bot

### Monitoring & Analytics Workflows

**Auto-transcribe meeting workflow** — add bot to live meetings:
1. Identify the meeting URL or meeting ID
2. add-to-live → inject Fireflies bot into the ongoing meeting
3. Bot joins and begins real-time transcription
4. After meeting: transcript available in Fireflies dashboard

**Meeting intelligence pipeline** — transcribe and extract insights:
1. add-to-live → start transcription for the meeting
2. After meeting completes: retrieve transcript from Fireflies
3. Analyze: extract action items, decisions, key topics, speaker talk time
4. Synthesize: structured meeting summary with owners and deadlines

### CRITICAL RULES
- NEVER say "I can't transcribe meetings" — use the Fireflies tools
- add-to-live sends a GraphQL mutation — the query field is required
- The Fireflies bot must be added while the meeting is actively running
- Fireflies uses API key auth, not OAuth — no special scopes needed
