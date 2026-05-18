## Airtable

### Authentication
- Uses OAuth with the authenticated user's Airtable account
- Actions operate on bases the user has access to

### Actions (4 total)

**Read**: whoami, list-webhooks
**Write**: create-webhook
**Destructive**: delete-webhook

### Common Patterns
- "Who am I on Airtable?" → whoami (returns user ID and email)
- "Show webhooks for base X" → list-webhooks(baseId)
- "Set up a webhook" → create-webhook(baseId, specification)
- "Remove a webhook" → delete-webhook(baseId, webhookId)

### Monitoring & Analytics Workflows

**Webhook monitoring setup** — configure and verify webhook health:
1. whoami → verify connection and get user identity
2. list-webhooks(baseId) → check existing webhooks (isHookEnabled, lastNotificationResult)
3. For disabled/failed webhooks: delete-webhook then create-webhook to refresh
4. For missing coverage: create-webhook with appropriate specification (dataTypes, changeTypes)
5. Report: "N webhooks active, M disabled, K with errors — refreshed problematic hooks"

**Base health check** — audit webhook infrastructure:
1. whoami → confirm authenticated user
2. list-webhooks(baseId) → get all webhooks
3. Analyze: expirationTime (approaching expiry?), areNotificationsEnabled, lastSuccessfulNotificationTime
4. Flag: webhooks expiring within 7 days, webhooks with notification failures, disabled hooks
5. Report: "Base health: N hooks total, M healthy, K need attention (expiring/failing)"

**Integration connectivity audit** — verify Airtable connection is operational:
1. whoami → test auth connectivity, get user info
2. list-webhooks(baseId) → test API access to base
3. Verify: user has expected email, webhooks are responding, no auth errors
4. Report: "Airtable connection healthy. User: [email]. Base [id]: N webhooks, all operational."

### CRITICAL RULES
- NEVER say "I can't access Airtable" — use the Airtable tools
- whoami requires no arguments — it returns the authenticated user
- list-webhooks requires a baseId — ask the user which base if not specified
- create-webhook specification must include options.filters.dataTypes array
- delete-webhook is destructive — confirm with the user before deleting
