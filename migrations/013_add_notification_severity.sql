-- Add severity column to notifications table for unified notification system
-- Maps semantic notification types to UI severity levels

-- Add severity column (nullable for backwards compatibility)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS severity TEXT;

-- Add check constraint for valid severity values
ALTER TABLE notifications
ADD CONSTRAINT notifications_severity_check 
CHECK (severity IN ('info', 'success', 'warning', 'error'));

-- Update existing notifications with computed severity based on type
UPDATE notifications
SET severity = CASE
  WHEN type = 'NEW_FOLLOWER' THEN 'info'
  WHEN type = 'ASSET_LIKED' THEN 'info'
  WHEN type = 'ASSET_RATED' THEN 'info'
  WHEN type = 'ASSET_PUBLISHED' THEN 'success'
  WHEN type = 'MENTION' THEN 'warning'
  WHEN type = 'WORKFLOW_EXECUTED' THEN 'success'
  WHEN type = 'WORKFLOW_FAILED' THEN 'error'
  WHEN type = 'IMPORTANT_UPDATE' THEN 'warning'
  ELSE 'info'
END
WHERE severity IS NULL;

-- Create index for filtering by severity
CREATE INDEX IF NOT EXISTS idx_notifications_severity 
ON notifications(severity);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_severity_created 
ON notifications(user_id, severity, created_at DESC);

-- Comment for documentation
COMMENT ON COLUMN notifications.severity IS 'UI severity level: info, success, warning, error. Auto-computed from notification type.';
