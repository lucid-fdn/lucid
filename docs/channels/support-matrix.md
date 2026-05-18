# Runtime Transport Support Matrix

Current-state architecture lives in `docs/platform/agents/channels.md`. This document is narrower: it tracks the managed outbound transport boundary and the major channel capabilities that are actually live in Lucid today.

Important release distinction:
- **Code-supported** means the repo has the adapter, tests, and control-plane path.
- **Production-released** means real production bindings/provider surfaces exist and a live smoke passed.
- WhatsApp, Teams, and iMessage are code-supported but not production-released until `docs/channels/unreleased-channel-release-checklist.md` is complete.

Tooling note:
- this matrix is about channel transport capabilities
- tool-schema preparation still follows the shared manifest pipeline in `docs/platform/plugins/tool-manifests.md`
- shared, dedicated, and BYO runtime differences here do not imply different tool schema contracts

Status:
- Discord + Telegram managed shims shipped on 2026-04-08
- Teams managed shim shipped on 2026-04-09
- Slack managed shim and hosted bind expansion shipped on 2026-04-14
- WhatsApp control-plane cutover shipped on 2026-04-16
- Hosted iMessage provider-plane control path shipped on 2026-04-27
- Legacy hand-rolled senders still exist as dark fallback where noted
- Shared-worker outbound orchestration for Telegram, Discord, Slack, WhatsApp, Teams, and iMessage now lives behind per-channel bridge helpers instead of inline processor branches

## Discord

| Capability | Control plane / hosted | Managed outbound shim | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | Yes |
| Replies | Yes | Yes | Yes |
| Components / selects | Yes | Same Lucid-owned hosted layer | Yes |
| Slash commands | Yes (`/help`, `/agents`, `/switch`, `/whoami`, `/leave`, `/voice`, `/ops`) | Same Lucid-owned hosted layer | N/A |
| Voice replies | Yes | Yes (`sendVoiceMessageDiscord`) | Yes |
| Media upload | Partial | Yes | Yes |
| Interactions webhook | Yes (Lucid-owned Ed25519 path) | Unchanged | Unchanged |

Notes:
- Hosted Discord remains Lucid-owned for OAuth, slash commands, components, and guild primary-agent routing.
- Discord Agent Ops uses `/ops` workflow choices, including `check-page`, `research-site`, `extract-data`, and `monitor-page`; it does not need a separate `/check` slash command.
- Managed shim changes outbound transport only.

## Telegram

| Capability | Control plane / hosted | Managed outbound shim | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | Deferred |
| Replies / chunking | Yes | Yes | Deferred |
| Inline keyboards | Yes | Same Lucid-owned hosted layer | Deferred |
| Hosted multi-agent commands | Yes (`/start`, `/agents`, `/switch`, `/whoami`, `/voice`, `/ops`, `/check`, `/buy`, `/research`, `/extract`, `/monitor`, `/leave`, `/help`) | Same Lucid-owned hosted layer | Deferred |
| Mini App | Yes | Unchanged | N/A |
| Voice replies | Yes | Yes | Deferred |
| Media ingress + transcription | Yes | N/A | Deferred |

Notes:
- OpenClaw-managed Telegram affects outbound transport only.
- Hosted Telegram UX, personas, callbacks, and room controls remain Lucid-owned.

## Slack

| Capability | Hosted / shared worker | Managed outbound shim | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | Yes |
| Assistant identity projection | Yes | Yes (`chat:write.customize`) | Yes |
| Slash commands | Yes (`/lucid bind`, `/lucid whoami`, `/lucid unbind`, `/lucid ops`, `/lucid check`, `/lucid research`, `/lucid extract`, `/lucid monitor`, `/agentstatus`) | Same Lucid-owned layer | N/A |
| App Home | Yes | Same Lucid-owned layer | N/A |
| Modal channel picker | Yes | Same Lucid-owned layer | N/A |
| Attachment-aware ingress | Yes | N/A | Yes |
| Top-level replies in channel | Yes | Yes | Yes |
| Thread reply preservation | Yes | Yes | Yes |
| Immediate Pulse enqueue after inbound insert | Yes | N/A | Yes |
| Recent `done` reply-gap repair | Yes | N/A | Yes |

Notes:
- Hosted Slack now uses explicit bind, not implicit first-DM claiming.
- Lucid owns OAuth, binding semantics, App Home, and modal flows.
- Slack only needs the single `/lucid` slash command. `/lucid check <url>` is an argument pattern handled by Lucid, not a separate Slack slash-command registration.
- Slack replies in the main channel for normal top-level messages and stays in-thread only when the inbound message already had `thread_ts`.
- The shared worker now mirrors Discord's immediate inbound-to-Pulse enqueue path for Slack and also runs a remediation sweep for recent completed Slack/Discord inbounds that still have no outbound row.

## Microsoft Teams

| Capability | Control plane / hosted | Managed outbound shim | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | Yes |
| Reply to activity | Yes | Yes | Yes |
| JWT validation | Yes | N/A | Yes |
| Service URL persistence | Yes | N/A | Yes |
| Hosted chat commands | Yes (`help`, `bind`, `agents`, `whoami`, `ops`, `check`, `research`, `extract`, `monitor`, `switch`, `leave`) | Same Lucid-owned layer | N/A |
| Explicit hosted bind | Yes (`bind` / `bind <agent name>`) | Same Lucid-owned layer | N/A |
| Attachment metadata preservation | Yes (`teams_attachments`, `teams_audio_input`) | N/A | Partial |

Notes:
- Hosted Teams no longer claims the first conversation implicitly.
- Install creates an unbound tenant install; the target conversation must bind explicitly.
- Hosted Teams now supports tenant defaults plus per-conversation overrides through the shared alias/default architecture.

## WhatsApp

| Capability | Control plane / Meta Cloud API | Managed relay boundary | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | No |
| Managed outbound delivery | Yes | Yes | No |
| Media-aware inbound webhook | Yes | N/A | No |
| Audio / voice-note transcription | Yes | N/A | No |
| Hosted chat commands | Yes (`help`, `agents`, `whoami`, `voice`, `ops`, `check`, `research`, `extract`, `monitor`, `switch`, `leave`) | Same Lucid-owned layer | N/A |
| Voice mode controls | Yes (`voice off`, `voice auto`, `voice always`, `voice set <voice>`) | Same Lucid-owned layer | N/A |
| Voice replies | Yes | Yes | No |
| Hosted connect-link bootstrap | Yes | Same Lucid-owned layer | N/A |
| Surface default for new chats | Yes | Same Lucid-owned layer | N/A |
| Per-chat default override | Yes | Same Lucid-owned layer | N/A |
| Manual BYOB webhook handoff | Yes | N/A | N/A |
| Meta Embedded Signup bootstrap | Partial (feature-gated) | N/A | N/A |

Notes:
- WhatsApp now follows the same managed relay/shim boundary as the other server-delivered channels.
- The actual transport remains the official Meta Cloud API implementation, not an OpenClaw runtime sender.
- Hosted WhatsApp now exposes a Lucid-owned connect-link flow plus a manager for chat-owner, alias, and hosted-surface defaults.
- BYOB WhatsApp still supports the manual webhook/credential path, and Lucid now layers Meta Embedded Signup on top as a feature-gated provisioning path instead of replacing manual setup.
- `FEATURE_WHATSAPP_HOSTED` gates hosted connect-link generation. `FEATURE_WHATSAPP_EMBEDDED_SIGNUP` plus the `WHATSAPP_EMBEDDED_SIGNUP_*` envs gate Meta Embedded Signup.
- when no explicit Telegram / WhatsApp / Discord voice mode override exists, the runtime now resolves the default to `auto`

## iMessage

| Capability | BYOB / control plane | Hosted provider plane | C2a native |
|---|---|---|---|
| Text messages | Yes | Yes | No |
| Reply threading | Yes | Yes | No |
| Attachment-aware inbound notes | Yes | Yes | No |
| Hosted surface default | N/A | Yes | N/A |
| Hosted per-chat override | N/A | Yes | N/A |
| Hosted alias routing | N/A | Yes | N/A |
| Hosted Agent Ops commands | N/A | Yes (`ops`, `check`, `research`, `extract`, `monitor`) | N/A |
| Provider heartbeat / health | N/A | Yes | N/A |
| Provider dispatch queue | N/A | Yes | N/A |

Notes:
- BYOB iMessage uses Lucid's normalized webhook plus the `imsg` sender path.
- Hosted iMessage keeps routing, aliases, defaults, and admin UX on the Lucid control plane.
- The actual Apple transport is owned by a provider node that claims dispatches and sends through `@lucid/openclaw-runtime`.

## Shared outbound architecture

Across Telegram, Discord, Slack, WhatsApp, Teams, and iMessage, the worker now uses the same structural split:
- shared processor for lifecycle, retry, state transitions, and auth resolution
- channel bridge outbound helper for transport-specific orchestration

Current bridge-owned outbound orchestrators:
- `worker/src/channels/bridge/telegram/outbound-delivery.ts`
- `worker/src/channels/bridge/discord/outbound-delivery.ts`
- `worker/src/channels/bridge/slack/outbound-delivery.ts`
- `worker/src/channels/bridge/whatsapp/outbound-delivery.ts`
- `worker/src/channels/bridge/msteams/outbound-delivery.ts`
- `worker/src/channels/bridge/imessage/outbound-delivery.ts`

This is the preferred shape for future channels as well:
- shared core behavior
- thin adapter-specific transport and presentation layers

## Web

| Capability | Status |
|---|---|
| Internal first-party chat | Yes |
| Managed outbound shim | N/A |

## Related docs

- `docs/platform/agents/channels.md`
- `docs/channels/cutover-procedure.md`
- `docs/platform/integrations/telegram.md`
- `docs/platform/integrations/discord.md`
- `docs/platform/integrations/slack.md`
- `docs/platform/integrations/teams.md`
- `docs/platform/integrations/whatsapp.md`
- `docs/platform/integrations/imessage.md`
