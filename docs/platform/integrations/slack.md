# Slack Integration

Lucid supports two Slack models:

- **Managed hosted Slack**: install the shared Lucid Slack app into a workspace, then bind an agent explicitly to a DM or channel.
- **Bring-your-own Slack app**: connect your own bot token for a dedicated Slack app identity.

The managed hosted path is the default product direction.

## Managed hosted Slack

### What users get

- One Lucid Slack app installed per workspace
- Different Lucid agents can be routed to different Slack conversations
- Distinct outbound agent names through Slack `chat:write.customize` when the workspace grants that scope
- Native Slack commands that feed Lucid's existing command router
- Slack image, audio, and document attachments surfaced to the agent runtime

### Required Slack app configuration

In the Slack app settings:

1. Enable **Socket Mode**
2. Create an **App Token** with `connections:write`
3. Add this redirect URL under **OAuth & Permissions**:
   - `https://www.lucid.foundation/api/webhooks/slack/oauth/callback`
4. Add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `chat:write.customize`
   - `commands`
   - `files:read`
   - `groups:read`
   - `groups:history`
   - `im:read`
   - `im:history`
   - `im:write`
   - `mpim:read`
   - `mpim:write`
   - `reactions:write`
5. Enable **App Home**
6. Enable **Interactivity**

Reinstall the Slack app after changing scopes.

### Install and bind flow

1. Open the agent in Lucid
2. Click **Install on Slack**
3. Approve the Lucid Slack app in the target workspace
4. Finish the bind either in Lucid or in Slack:
   - choose a conversation from Lucid's Slack panel
   - `Bind DM` from App Home
   - `Choose channel` from App Home
   - `/lucid bind` in the target conversation

Lucid no longer binds implicitly on first DM. Binding is explicit.

Important install model:
- Slack OAuth installs Lucid into the workspace first
- Slack OAuth does not choose the final DM or channel for the agent
- the final conversation bind happens after install, either from Lucid's web UI or inside Slack through App Home or `/lucid bind`

### Slack-native commands

Managed Slack supports these command entry points:

- `/lucid`
- `/lucid bind`
- `/lucid whoami`
- `/lucid unbind`
- `/lucid help`
- `/lucid status`
- `/lucid usage`
- `/lucid reset`
- `/lucid compact`
- `/agentstatus`

`/lucid bind`, `/lucid whoami`, and `/lucid unbind` are handled directly in the Slack control layer. Runtime-oriented commands still flow into Lucid's normal slash-command pipeline.

Agent Ops and Browser Operator also run through the same `/lucid` slash command. You do not need separate Slack slash commands for `check`, `buy`, `research`, `extract`, or `monitor`; they are arguments to `/lucid`.

Running `/lucid` with no arguments opens the Slack-native Agent Ops picker. The picker shows the most common Browser Operator workflows, including page checks, governed buying, research, extraction, monitoring, and QA. Each picker action opens a Slack modal, validates the target input, launches through the shared Agent Ops control-plane bridge, and reports the same run id, dispatch tier, runtime compatibility, and channel status that Mission Control shows.

Supported Agent Ops examples:

- `/lucid ops qa https://preview.example.com`
- `/lucid check https://www.example.com`
- `/lucid buy weekly groceries under $120 from Carrefour`
- `/lucid research https://competitor.example.com`
- `/lucid extract pricing from https://www.example.com/pricing`
- `/lucid monitor https://status.example.com`

Slack app command setup:

- Create one slash command named `/lucid` and point it at the same Slack command request URL used by the hosted Slack app.
- Set the Slack command usage hint to `check <url> | buy <request> | research <url> | extract <task> | monitor <url> | ops <workflow>`.
- Set the Slack command description to `Launch Lucid Agent Ops workflows`.
- Keep `/agentstatus` only if this workspace already uses the legacy status command.
- Reinstall the app after adding or changing slash commands and bot scopes.
- Because Slack only registers slash-command names, all Browser Operator verbs are parsed by Lucid after `/lucid`; they will not appear as separate Slack commands. The empty `/lucid` picker is the Slack-native replacement for Discord-style subcommand autocomplete.

### Hosted routing and defaults

Hosted Slack now uses the full shared ownership model:
- one workspace-level default agent
- explicit DM/channel bind for conversation ownership
- per-conversation override labels in Studio
- alias management for the workspace surface

Slack also supports explicit assistant targeting when the workspace has multiple hosted agents available:
- `@Lucid sales help with this`
- `/lucid sales summarize this`

### How replies are placed

Slack reply placement follows the inbound conversation shape:

- top-level messages are answered back in the main channel
- messages that were already sent inside a Slack thread are answered in that same thread

Lucid should not move a normal in-channel message into a thread.

### Attachment handling

Slack attachments are resolved in the worker before the agent run:

- images become multimodal image inputs
- audio files are transcribed through the shared media transcription layer
- documents become explicit textual context for the agent

### UX model

Slack uses a shared Lucid app identity at the workspace-install level.

Lucid softens that shared-app model by projecting the active assistant name into outbound messages when `chat:write.customize` is available. If that scope is not available, Slack falls back to the base Lucid bot identity.

App Home is the persistent control surface for:
- installed but unbound agents
- current Slack bindings
- DM binding
- channel picker binding
- unbind actions

Lucid web UI now also exposes a hosted Slack conversation picker for the common "install in workspace, then bind a channel" path.

## Bring-your-own Slack app

If you need a completely separate Slack app identity, you can still connect your own Slack app and token set. That path is useful for teams that want isolated branding or separate workspace-level Slack apps per deployment.

## Troubleshooting

| Issue | What to check |
|-------|---------------|
| Hosted install unavailable | Verify `FEATURE_SLACK_HOSTED` and `SLACK_HOSTED_*` env vars on the control plane; run `npm run env:audit:channels` for a production audit. |
| Install fails with `Missing state` | Start from Lucid's **Install on Slack** button. Do not open the raw Slack OAuth URL directly. |
| App installs but agent never replies | Open the Lucid app in Slack and bind the agent explicitly, or run `/lucid bind` in the target conversation. |
| App installs but stays in a pending state in Lucid | That is expected until the workspace install is bound to a specific DM or channel. Finish the bind in Slack App Home or run `/lucid bind` in the target conversation. |
| Messages use the base Lucid bot name | Reinstall the Slack app with `chat:write.customize`. |
| A normal channel message got a threaded reply | Lucid should only reply in-thread when the inbound Slack message already had `thread_ts`. Top-level messages should be answered in the main channel. |
| Audio files are not transcribed | Verify the deployment has a working STT backend through TrustGate or another configured provider. |
| Channel picker does not show channels | Verify the app was reinstalled with the new read scopes (`channels:read`, `groups:read`, `im:read`, `mpim:read`) and that Interactivity is enabled. |
| Channel commands do nothing | Verify slash commands are configured in Slack for `/lucid` and `/agentstatus`, and that Socket Mode is active. |
