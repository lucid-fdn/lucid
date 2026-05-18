-- Explicit Telegram-facing persona fields for hosted multi-agent UX.
-- These are optional overrides. When null/empty, the app falls back to
-- assistant name/description heuristics for backward compatibility.

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS telegram_display_name TEXT,
  ADD COLUMN IF NOT EXISTS telegram_role_title TEXT,
  ADD COLUMN IF NOT EXISTS telegram_essence TEXT,
  ADD COLUMN IF NOT EXISTS telegram_starter_prompts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ai_assistants.telegram_display_name IS
  'Optional Telegram-facing display name override used for hosted entity UX.';

COMMENT ON COLUMN ai_assistants.telegram_role_title IS
  'Optional Telegram-facing role title override used for hosted entity UX.';

COMMENT ON COLUMN ai_assistants.telegram_essence IS
  'Optional Telegram-facing one-line essence/identity override used for hosted entity UX.';

COMMENT ON COLUMN ai_assistants.telegram_starter_prompts IS
  'Optional Telegram-facing starter prompts override as a JSON array of strings.';
