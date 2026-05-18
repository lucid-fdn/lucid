-- Migration 075: Allow NULL content in assistant_messages for encryption
--
-- When encryption_mode = 'APP_LAYER', the plaintext content is stored in
-- content_encrypted (with content_iv + content_auth_tag), and content is NULL.
-- The original schema (044) had content TEXT NOT NULL, which breaks encrypted inserts.
--
-- Invariant: content IS NOT NULL OR content_encrypted IS NOT NULL
-- (enforced at application layer)

ALTER TABLE assistant_messages ALTER COLUMN content DROP NOT NULL;

-- Also allow NULL content in assistant_memory (same encryption pattern)
ALTER TABLE assistant_memory ALTER COLUMN content DROP NOT NULL;
