-- Migration 079: Link Telegram users to LucidMerged profiles.
--
-- Maps a Telegram user_id to a LucidMerged profile + organization.
-- Used by the Lucid Telegram bot to enforce plan limits and track usage.
-- One link per Telegram user (they belong to one org for billing purposes).

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_user_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id    TEXT NOT NULL,
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  telegram_username   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One link per Telegram user
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_user_links_tg_user
  ON telegram_user_links (telegram_user_id);

-- Reverse lookup: find all Telegram users for an org
CREATE INDEX IF NOT EXISTS idx_telegram_user_links_org
  ON telegram_user_links (org_id);

-- Reverse lookup: find Telegram user for a profile
CREATE INDEX IF NOT EXISTS idx_telegram_user_links_profile
  ON telegram_user_links (profile_id);

-- RLS: service_role can do everything, authenticated users can read their own
ALTER TABLE telegram_user_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_user_links_service_all
  ON telegram_user_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY telegram_user_links_user_read
  ON telegram_user_links
  FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR org_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Add agents_deployed limit to plans (used by Telegram bot billing gate)
-- internal: unlimited, starter: 1, pro: 10, business: unlimited (-1)
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"agents_deployed": -1}'::jsonb
  WHERE name = 'internal';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"agents_deployed": 1}'::jsonb
  WHERE name = 'starter';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"agents_deployed": 10}'::jsonb
  WHERE name = 'pro';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"agents_deployed": -1}'::jsonb
  WHERE name = 'business';

COMMIT;
