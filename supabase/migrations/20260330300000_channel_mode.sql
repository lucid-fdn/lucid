-- Add channel_mode column to dedicated_runtimes
-- 'relay' = C1 REST Relay (default), 'native' = C2a Self-Sovereign Channels
ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS channel_mode TEXT DEFAULT 'relay'
    CHECK (channel_mode IN ('relay', 'native'));

COMMENT ON COLUMN dedicated_runtimes.channel_mode
  IS 'Channel architecture mode: relay (C1, control plane owns delivery) or native (C2a, runtime owns channels)';

-- Atomic governance action append.
-- Avoids read-modify-write race conditions by using PostgreSQL JSONB || operator
-- in a single UPDATE statement. Returns the new length of the pending_actions array.
CREATE OR REPLACE FUNCTION append_runtime_governance_action(
  p_runtime_id UUID,
  p_org_id UUID,
  p_action JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_length INT;
BEGIN
  UPDATE dedicated_runtimes
  SET pending_actions = COALESCE(pending_actions, '[]'::jsonb) || jsonb_build_array(p_action)
  WHERE id = p_runtime_id
    AND org_id = p_org_id
  RETURNING jsonb_array_length(pending_actions) INTO v_new_length;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Runtime not found or not owned by org'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new_length;
END;
$$;
