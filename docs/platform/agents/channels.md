# Agent Channels

This document is the canonical current-state reference for Lucid's channel architecture.

Use this doc for:
- how channel bindings are modeled
- how inbound and outbound delivery work
- how hosted, BYOB, relay, native, managed-shim, and provider-node paths fit together
- how hosted multi-agent routing, aliases, defaults, and chat-level overrides work across channels

Use the docs under `docs/plans/` as implementation history and rollout context, not as the current source of truth.

Tooling note:

- channel architecture and tool-schema architecture are separate concerns
- channel mode decides routing, transport ownership, and secret boundaries
- tool manifests are still prepared through the same canonical manifest pipeline used by shared, dedicated, and BYO runtimes
- engine choice does not create a separate tool schema contract

See `docs/platform/plugins/tool-manifests.md` for the current tool-manifest lifecycle.

## Core Model

The canonical assistant-to-channel binding lives in `assistant_channels`.

Each row represents one assistant bound to one channel surface and carries:
- `channel_type` such as `telegram`, `discord`, `whatsapp`, `slack`, `msteams`, or `web`
- `external_channel_id` such as a Telegram chat id, Discord guild or channel id, or Teams conversation id
- `connection_mode` of `byob` or `hosted`
- `inbound_routing_config` for mention, prefix, dedicated-channel, thread, and bot-ignore behavior
- `is_active` to enable or disable delivery
- `is_primary` for hosted multi-agent Telegram and Discord routing

Shared hosted routing metadata lives alongside those bindings:
- `assistant_channel_aliases` stores surface-scoped aliases such as `sales` or `marketing`
- `channel_surface_defaults` stores the fallback assistant for a hosted surface when no chat-specific override exists
- hosted iMessage provider-plane state lives in `channel_provider_nodes`, `channel_provider_surfaces`, and `channel_provider_dispatches`

Lucid's channel system is the primary architecture. The OpenClaw wrapper is a second layer used only for some outbound send paths.

Important UI rule:
- `web` is a valid internal first-party transport row in `assistant_channels`
- it exists so Lucid web chat, and future first-party app/mobile chat, can use the same transport and conversation model as other channels
- it is not treated as a user-managed external integration
- user-facing connected-channel UI should hide raw `web` rows and only show externally managed channels such as Telegram, WhatsApp, Slack, Discord, Teams, and iMessage
- iMessage is a first-class Lucid product channel in both BYOB and hosted modes; the hosted mode uses the same shared routing/admin architecture as the other hosted channels, with a provider-node transport layer behind the scenes

## The Two Layers

### Layer 1: Lucid channel architecture

Lucid owns:
- channel CRUD and persistence
- hosted vs BYOB semantics
- inbound webhook handlers
- multi-agent hosted routing and primary-speaker selection
- dedicated runtime mode selection (`relay` vs `native`)
- event storage in `assistant_inbound_events` and `assistant_outbound_events`

### Layer 2: OpenClaw outbound wrapper

OpenClaw is used as a managed outbound transport shim for selected channels.

It does not replace:
- `assistant_channels`
- hosted Telegram routing
- hosted Discord OAuth install and slash-command flows
- runtime channel-mode logic

Today the managed shim lives in `src/lib/channels/openclaw-shim/` and is used by control-plane outbound delivery for Discord, Telegram, Slack, and Teams when the corresponding feature flag is enabled.

Hosted iMessage uses the same Lucid routing/admin model as the other hosted channels, but its transport boundary is different:
- Lucid owns the control plane, aliases, defaults, and admin UX
- a managed provider node owns the Apple/iMessage transport
- the shared worker enqueues provider dispatches instead of calling the iMessage sender directly in hosted mode

## Execution Modes

### Shared worker

Inbound arrives on the control plane, is stored as an inbound event, the shared worker processes it, and outbound delivery happens on the control plane.

### Dedicated runtime, C1 relay

The dedicated runtime runs the agent loop but does not own channel delivery. It claims bounded `RunPacket`s over REST and returns the final response to the control plane, which then decrypts secrets and delivers outbound.

Canonical relay completion contract:
- `POST /api/runtimes/messages/complete-inbound` is the shared completion path for all dedicated relay channels
- true missing events return `404`
- ownership mismatches return `403`
- DB/query/schema failures return `500` and are logged as internal data-access errors
- completion resolves conversations via the canonical `get_or_create_conversation(p_assistant_id, p_channel_id, p_external_user_id, p_external_chat_id)` RPC
- runtime cost aggregation writes canonical `mc_agent_cost_tracking.tokens_input` / `tokens_output`

Important boundary:
- relay completion does not rely on `assistant_inbound_events.conversation_id`
- conversation linkage is resolved through `assistant_conversations`
- channel senders are downstream of completion; DB/schema failures must not be misclassified as channel failures

### Dedicated runtime, C2a native

The dedicated runtime owns the channel transport directly. Native adapters receive inbound messages in-process and send replies in-process, while mirroring events and channel status back to the control plane.

## Inbound Flow

The common shape is:

```text
User message
  -> channel-specific webhook or native adapter
  -> normalize to inbound event or native callback
  -> run agent
  -> persist or mirror output
  -> deliver reply on the same channel
```

Control-plane webhook handlers exist for:
- Telegram BYOB
- Telegram hosted multi-agent
- Discord hosted interactions
- WhatsApp
- Teams
- iMessage BYOB
- iMessage hosted provider ingress

Slack inbound for shared workers is handled by a worker-side multi-tenant Socket Mode manager rather than a control-plane webhook.

For hosted Slack on the shared worker:
- inbound rows are persisted first, then handed to Pulse immediately from the Slack gateway
- the 👀 ack reaction is best-effort UX and does not define correctness
- the shared worker can repair a recent `done` Slack or Discord inbound that still has no outbound row, but that repair path is a fallback rather than the primary success contract

## Outbound Flow

Outbound delivery for shared workers and C1 relay is controlled by `src/lib/db/outbound-delivery.ts`.

That layer:
- loads the `assistant_channels` row
- decrypts secrets when needed
- injects the hosted Telegram token for hosted Telegram rows
- routes to either the legacy sender or the OpenClaw managed shim

Managed outbound shims are transport swaps only. They do not change the Lucid-side channel model.

### Shared worker outbound boundary

Inside the worker, outbound delivery now follows a channel-adapter boundary rather than keeping per-channel orchestration inline in the processor.

Shared worker core owns:
- lifecycle and lease management
- outbound row state transitions
- secret decryption
- hosted vs BYOB auth resolution
- shared voice/media preparation
- failure classification and retry semantics

Bridge-owned outbound helpers own channel transport orchestration:
- `worker/src/channels/bridge/telegram/outbound-delivery.ts`
- `worker/src/channels/bridge/discord/outbound-delivery.ts`
- `worker/src/channels/bridge/slack/outbound-delivery.ts`
- `worker/src/channels/bridge/whatsapp/outbound-delivery.ts`
- `worker/src/channels/bridge/msteams/outbound-delivery.ts`
- `worker/src/channels/bridge/imessage/outbound-delivery.ts`

That means:
- the processor decides `when` an outbound should be attempted
- the bridge helper decides `how` that specific channel sends, chunks, replies, decorates, or falls back

This is the architectural template for additional WhatsApp surfaces and future transport-backed channels that follow the same shared-worker boundary:
- shared core for lifecycle and policy
- thin channel adapters for transport and presentation

## Hosted vs BYOB

### Hosted

Hosted means Lucid owns the shared bot surface and routing layer. This is used today for:
- hosted Telegram multi-agent routing
- hosted Discord shared-bot install and slash-command UX
- hosted Slack shared-app workspace install plus explicit DM/channel bind
- hosted WhatsApp shared-number routing with chat defaults, aliases, and surface defaults
- hosted Teams shared-app tenant install with explicit bind plus tenant defaults
- hosted iMessage shared control plane with a provider-node transport layer

Hosted Discord install is a single privileged action:
- owner/admin clicks `Install on Discord`
- Lucid runs OAuth and binds the guild
- active-agent, voice, and model management happen inside Discord with slash commands and components
- there is no separate publish/share toggle in the Studio flow

Hosted Teams install is also a single privileged action:
- owner/admin clicks `Install on Microsoft Teams`
- Lucid runs the hosted consent flow
- there is no separate publish/share toggle in the Studio flow
- install creates an unbound Teams install for the tenant
- the target Teams conversation must run `bind` or `bind <agent name>` explicitly
- once bound, the Teams conversation itself exposes `help`, `agents`, `whoami`, `switch <agent name>`, and `leave`

Hosted Slack install is also workspace-first and bind-second:
- owner/admin clicks `Install on Slack`
- Lucid runs OAuth and stores the workspace install
- Slack App Home or `/lucid bind` selects the final DM or channel
- Agent Ops and Browser Operator launch through `/lucid ops ...` or direct `/lucid check|research|extract|monitor ...` arguments
- top-level Slack messages are answered back in the main channel
- threaded Slack messages stay in-thread

Hosted Telegram and Discord use atomic DB RPCs to bind and switch the primary assistant for a chat or guild. Hosted WhatsApp, Teams, Slack, and iMessage reuse the shared alias/default resolver plus chat-level or surface-level defaults depending on the transport.

### Channel-native Agent Ops commands

Agent Ops channel launch is shared. Channel handlers normalize native command text, call the same Agent Ops launcher, and report the same `metadata.team_ops` projection back to the user.

Browser Operator shortcuts are supported where the channel transport supports commands:

- Slack: `/lucid check <url>`, `/lucid buy <request>`, `/lucid research <url>`, `/lucid extract <what> from <url>`, `/lucid monitor <url>`
- Telegram: `/check <url>`, `/buy <request>`, `/research <url>`, `/extract <what> from <url>`, `/monitor <url>`
- WhatsApp, Teams, and iMessage: `check <url>`, `buy <request>`, `research <url>`, `extract <what> from <url>`, `monitor <url>` as plain text
- Discord: slash-command Agent Ops launch remains the native route; command choices come from the shared Agent Ops workflow registry

Slack only needs the `/lucid` slash command registered. Telegram needs the hosted bot command menu synced. WhatsApp, Teams, and iMessage do not require third-party command registration for these text commands.

### Hosted Telegram UX

Hosted Telegram is not just a shared bot token. It has its own control-plane UX layer.

The hosted Telegram webhook owns:
- `/start` deep-link onboarding
- `/agents`, `/switch`, `/whoami`, `/leave`, and `/help`
- inline keyboard callbacks for switching and discovery
- "no primary" recovery
- multi-agent persona presentation

The worker owns the actual assistant reply delivery. Hosted Telegram replies are still delivered through the existing OpenClaw-backed worker bridge, but the final Telegram message now carries:
- a lightweight entity signature such as `Closer • Lucid`
- inline reply controls:
  - `Switch Agent`
  - `Meet Others`
  - `Help`

This keeps control-plane routing and worker delivery separated cleanly:
- control plane decides who should speak and which UX panel to show
- worker delivers the actual assistant response on the active binding

### Hosted Telegram persona fields

Telegram now supports explicit assistant-level persona overrides on `ai_assistants`:
- `telegram_display_name`
- `telegram_role_title`
- `telegram_essence`
- `telegram_starter_prompts`

These are optional channel-facing overrides for the hosted Telegram UX.

Resolution order is:
1. explicit Telegram persona fields on the assistant
2. fallback to assistant `name` / `description`

This means existing assistants continue to work without migration-time backfills, while production Telegram personas can now be curated explicitly instead of relying on heuristics.

### BYOB

BYOB means the tenant provides credentials such as bot tokens or app credentials.

BYOB channels may run:
- on the control plane via webhook + outbound sender
- in a dedicated runtime via relay mode
- in a dedicated runtime via native mode, depending on channel support

## Per-Channel Status

| Channel | Inbound | Outbound | Hosted Routing Model | Native Dedicated Adapter |
|---------|---------|----------|----------------------|--------------------------|
| Telegram | Control-plane webhook | Legacy or managed shim | Multi-agent private-chat routing with commands, Agent Ops shortcuts, buttons, and Mini App | Deferred |
| Discord | Hosted interactions or worker gateway/native adapter depending on mode | Legacy or managed shim | Shared-bot guild default + slash-command switching + guild overrides | Yes |
| WhatsApp | Control-plane webhook | Managed shim or legacy fallback | Hosted-number surface default + per-chat default + chat commands + Agent Ops shortcuts | No |
| Slack | Worker Socket Mode manager | Legacy or managed shim | Workspace default + explicit conversation bind + per-channel overrides + `/lucid` Agent Ops shortcuts | Yes |
| Teams | Control-plane webhook | Legacy or managed shim | Tenant default + explicit bind + per-conversation overrides + Agent Ops shortcuts | Yes |
| iMessage | BYOB webhook or hosted provider ingress | BYOB bridge or hosted provider dispatch | Hosted surface default + per-chat overrides + provider-node transport + Agent Ops shortcuts | No |
| Web | App/web chat path | Internal web delivery | Internal first-party only | N/A |

Notes:
- Telegram C2a native is deferred.
- Hosted Telegram is private-chat multi-agent UX. Group chats do not expose the hosted multi-agent command surface.
- Discord, Slack, and Teams have dedicated native adapters registered in the worker.
- Slack hosted/shared-worker replies preserve top-level vs threaded placement: normal channel messages answer in-channel; messages with `thread_ts` answer in that thread.
- WhatsApp now uses the same managed relay/shim boundary on the control plane as the other server-delivered channels, but the implementation stays on the official Meta Cloud API path rather than the OpenClaw runtime package.
- Hosted WhatsApp now has chat-native controls for `help`, `agents`, `whoami`, `voice`, `switch <agent name>`, and `leave`.
- Hosted Teams now has tenant-level defaults plus explicit bind, `agents`, `whoami`, `switch`, and `leave`.
- Hosted iMessage is a real product channel. BYOB mode uses a normalized Lucid webhook, while hosted mode uses Lucid-managed provider surfaces and provider dispatch queues.
- Web is an internal first-party surface, not a user-connected channel entry in the management UI.
- for Telegram, WhatsApp, and Discord, a missing explicit voice-mode override now resolves to `auto` rather than `off`; explicit `off` still wins

## Current Invariants

- `assistant_channels` is the source of truth for agent-to-channel bindings.
- Hosted Telegram and hosted Discord primary selection is explicit and atomic.
- C1 relay keeps channel secrets on the control plane.
- C2a native moves channel credentials and transport ownership to the runtime.
- OpenClaw managed shims affect outbound send implementation, not channel ownership semantics.

## User Scoping

Users are scoped per channel and external user id, for example `telegram:12345678` or `discord:99887766`.

This means:
- memories are per-user and per-channel
- conversation history does not mix across channels
- one assistant can serve many users across many channels without cross-contamination

## Related Docs

- `docs/platform/integrations/telegram.md` — operator-facing Telegram setup notes
- `docs/platform/integrations/discord.md` — operator-facing Discord setup notes
- `docs/platform/integrations/slack.md` — operator-facing Slack setup notes
- `docs/platform/integrations/teams.md` — operator-facing Teams setup notes
- `docs/platform/integrations/whatsapp.md` — operator-facing WhatsApp setup notes
- `docs/platform/integrations/imessage.md` — operator-facing iMessage setup notes
- `docs/platform/mission-control/dedicated-runtimes.md` — runtime operations overview
- `docs/channels/support-matrix.md` — outbound managed-shim capability matrix and implementation status
- `docs/channels/cutover-procedure.md` — managed-shim cutover runbook
