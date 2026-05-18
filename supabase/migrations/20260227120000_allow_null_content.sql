-- Migration: Allow NULL content in assistant_messages for encryption
--
-- When encryption_mode = 'APP_LAYER', the plaintext content is stored in
-- content_encrypted (with content_iv + content_auth_tag), and content is NULL.
-- The original schema (044) had content TEXT NOT NULL, which breaks encrypted inserts.
--
-- Invariant: content IS NOT NULL OR content_encrypted IS NOT NULL
-- (enforced at application layer)
--
-- These tables are part of the historical base schema rather than the
-- Supabase migration folder. Fresh local bootstrap can therefore apply this
-- migration before the legacy tables exist, so guard the alters and treat
-- them as no-ops when bootstrapping a minimal database from scratch.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assistant_messages'
      AND column_name = 'content'
  ) THEN
    EXECUTE 'ALTER TABLE assistant_messages ALTER COLUMN content DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assistant_memory'
      AND column_name = 'content'
  ) THEN
    EXECUTE 'ALTER TABLE assistant_memory ALTER COLUMN content DROP NOT NULL';
  END IF;
END $$;
