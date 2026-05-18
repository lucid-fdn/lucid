-- Fix: The original inline UNIQUE constraint in 044 was invalid SQL syntax
-- (partial unique constraints can't be inline). Create it properly as an index.
-- Prevents duplicate active channels of the same type per assistant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_channels_active_type
  ON assistant_channels (assistant_id, channel_type)
  WHERE is_active = true;
