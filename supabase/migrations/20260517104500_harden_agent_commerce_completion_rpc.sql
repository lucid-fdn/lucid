-- Require provider proof and a captured budget reservation before marking spend completed.

CREATE OR REPLACE FUNCTION complete_agent_spend_request(
  p_spend_request_id UUID,
  p_org_id UUID,
  p_provider_request_id TEXT DEFAULT NULL,
  p_provider_credential_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS SETOF agent_spend_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend agent_spend_requests%ROWTYPE;
  v_captured_count INTEGER := 0;
BEGIN
  IF p_provider_request_id IS NULL OR length(trim(p_provider_request_id)) = 0 THEN
    RAISE EXCEPTION 'Provider request evidence is required to complete spend request';
  END IF;
  IF p_provider_credential_id IS NULL OR length(trim(p_provider_credential_id)) = 0 THEN
    RAISE EXCEPTION 'Provider credential evidence is required to complete spend request';
  END IF;

  SELECT *
  INTO v_spend
  FROM agent_spend_requests
  WHERE id = p_spend_request_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent Commerce spend request was not found';
  END IF;

  IF v_spend.status <> 'credential_issued' THEN
    RAISE EXCEPTION 'Cannot complete spend request from status %', v_spend.status;
  END IF;

  UPDATE agent_commerce_budget_reservations
  SET status = 'captured',
      captured_at = COALESCE(captured_at, now()),
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'capture',
        jsonb_build_object('reason', 'spend_request_completed', 'at', now())
      )
  WHERE spend_request_id = p_spend_request_id
    AND org_id = p_org_id
    AND status = 'reserved';

  GET DIAGNOSTICS v_captured_count = ROW_COUNT;
  IF v_captured_count = 0 THEN
    RAISE EXCEPTION 'Reserved budget capture is required to complete spend request';
  END IF;

  UPDATE agent_spend_requests
  SET status = 'completed',
      completed_at = now(),
      updated_at = now(),
      provider_request_id = p_provider_request_id,
      provider_credential_id = p_provider_credential_id,
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_spend_request_id
    AND org_id = p_org_id;

  RETURN QUERY
  SELECT *
  FROM agent_spend_requests
  WHERE id = p_spend_request_id
    AND org_id = p_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_agent_spend_request(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_agent_spend_request(UUID, UUID, TEXT, TEXT, JSONB) TO service_role;
