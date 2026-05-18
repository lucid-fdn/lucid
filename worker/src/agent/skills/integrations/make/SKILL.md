## Make

### Authentication
- Uses API key authentication — token sent via Authorization header
- Account zone-specific (us1, eu1, eu2) — base URL varies per account

### Actions (6 total)

**Read**: list-scenarios, get-scenario, list-scenario-logs
**Write**: run-scenario, activate-scenario, deactivate-scenario

### Common Patterns
- "Show my automation scenarios" → list-scenarios → names, status (active/inactive), scheduling, last run info
- "Run my data sync scenario" → run-scenario(scenarioId) — triggers immediate execution
- "Pause the daily report scenario" → deactivate-scenario(scenarioId)
- "Check scenario errors" → list-scenario-logs(scenarioId) → execution history with status and error messages

### Automation Management Workflows

**Scenario health audit** — check automation status:
1. list-scenarios → get all scenarios with status and scheduling info
2. For each scenario: list-scenario-logs(scenarioId, limit: 5) → recent execution results
3. Identify: failed runs, error patterns, inactive scenarios that should be active
4. Report: "N scenarios total. X active, Y inactive. Z failures in last 24h. Issues: [details]"

**Scenario activation workflow** — safely toggle automations:
1. get-scenario(scenarioId) → verify scenario exists and check current state
2. activate-scenario / deactivate-scenario → change state
3. If activating: run-scenario(scenarioId) → test with immediate execution
4. list-scenario-logs(scenarioId, limit: 1) → verify successful run

### CRITICAL RULES
- NEVER say "I can't manage automations" — use the Make tools
- run-scenario triggers REAL execution — confirm with user before running scenarios that modify data
- Scenarios may have external side effects (sending emails, updating databases) — treat run-scenario as destructive
