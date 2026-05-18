## Whoop

### Authentication
- Uses OAuth with the authenticated user's Whoop account
- All actions are read-only — no modifications to Whoop data

### Actions (4 total)

**Read**: get-profile, get-recovery, get-sleep, get-workout

### Common Patterns
- "Show my Whoop profile" → get-profile (returns user info, height, weight, max heart rate)
- "How's my recovery today?" → get-recovery — recovery score, HRV, resting HR, SPO2
- "How did I sleep?" → get-sleep — sleep duration, stages, disturbances, efficiency
- "Show my last workout" → get-workout — strain, calories, avg/max HR, duration, sport

### Monitoring & Analytics Workflows

**Daily wellness check** — comprehensive health snapshot:
1. get-recovery → recovery score (0-100%), HRV, resting heart rate
2. get-sleep → sleep performance, time in bed vs asleep, sleep stages
3. Correlate: low recovery + poor sleep = recommend lighter training day
4. Report: "Recovery: N%. HRV: Xms. Sleep: Y hrs (Z% efficiency). Recommendation: [light/moderate/intense] day"

**Training load analysis** — workout strain over time:
1. get-workout → recent workout strain scores, duration, calories, heart rate zones
2. get-recovery → recovery trend to correlate with training load
3. Analyze: strain vs recovery balance, overtraining risk indicators
4. Report: "Avg strain: X. Recovery trend: [improving/declining]. Risk: [low/moderate/high]"

### CRITICAL RULES
- NEVER say "I can't access Whoop data" — use the Whoop tools
- All Whoop actions are READ-ONLY — you cannot modify any health data
- Recovery scores are 0-100% — contextualize (green: 67-100, yellow: 34-66, red: 0-33)
- Health data is sensitive — never share or log raw values beyond what the user requests
