# Channel Smoke Tests

This repo now has a dedicated channel smoke suite that exercises the hosted and worker routing paths with simulated inbound messages and outbound delivery behavior.

## What it covers

App-side smoke:
- Telegram hosted router + commands
- WhatsApp hosted commands
- WhatsApp hosted connect-link route validation
- WhatsApp BYOB admin route and Embedded Signup route coverage
- Discord hosted router + commands
- Teams hosted commands
- iMessage hosted commands
- iMessage BYOB webhook route
- iMessage connect/admin/alias routes
- Agent Ops / Browser Operator channel commands: `ops`, `check`, `research`, `extract`, and `monitor`
- Hosted webhook routes for Telegram, WhatsApp, Discord, Teams, and iMessage
- Admin/default/alias routes for Slack, Discord, Telegram, WhatsApp, Teams, and iMessage

Focused channel tests outside the bundled smoke command:
- hosted iMessage provider ingress logic
- hosted iMessage provider ingress logic not yet covered by a native macOS provider integration test

Worker-side smoke:
- Slack gateway routing
- Discord gateway routing
- Teams dynamic outbound reply targeting
- iMessage outbound provider dispatch
- Relay inbound engine handoff parity for OpenClaw and Hermes

## Commands

Run app-side channel smoke:

```bash
npm run test:channels:smoke
```

Run worker-side channel smoke:

```bash
npm --prefix worker run test:channels:smoke
```

Run the full simulated channel suite:

```bash
npm run test:channels:smoke:full
```

## Live Agent Ops canary commands

Use these commands for the shared Browser Operator page-check canary:

| Channel | Command |
|---|---|
| Slack | `/lucid check https://www.lucid.foundation` |
| Telegram | `/check https://www.lucid.foundation` |
| Discord | `/ops workflow:check-page target:https://www.lucid.foundation` |
| WhatsApp | `check https://www.lucid.foundation` |
| Teams | `check https://www.lucid.foundation` |
| iMessage | `check https://www.lucid.foundation` |

Release note:
- Slack, Telegram, Discord, and Web can be validated today in production when bindings exist.
- WhatsApp, Teams, and iMessage must use `docs/channels/unreleased-channel-release-checklist.md` before being marked released. Code-level smoke coverage is not the same as real production channel release.

Expected result:
- one Agent Ops run is created with workflow `check-page`
- Browser Operator evidence/session fields are visible in Mission Control when the run reaches evidence-producing steps
- `metadata.team_ops` includes dispatch tier, selected specialists, compatible runtimes, partial runtime warnings, and channel launch/report status
- the channel reply references the same run id visible in Mission Control

Latest verified live canary:
- 2026-05-07 Telegram `/check https://www.lucid.foundation` created run `09ba75cd-a121-491a-a423-f0786c3dc956`
- the Telegram bot sent the channel report successfully
- Mission Control backing data showed workflow `check-page`, status `completed`, Browser Operator session evidence, two expected run links, and `metadata.team_ops.channelLaunchStatus.telegram`
- Railway logs showed Browser Operator open/inspect/report artifacts for the run and no matching auth, fallback, duplicate-run, RLS, or projection errors in the scanned window

## What these tests simulate

- bound conversation routing
- unbound conversation fallback to workspace / tenant / surface default
- explicit targeting behavior
- alias conflict behavior
- dynamic outbound reply targeting back to the source conversation
- normalized run request parity across OpenClaw and Hermes
- shared Agent Ops channel-launch payloads for Browser Operator workflows

## What they do not prove

These are production-like simulations, not real third-party canary checks. They do not verify:

- live Slack workspace permissions
- live Discord gateway credentials
- live Telegram bot network delivery
- live WhatsApp sandbox / production number delivery
- live Meta Embedded Signup browser flow and code exchange
- live Microsoft Teams tenant auth outside mocked HTTP
- live iMessage provider-node delivery on a registered macOS surface
- real Agent Ops command registration in Slack or Telegram command menus

For true prod confidence, pair this suite with:
- hidden canary channels per platform
- scheduled synthetic probes
- staging workspaces / guilds / chats for real-bot delivery checks
- at least one human-triggered Slack slash command after Slack app command changes, because Slack command menus are configured in the Slack app dashboard rather than inferred from repo tests
