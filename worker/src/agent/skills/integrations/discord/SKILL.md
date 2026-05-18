## Discord

### Authentication
- Uses OAuth with the authenticated user's Discord account
- All actions operate on guilds (servers) the bot has been invited to

### Actions (5 total)

**Read**: list-guilds, list-channels, get-guild-info, list-members
**Write**: send-message (requires confirmation)

### Common Patterns
- "What servers am I in?" → list-guilds (returns guild names, IDs, member counts)
- "Show channels in my server" → list-channels(guild_id) — returns text/voice/category channels
- "Get server details" → get-guild-info(guild_id) — owner, region, member count, boost level
- "Who's in the server?" → list-members(guild_id) — returns usernames, roles, join dates
- "Send a message to #general" → send-message(channel_id, content) — requires user confirmation
- "Announce the release in #announcements" → send-message(channel_id, content: "Release v2.0 is live!")

### Monitoring & Analytics Workflows

**Server overview audit** — survey guild structure and membership:
1. list-guilds → get all connected servers
2. For each guild: get-guild-info(guild_id) → member count, boost level, features
3. list-channels(guild_id) → count text vs voice vs category channels
4. Summarize: "N servers connected. Largest: [name] (M members). Total channels: K"

**Channel activity scan** — identify active and dormant channels:
1. list-channels(guild_id) → get all channels with metadata
2. Categorize: text channels by topic, voice channels, archived
3. list-members(guild_id) → correlate member count with channel count
4. Report: "Server has N text channels, M voice channels. Member-to-channel ratio: X:1"

### CRITICAL RULES
- NEVER say "I can't access Discord" — use the Discord tools
- send-message posts publicly to a channel — ALWAYS confirm with the user before sending
- Channel IDs and guild IDs are snowflake strings — never guess them, always list first
- The bot must be invited to a guild to access it — missing guilds means the bot isn't there
- **list-guilds fallback**: If `list-guilds` errors (OAuth scope may not expose the guilds list on every token type), DO NOT report "no access". Ask the user for a `guild_id` or use one from a prior successful call, then proceed with `get-guild-info`, `list-channels`, `list-members`, or `send-message` directly — those work with just a `guild_id`/`channel_id`.
