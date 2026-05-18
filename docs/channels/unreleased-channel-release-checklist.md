# Unreleased Channel Release Checklist

WhatsApp, Microsoft Teams, and iMessage have code-level channel support in this repository, but they are not considered released in production until a real provider surface is bound, commands are enabled, and a live smoke passes against Mission Control.

Use this checklist for each channel before marking it released.

## Release Gate

A channel is released only when all of these are true:

- A production `assistant_channels` row or provider-surface binding exists for the target assistant/workspace.
- Required provider credentials are present in production secrets.
- Webhooks or provider callback URLs are installed in the third-party app/provider console.
- Channel-native commands include the shared Agent Ops and Knowledge commands.
- `check https://www.lucid.foundation` creates exactly one Mission Control run.
- `claims semantic claim governance smoke` returns the same Knowledge claim visible from Web/Slack/Telegram/Discord.
- `remember <fact>` creates a scoped Knowledge claim with channel provenance.
- `forget <claim-id>` archives that claim and the archived state is visible in Mission Control.
- Mission Control run detail shows `metadata.team_ops.channelLaunchStatus.<channel>`.
- Logs show no auth failures, duplicate runs, entitlement fallback warnings, RLS errors, memory extraction failures, or delivery failures during the smoke window.

## WhatsApp

Required setup:

- Create or confirm the production WhatsApp hosted surface/provider binding.
- Confirm Meta Cloud API token, phone number id, business account id, webhook verify token, and app secret.
- Confirm webhook subscription receives messages and media events.
- Confirm hosted commands: `help`, `agents`, `whoami`, `voice`, `ops`, `check`, `research`, `extract`, `monitor`, `switch`, `leave`, `remember`, `claims`, `forget`.
- Run: `check https://www.lucid.foundation`.
- Run: `claims semantic claim governance smoke`.
- Run a remember/forget pair using a disposable claim.

Production release evidence to capture:

- WhatsApp message id.
- Mission Control run id.
- Channel launch status row.
- Worker/control-plane log window.

## Microsoft Teams

Required setup:

- Create or confirm the production Teams tenant install and conversation binding.
- Confirm bot app id/password, service URL persistence, and JWT validation.
- Confirm hosted commands: `help`, `bind`, `agents`, `whoami`, `ops`, `check`, `research`, `extract`, `monitor`, `switch`, `leave`, `remember`, `claims`, `forget`.
- Run: `check https://www.lucid.foundation`.
- Run: `claims semantic claim governance smoke`.
- Run a remember/forget pair using a disposable claim.

Production release evidence to capture:

- Teams activity id.
- Tenant/conversation binding id.
- Mission Control run id.
- Worker/control-plane log window.

## iMessage

Required setup:

- Create or confirm the hosted provider node and surface default.
- Confirm provider heartbeat is healthy.
- Confirm dispatch queue claims and delivery acknowledgements are being written.
- Confirm hosted commands: `ops`, `check`, `research`, `extract`, `monitor`, `remember`, `claims`, `forget`.
- Run: `check https://www.lucid.foundation`.
- Run: `claims semantic claim governance smoke`.
- Run a remember/forget pair using a disposable claim.

Production release evidence to capture:

- Provider dispatch id.
- iMessage conversation/surface id.
- Mission Control run id.
- Provider heartbeat and worker log window.

## Current Production Status

As of 2026-05-08, production has active Slack, Telegram, and Discord bindings. WhatsApp, Teams, and iMessage are not released until the checklist above is completed against real production bindings.
