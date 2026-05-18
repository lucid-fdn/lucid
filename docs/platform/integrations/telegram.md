# Telegram Integration

For the canonical channel architecture, see `docs/platform/agents/channels.md`.

This document is the operator-facing Telegram setup guide for Lucid today.

## Two Telegram Modes

Lucid currently supports two Telegram modes:

- `BYOB` — tenant-owned bot token, traditional Telegram channel row
- `Hosted multi-agent` — Lucid-owned shared bot with one chat bound to one or more assistants

Choose the mode deliberately. They are different products, not just different forms.

## BYOB Telegram

Use BYOB when the tenant wants its own Telegram bot identity.

### Setup

1. Open Telegram and create a bot with `@BotFather`.
2. Copy the bot token.
3. In Studio, go to the assistant's `Channels` tab.
4. Add a Telegram channel in `BYOB` mode.
5. Paste the bot token and save.

Lucid configures the webhook automatically.

### BYOB behavior

- One assistant per Telegram bot/channel row
- Standard Telegram webhook ingestion
- Replies delivered through Lucid channel delivery
- Group chat behavior depends on routing config for that channel row

## Hosted Telegram Multi-Agent

Use hosted Telegram when Lucid should own the shared bot identity and the chat should be able to move between multiple assistants.

### What hosted Telegram does

Hosted Telegram supports:
- deep-link binding from Studio or public share links
- multiple assistants bound to one private Telegram chat
- explicit primary-speaker switching
- button-first switching and discovery UX
- entity-style onboarding and reply controls
- a Mini App control surface exposed as the Telegram menu button

Hosted Telegram is private-chat focused. The multi-agent command surface is intentionally not exposed in group chats.

### Hosted routing and defaults

Hosted Telegram now has a full Studio-side admin surface as well:
- chat default ownership
- alias management
- current chat roster and default labels

That means the Telegram user experience can stay button-first and chat-native while Studio still exposes the same shared ownership/admin model used across the other hosted channels.

### Hosted commands

The hosted bot supports these fallback commands:
- `/agents`
- `/switch`
- `/whoami`
- `/ops`
- `/check`
- `/buy`
- `/research`
- `/extract`
- `/monitor`
- `/leave`
- `/help`

Normal usage should be button-first:
- `Talk Here`
- `Meet Other Agents`
- `Switch Agent`
- `Meet Others`
- `Help`

Agent Ops and Browser Operator command examples:

- `/ops qa https://preview.example.com`
- `/check https://www.example.com`
- `/buy weekly groceries under $120 from Carrefour`
- `/research https://competitor.example.com`
- `/extract pricing from https://www.example.com/pricing`
- `/monitor https://status.example.com`

Telegram command setup:

- The hosted bot command menu is generated from `src/lib/telegram/bot-commands.ts`.
- Run the hosted Telegram surface sync after deploy so BotFather-visible commands include `/ops`, `/check`, `/buy`, `/research`, `/extract`, and `/monitor`.
- No separate runtime implementation is needed; those commands all call the shared Agent Ops channel launcher.

### Control Room

The Telegram menu button opens Lucid's `Control Room`, not a generic website page.

Current job of the Control Room:
- show a clear operational home for the current Telegram chat
- expose fast room actions like active-agent lookup, agent roster, workspace panel, and help
- provide direct named controls for `Switch Agent` and `Switch Workspace`
- keep the actual conversation in Telegram while moving state changes into a cleaner UI surface

Product rule:
- the menu button is a control surface
- it should not regress into a generic marketing or website shortcut

### Hosted onboarding

When a user opens a hosted deep link, Telegram shows an entity-style onboarding card rather than a raw command dump.

Example shape:
- `You've entered Closer's room.`
- role title
- one-line essence
- buttons to start chatting or meet other agents

### Hosted reply UX

Hosted Telegram assistant replies include:
- a lightweight signature like `Closer • Lucid`
- inline controls:
  - `Switch Agent`
  - `Meet Others`
  - `Help`

The routing and panel UX live on the control plane. The actual assistant reply still ships through the worker's OpenClaw-backed Telegram bridge.

## Voice Notes And Media

Lucid's Telegram ingress is media-aware.

Supported inbound handling:
- photos and static stickers can be surfaced to the agent as visual context
- documents are surfaced as attachment context
- voice notes and audio files go through the speech-to-text provider policy before the inbound event is stored

### STT provider policy

Telegram voice-note transcription is provider-agnostic and now runs through Lucid's shared media-transcription layer.

- `STT_PROVIDER=auto` is the default
- in `auto`, Lucid prefers TrustGate first
- if TrustGate is unavailable for transcription, Lucid falls through to configured direct providers
- supported explicit providers:
  - `trustgate`
  - `openai`
  - `groq`
  - `deepgram`
  - `mistral`

Operator rule:
- easiest setup: use TrustGate
- no lock-in: set an explicit provider and key to bypass TrustGate entirely

Architecture rule:
- Telegram still owns Telegram-specific extraction, file lookup, and ingress text assembly
- provider selection, filename normalization, and STT fallback policy live in shared media helpers
- future channels should reuse the same media-transcription contract instead of creating new channel-local provider stacks

See [docs/ENV_REFERENCE.md](../../ENV_REFERENCE.md#telegram-voice-note-transcription) for the full env reference.

## Telegram Persona Configuration

Hosted Telegram now supports explicit assistant-level persona fields on `ai_assistants`:

- `telegram_display_name`
- `telegram_role_title`
- `telegram_essence`
- `telegram_starter_prompts`

These are optional overrides used for:
- onboarding copy
- `/agents`
- `/whoami`
- switch confirmations
- future Telegram-specific starter prompt UX

Fallback behavior:
- if explicit Telegram persona fields are set, hosted Telegram uses them
- otherwise Lucid falls back to assistant `name` and `description`

This means existing assistants continue to work, but production Telegram personas should be curated explicitly.

## User Identification

Each Telegram user gets a scoped identity:

- `telegram:<telegram_user_id>`

This means:
- memories are per Telegram user
- conversations are scoped per channel/user identity
- data does not mix across Telegram users

## Troubleshooting

| Issue | What to check |
|-------|---------------|
| Hosted bot not responding | `TELEGRAM_HOSTED_BOT_TOKEN`, `TELEGRAM_HOSTED_WEBHOOK_SECRET`, and webhook reachability |
| BYOB bot not responding | bot token correctness and webhook setup |
| Hosted deep link binds but reply UX looks old | app deploy may be behind current hosted Telegram code |
| No assistant is answering | the chat may have bindings but no primary; use `/agents` or inline controls |
| Group chat command flow missing | expected; hosted multi-agent UX is private-chat only |
| Voice note says transcription is unavailable | configure `STT_PROVIDER` and at least one compatible backend, or expose TrustGate `/v1/audio/transcriptions` |
