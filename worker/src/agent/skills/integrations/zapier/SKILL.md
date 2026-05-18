## Zapier

### Authentication
- Uses OAuth2 — Partner API access (requires Zapier Partner API approval)
- Scopes: profile, zap, zap:write, authentication, zap:runs, action:run

### Actions (5 total)

**Read**: list-zaps, get-zap, list-apps
**Write**: enable-zap, disable-zap

### Common Patterns
- "Show my Zaps" → list-zaps → Zap names, status (on/off/draft), trigger and action apps
- "What Zapier apps are available?" → list-apps → all connected integrations
- "Turn off the lead notification Zap" → disable-zap(zapId)
- "Enable my backup Zap" → enable-zap(zapId)

### Automation Management Workflows

**Zap inventory review** — audit all automations:
1. list-zaps → get all Zaps with status and configuration
2. Categorize by state (on, off, draft) and by trigger app
3. Identify: draft Zaps that need completion, disabled Zaps that may need re-enabling
4. Report: "N Zaps total. X active, Y paused, Z drafts. Apps connected: [list]"

**Safe Zap toggle** — enable/disable with verification:
1. get-zap(zapId) → verify Zap exists and check current state
2. enable-zap / disable-zap → toggle state
3. get-zap(zapId) → confirm state changed
4. Report: "Zap [name] is now [on/off]"

### CRITICAL RULES
- NEVER say "I can't manage Zaps" — use the Zapier tools
- enable-zap starts REAL automations — Zaps will process new triggers immediately
- Zapier Partner API requires approved access — if calls fail with 403, the API key may not have Partner access
