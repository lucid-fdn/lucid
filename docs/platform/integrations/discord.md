# Discord Integration

For the canonical current-state architecture, including hosted shared-bot flows vs BYOB and relay vs native behavior, see `docs/platform/agents/channels.md`.

## Current Model

Lucid supports two Discord modes:

- `Hosted shared bot`
  - Lucid owns the shared Discord application
  - owner/admin installs it into a guild from Studio
  - guild slash commands manage the active agent:
    - `/agents`
    - `/switch`
    - `/whoami`
  - `/status`
  - `/probe`
  - `/voice`
  - `/vc`
  - `/models`
  - `/model`
  - `/ops`
  - `/leave`
  - `/help`
- `BYOB`
  - the tenant provides its own bot token
  - the channel can run through shared worker, dedicated relay, or dedicated native runtime depending on deployment mode

## Hosted Discord

Hosted Discord is the fastest path for most teams.

Studio flow:
1. Open the agent in Lucid Studio
2. Go to `Channels`
3. Choose `Discord`
4. Choose hosted mode
5. Click `Install on Discord`
6. Complete Discord OAuth for the target guild

After install:
- Lucid registers guild-scoped slash commands immediately
- `/agents` lets server admins pick the active agent
- `/switch` changes the active agent by name
- `/whoami` shows which agent is currently active in that guild
- `/status` shows routing, delivery, voice, and model details for the active guild binding
- `/probe` runs a live hosted-bot health probe and reports current bot presence, probe timing, and the latest Discord API result
- `/voice` shows or updates the active agent's Discord voice-reply settings
- `/vc` joins, leaves, or inspects a live hosted Discord voice session for the guild
- `/models` shows the active model and renders an admin-only model picker
- `/model` changes the active agent model directly by id or name
- `/ops` launches Mission Control Agent Ops workflows from Discord
- `/leave` unbinds the active agent from the guild

Important behavior:
- there is no separate "public install link" toggle anymore
- install itself is the privileged action
- hosted Discord primary selection is explicit and atomic at the guild level
- model management stays in Discord after install; admins do not need to return to Studio for routine model changes
- Studio now exposes hosted Discord delivery controls for each guild binding:
  - dedicated channels
  - reply behavior: `off`, `first`, `all`
  - chunk mode: `length`, `newline`
  - soft line cap per physical Discord message
- Studio also exposes worker-backed Discord bot health for hosted installs:
  - configured/running state
  - last start
  - last probe
  - current hosted bot presence
  - active hosted voice session status
  - privileged intent summary from the live Discord API probe
- Discord voice replies can be configured directly in Discord for the active guild binding:
  - `/voice`
  - `/voice mode:off`
  - `/voice mode:auto`
  - `/voice mode:always name:onyx`
- Live hosted Discord voice sessions can also be managed directly in Discord:
  - `/vc action:join channel:<voice-channel>`
  - `/vc action:status`
  - `/vc action:leave`
- Hosted Discord now keeps a live worker-managed bot presence updated from worker health:
  - healthy worker => `online`
  - degraded queue health => `idle`
  - startup/runtime failure => `dnd`
- Hosted Discord voice sessions use the same assistant pipeline as text:
  - user speaks in the joined voice channel
  - Lucid transcribes the segment
  - the normal Discord assistant runtime handles memory/tools/model selection
  - Lucid synthesizes the final assistant reply back into the active voice channel
- `auto` only emits a voice message when the inbound Discord event carried audio attachments
- `always` prefers a Discord voice message first and falls back to text if synthesis or delivery fails
- signed Discord components are bound to both guild and invoking user, so stale or cross-user replays cannot mutate guild state

### Hosted routing and defaults

Hosted Discord now uses the shared hosted ownership model:
- one guild-level default agent
- alias management for the guild surface
- explicit guild-level agent switching from slash commands and the Studio admin panel

That keeps routine routing changes inside Discord while still letting admins inspect defaults, aliases, and ownership from Studio.

### Agent Ops and Browser Operator

Discord uses a native slash command for Agent Ops:

- `/ops workflow:qa target:https://preview.example.com`
- `/ops workflow:check-page target:https://www.example.com`
- `/ops workflow:research-site target:https://competitor.example.com`
- `/ops workflow:extract-data target:pricing from https://www.example.com/pricing`
- `/ops workflow:monitor-page target:https://status.example.com`

The `workflow` option is autocompleted from the shared Agent Ops workflow registry. Unlike Slack or Telegram, Discord does not need separate `/check` or `/research` commands; those are workflow choices under `/ops`.

## Hosted Env Requirements

Hosted Discord requires these control-plane env vars:

- `FEATURE_DISCORD_HOSTED=true`
- `DISCORD_HOSTED_CLIENT_ID`
- `DISCORD_HOSTED_CLIENT_SECRET`
- `DISCORD_HOSTED_BOT_TOKEN`
- `DISCORD_HOSTED_PUBLIC_KEY`
- `DISCORD_HOSTED_STATE_SECRET`
- `DISCORD_HOSTED_INTERACTION_SECRET`

These belong on the web/control plane only. Do not leak them into the worker.

## BYOB Discord

BYOB remains available when a tenant wants full control of the Discord bot identity.

Typical setup:
1. Create a Discord application in the Discord Developer Portal
2. Add a bot user
3. Enable `Message Content Intent`
4. Invite the bot to the target guild
5. Add the Discord channel in Lucid with the bot token

BYOB Discord supports:
- guild mentions
- direct messages
- thread-aware replies
- dedicated runtime native adapter mode

## Troubleshooting

| Issue | What to check |
|-------|---------------|
| Hosted install unavailable | `FEATURE_DISCORD_HOSTED` and `DISCORD_HOSTED_*` env vars on the control plane; run `npm run env:audit:channels` for a production audit |
| Slash commands missing after install | `applications.commands` scope and successful guild command registration |
| Bot not responding in BYOB mode | Bot token valid, Message Content Intent enabled, bot invited with correct permissions |
| Worker should not see hosted Discord envs | Run the worker env audit test |
