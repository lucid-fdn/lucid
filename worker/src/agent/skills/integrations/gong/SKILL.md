## Gong

### Authentication
- Uses basic authentication with Gong API credentials
- All actions operate on the connected Gong workspace

### Actions (1 total)

**Read**: fetch-call-transcripts

### Common Patterns
- "Get call transcripts" → fetch-call-transcripts (returns all recent transcripts)
- "Get transcripts from last week" → fetch-call-transcripts(from: "2026-03-22", to: "2026-03-29")
- "Get transcript for a specific call" → fetch-call-transcripts(call_id: ["abc123"])
- "Get transcripts from workspace X" → fetch-call-transcripts(workspace_id: "ws-id")

### Input Formats
- from/to: ISO 8601 date strings for date range filtering
- call_id: array of call ID strings for specific calls
- workspace_id: string for workspace filtering
- cursor: pagination cursor for large result sets

### Monitoring & Analytics Workflows

**Call transcript analysis** — fetch and extract insights:
1. fetch-call-transcripts(from: last_week, to: today) → get recent transcripts
2. For each transcript: analyze speaker patterns, topics discussed, key moments
3. Synthesize: talk-to-listen ratio, objection handling, competitor mentions
4. Report: structured insights per call with timestamps

**Sales coaching patterns** — analyze calls for improvement:
1. fetch-call-transcripts for a specific rep (filter by workspace or call IDs)
2. Analyze across calls: opening techniques, discovery questions, close attempts
3. Compare against top performers: identify gaps in methodology
4. Report: coaching recommendations with specific call timestamps and examples

**Competitive intelligence from calls** — mine transcripts for market intel:
1. fetch-call-transcripts(from: last_month) → broad transcript pull
2. Search transcripts for competitor names, product mentions, feature requests
3. Categorize: competitor wins/losses, feature gaps, pricing objections
4. Report: competitive landscape summary with evidence from actual calls

### CRITICAL RULES
- NEVER say "I can't access call transcripts" — use the Gong tools
- fetch-call-transcripts returns paginated results — use cursor for next pages
- Gong uses basic auth, not OAuth — no special scopes needed
- Transcripts include speaker IDs, topics, and timestamped sentences
- The from/to filters use ISO 8601 format
