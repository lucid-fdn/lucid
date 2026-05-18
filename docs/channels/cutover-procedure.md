# OpenClaw Channel Managed Shim — Cutover Procedure

Current-state channel architecture lives in `docs/platform/agents/channels.md`. This document is the operator runbook for the OpenClaw-managed outbound shim only.

**Status**: Phases 0–3 shipped (2026-04-08). All managed shim flags default **on** as of 2026-04-10. Legacy senders still exist as rollback fallback; post-cutover cleanup has not been completed yet.

**Related**: `docs/channels/support-matrix.md`, `docs/plans/2026-04-08-openclaw-channel-unification-plan.md`

## What this procedure does

Routes outbound Discord, Telegram, and/or Teams delivery from the hand-rolled REST sender in `src/lib/db/outbound-delivery.ts` onto the `@lucid/openclaw-runtime` managed shim in `src/lib/channels/openclaw-shim/`. No DB migrations. No schema changes. Reversible via an env-var flip + redeploy.

This procedure does **not** change:
- hosted Telegram multi-agent routing
- hosted Telegram onboarding / inline control UX
- hosted Discord install + command UX
- channel binding semantics in `assistant_channels`

## Prerequisites

- `@lucid/openclaw-runtime` is in `next.config.mjs` `serverExternalPackages` (already shipped).
- Phase 1–3 code is deployed to production (shim files, flag-gated switch cases in `outbound-delivery.ts`, `FEATURES.openclawChannelsDiscordManaged` / `openclawChannelsTelegramManaged` / `openclawChannelsTeamsManaged` in `src/lib/features.ts`).
- If any env var explicitly disables a managed shim flag, the corresponding channel falls back to the legacy sender.

## Recommended rollout order

Stagger Discord → Telegram → Teams. One channel at a time, one hour of observation per step.

### Step 1 — Enable Discord managed shim (Vercel production)

```bash
vercel env add FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED production
# Value: true
vercel --prod
```

### Step 2 — Verify Discord delivery

1. Send a test message through any active Discord channel.
2. Confirm in `outbound_deliveries`:
   - `delivered_at` is stamped
   - `external_message_id` is populated (not `'unknown'`, not null unless the shim explicitly mapped `unknown` → null)
3. Watch `outbound_deliveries.error_kind` for one hour. Any of these indicate a permanent failure surfaced by the shim classifier:
   - `auth_revoked` — 401/403 or `DiscordSendError.kind = 'missing-permissions'`
   - `missing_permissions`
   - `dm_blocked`
   - `channel_gone` — 404

Transient errors (network, rate limits) are re-thrown unchanged and handled by the existing retry layer.

### Step 3 — Enable Telegram managed shim

Only after Discord is stable (~1 hour green).

```bash
vercel env add FEATURE_OPENCLAW_CHANNELS_TELEGRAM_MANAGED production
# Value: true
vercel --prod
```

### Step 4 — Verify Telegram delivery

Same verification as Discord. Grammy error shapes mapped to `PermanentChannelError`:
- `error_code=401` → `auth_revoked`
- `error_code=403` → `dm_blocked`
- `error_code=400` + description matches `chat not found` → `channel_gone`

Multi-chunk messages (>4096 chars) still use Lucid's `splitTelegramMessage` helper — the shim preserves first-chunk-replies and rest-thread-under-first behaviour, so flag flips are byte-equivalent to the legacy sender.

### Step 5 — Enable Teams managed shim

Only after Telegram is stable (~1 hour green).

```bash
vercel env add FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED production
# Value: true
vercel --prod
```

### Step 6 — Verify Teams delivery

Same verification as Discord/Telegram. Teams Bot Framework error shapes mapped to `PermanentChannelError` via `classifyTeamsError`:
- `401/403` → `auth_revoked`
- `404` (conversation not found) → `channel_gone`
- `BotNotInConversationRoster` → `missing_permissions`
- `429` → transient (retry)
- `5xx` → transient (retry)

ServiceUrl fallback chain: `secrets.service_url` → `channelConfig.teams_service_url` → default `https://smba.trafficmanager.net/teams`. JWT validation uses `jose` against Microsoft's JWKS with automatic key rotation retry.

## Rollback

At any point:

```bash
vercel env rm FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED production
# (or set to false)
vercel --prod
```

The switch cases in `outbound-delivery.ts` fall back to `sendDiscord` / `sendTelegram` (the legacy REST senders) on the next request. No data migration, no cleanup, no schema rollback.

## Observability

- **Logs**: shim re-throws errors unchanged except for `PermanentChannelError` wrapping. Existing outbound-delivery error logging captures both paths identically.
- **No new metrics layer**: deliberate — the shim path matches the legacy sender's surface so existing dashboards apply.
- **Runtime init**: `setRuntimeConfigSnapshot({})` is called exactly once across both shims (cached at module level in `shared/runtime.ts`). A single log line per worker process confirms first-touch.

## Known constraints

- **Chunking stays in the shim.** The Telegram shim reuses Lucid's `splitTelegramMessage` rather than delegating to OpenClaw's internal chunker. This is deliberate — it makes the shim byte-equivalent to the legacy sender so a flag flip is a clean swap. If OpenClaw's chunker is preferred later, that's a separate decision.
- **Error classification is shape-based, not `instanceof`.** `@lucid/openclaw-runtime` is compiled via tsup, which loses class identity across the package boundary. `classifyDiscordError` / `classifyTelegramError` match on `name` + `kind` + `error_code` fields rather than class identity.
- **Slack is covered and WhatsApp is partially covered.** Slack runs through the managed shim path. WhatsApp now runs through the same managed relay/shim boundary on the control plane, but its adapter still talks directly to the official Meta Cloud API because `@lucid/openclaw-runtime` does not export a Cloud API sender yet.
- **Teams JWT validation is separate from the shim flag.** JWT validation in the webhook handler (`src/lib/channels/msteams/jwt-validator.ts`) is always active — it's not gated by the managed shim flag. The shim flag only controls whether outbound delivery routes through the OpenClaw sender vs the direct Bot Framework REST sender.

## Post-cutover (after one stable release cycle)

Once both flags have been on in production for a full release cycle with zero delivery regressions:
1. Delete the legacy `sendDiscord` / `sendTelegram` / `sendTeams` branches in `outbound-delivery.ts`.
2. Delete `FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED`, `FEATURE_OPENCLAW_CHANNELS_TELEGRAM_MANAGED`, `FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED`, and `FEATURE_OPENCLAW_CHANNELS_WHATSAPP_MANAGED` flags.
3. Inline the shim calls if the indirection no longer adds value.

See `docs/plans/2026-04-08-openclaw-channel-unification-plan.md` Phase 6 for the full legacy-retirement checklist.

As of 2026-04-10, those cleanup steps are still pending. Treat the legacy senders as live fallback, not dead code.
