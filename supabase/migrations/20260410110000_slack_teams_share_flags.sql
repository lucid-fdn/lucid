-- Add share toggles for future hosted Slack and Teams channel installs.
-- Mirrors telegram_share_enabled / discord_share_enabled.

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS slack_share_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_assistants.slack_share_enabled IS
  'When true, the assistant may be installed via the shared Lucid Slack app once hosted Slack connect is enabled.';

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS msteams_share_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_assistants.msteams_share_enabled IS
  'When true, the assistant may be installed via the shared Lucid Microsoft Teams app once hosted Teams connect is enabled.';
