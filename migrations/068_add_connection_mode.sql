-- Migration 068: Add connection_mode to assistant_channels
-- Supports both "hosted" (one-click OAuth) and "byob" (bring your own bot) patterns
-- Ref: Multi-Channel Integration Plan (Discord/Slack)

-- Add connection_mode column (defaults to 'byob' for backward compatibility)
ALTER TABLE assistant_channels
ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'byob'
CHECK (connection_mode IN ('hosted', 'byob'));

-- Add index for filtering by connection mode
CREATE INDEX idx_assistant_channels_connection_mode 
ON assistant_channels(connection_mode);

-- Add comment explaining the modes
COMMENT ON COLUMN assistant_channels.connection_mode IS 
'Channel connection mode: "hosted" = OAuth/invite via official Lucid bot (one-click), "byob" = bring your own bot token (advanced/enterprise)';