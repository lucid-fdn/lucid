-- Add source tracking fields used by Mission Control memory provenance.
-- These fields are already referenced in application reads/writes but were
-- never introduced by migrations in older environments.

ALTER TABLE assistant_memory
  ADD COLUMN IF NOT EXISTS source_user_message TEXT,
  ADD COLUMN IF NOT EXISTS source_assistant_response TEXT;

CREATE INDEX IF NOT EXISTS assistant_memory_source_assistant_response_idx
  ON assistant_memory (assistant_id, source_assistant_response)
  WHERE source_assistant_response IS NOT NULL;
