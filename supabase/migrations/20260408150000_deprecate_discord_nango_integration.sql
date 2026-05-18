-- Migration: Deprecate Nango Discord integration from catalog (v1a of Discord plan)
--
-- Background
-- ----------
-- The Nango-backed 'discord' plugin_catalog entry (seeded in
-- 20260329400001_seed_tier2_plugin_catalog.sql) exposes 5 read-only actions
-- via user OAuth: list_guilds, list_channels, get_guild_info, list_members,
-- send_message. It cannot invite bots, cannot DM, and cannot deliver messaging
-- parity with Telegram. See docs/plans/2026-04-08-discord-byob-and-shared-bot.md.
--
-- Decision (2026-04-08): hide from the catalog but DO NOT delete the row or
-- revoke existing installations. The underlying Discord application (owned by
-- Lucid via our self-hosted Nango) is scheduled to be repurposed as the hosted
-- Lucid bot in v2a — see §OAuth App Identity in the plan doc.
--
-- What this migration does
-- ------------------------
-- 1. Sets `is_published = false` on the 'discord' row so catalog listing
--    endpoints in src/lib/db/plugins.ts (which filter on is_published=true)
--    stop surfacing it to new orgs.
-- 2. Leaves existing `org_plugin_installations` and
--    `assistant_plugin_activations` rows untouched — orgs that already
--    installed keep working until they remove it manually.
-- 3. Does NOT touch the native Discord channel (BYOB) path. That flows
--    through `assistant_channels`, not `plugin_catalog`, and is unrelated.
--
-- What this migration does NOT do
-- -------------------------------
-- - Does not delete the `discord` plugin_catalog row
-- - Does not delete the Discord developer application (intentionally preserved
--   for v2a reuse as DISCORD_HOSTED_*)
-- - Does not change the Nango provider_config_key mapping
-- - Does not affect the raw-WS `DiscordGatewayManager` on shared worker

UPDATE plugin_catalog
SET is_published = false
WHERE slug = 'discord'
  AND kind = 'integration'
  AND auth_provider = 'discord';
