-- Add Organization Context to Notifications
-- Allows filtering notifications by organization while keeping user-scoped base
-- Idempotent: Safe to run multiple times

-- Add organization_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notifications' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE notifications 
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NULL;
    
    COMMENT ON COLUMN notifications.organization_id IS 'Optional org context - NULL = global notification';
  END IF;
END $$;

-- Create index for org-filtered queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_org_unread 
  ON notifications(user_id, organization_id, read) 
  WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_org_created 
  ON notifications(user_id, organization_id, created_at DESC);

-- Add comment explaining the design
COMMENT ON TABLE notifications IS 
'Notification inbox/history for users. 
organization_id NULL = global notification (shows in all orgs)
organization_id set = org-specific notification (shows only in that org context)';

-- Update RLS policies to work with org context
-- Drop and recreate to ensure clean state
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
  DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
  DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
END $$;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert notifications (for system-generated notifications)
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can update their own notifications (mark as read, etc.)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);
