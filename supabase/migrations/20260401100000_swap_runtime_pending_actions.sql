-- Atomic swap for dedicated_runtimes.pending_actions
-- Locks the row, reads the current pending_actions, clears them to '[]',
-- and returns the old value. Prevents race conditions where two concurrent
-- heartbeats both read the same actions.

CREATE OR REPLACE FUNCTION swap_runtime_pending_actions(p_runtime_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_actions JSONB;
BEGIN
  -- SELECT FOR UPDATE locks the row, preventing concurrent reads
  SELECT pending_actions INTO old_actions
  FROM dedicated_runtimes
  WHERE id = p_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Clear the pending actions
  UPDATE dedicated_runtimes
  SET pending_actions = '[]'::jsonb
  WHERE id = p_runtime_id;

  RETURN COALESCE(old_actions, '[]'::jsonb);
END;
$$;
