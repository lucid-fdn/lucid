-- Agent-agnostic platform model
-- Introduces explicit runtime flavor, channel ownership, and runtime protocol

ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS runtime_flavor TEXT;

ALTER TABLE ai_assistants
  DROP CONSTRAINT IF EXISTS ai_assistants_runtime_flavor_check;

ALTER TABLE ai_assistants
  ADD CONSTRAINT ai_assistants_runtime_flavor_check
  CHECK (runtime_flavor IS NULL OR runtime_flavor IN ('shared', 'c1_managed', 'c2a_autonomous'));

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'openclaw',
  ADD COLUMN IF NOT EXISTS runtime_flavor TEXT,
  ADD COLUMN IF NOT EXISTS channel_ownership TEXT,
  ADD COLUMN IF NOT EXISTS runtime_protocol TEXT NOT NULL DEFAULT 'lucid-runtime-v1',
  ADD COLUMN IF NOT EXISTS engine_version TEXT,
  ADD COLUMN IF NOT EXISTS runtime_version TEXT,
  ADD COLUMN IF NOT EXISTS engine_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_runtime_flavor_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_runtime_flavor_check
  CHECK (runtime_flavor IS NULL OR runtime_flavor IN ('c1_managed', 'c2a_autonomous'));

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_channel_ownership_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_channel_ownership_check
  CHECK (channel_ownership IS NULL OR channel_ownership IN ('lucid_relay', 'runtime_native'));

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_runtime_protocol_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_runtime_protocol_check
  CHECK (runtime_protocol IN ('lucid-runtime-v1', 'lucid-runtime-v2'));

UPDATE ai_assistants
SET runtime_flavor = CASE
  WHEN runtime_id IS NULL THEN 'shared'
  ELSE 'c1_managed'
END
WHERE runtime_flavor IS NULL;

UPDATE dedicated_runtimes
SET runtime_flavor = CASE
  WHEN channel_mode = 'native' THEN 'c2a_autonomous'
  ELSE 'c1_managed'
END
WHERE runtime_flavor IS NULL;

UPDATE dedicated_runtimes
SET channel_ownership = CASE
  WHEN channel_mode = 'native' THEN 'runtime_native'
  ELSE 'lucid_relay'
END
WHERE channel_ownership IS NULL;
