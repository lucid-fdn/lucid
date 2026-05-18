-- Add 'msteams' to the assistant_channels.channel_type CHECK constraint.
-- The existing constraint name varies by migration history; drop + recreate
-- is idempotent via IF EXISTS.

-- Step 1: Drop the old CHECK constraint on channel_type
ALTER TABLE assistant_channels
  DROP CONSTRAINT IF EXISTS assistant_channels_channel_type_check;

-- Step 2: Recreate with msteams included
ALTER TABLE assistant_channels
  ADD CONSTRAINT assistant_channels_channel_type_check
  CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord', 'slack', 'msteams'));

-- Step 3: Extend runtime_events_event_type_check if it exists (add msteams channel events)
-- No change needed — runtime_events.event_type is TEXT with a CHECK that covers
-- generic event types (channel_connected, channel_disconnected, etc.), not
-- channel-type-specific values. msteams works with existing event types.
