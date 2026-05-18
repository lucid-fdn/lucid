CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id    TEXT,
  p_handle      TEXT,
  p_email       TEXT DEFAULT NULL,
  p_avatar_url  TEXT DEFAULT NULL,
  p_first_name  TEXT DEFAULT NULL,
  p_last_name   TEXT DEFAULT NULL,
  p_provider    TEXT DEFAULT 'privy'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_org_id         UUID;
  v_workspace_name TEXT;
  v_full_name      TEXT;
  v_provider       TEXT;
BEGIN
  v_provider := COALESCE(p_provider, 'privy');

  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = v_provider AND external_id = p_privy_id
    FOR UPDATE NOWAIT;

    IF FOUND THEN RETURN v_user_id; END IF;
  EXCEPTION
    WHEN lock_not_available THEN
      PERFORM pg_sleep(0.1);
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = v_provider AND external_id = p_privy_id;
      IF FOUND THEN RETURN v_user_id; END IF;
  END;

  v_full_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_full_name = '' THEN v_full_name := p_handle; END IF;

  INSERT INTO profiles (
    handle, email, first_name, last_name, name,
    avatar_url, profile_public, last_login_at, created_at, updated_at
  ) VALUES (
    p_handle, p_email,
    COALESCE(p_first_name, ''), COALESCE(p_last_name, ''),
    v_full_name, p_avatar_url, false, NOW(), NOW(), NOW()
  )
  ON CONFLICT (handle) DO UPDATE SET last_login_at = NOW(), updated_at = NOW()
  RETURNING id INTO v_user_id;

  INSERT INTO identity_links (user_id, provider, external_id, created_at)
  VALUES (v_user_id, v_provider, p_privy_id, NOW())
  ON CONFLICT (provider, external_id) DO NOTHING;

  IF p_first_name IS NOT NULL AND p_first_name != '' THEN
    v_workspace_name := p_first_name || '''s Workspace';
  ELSE
    v_workspace_name := p_handle || '''s Workspace';
  END IF;

  INSERT INTO organizations (slug, name, type, created_by, created_at, updated_at)
  VALUES (p_handle, v_workspace_name, 'personal', v_user_id, NOW(), NOW())
  RETURNING id INTO v_org_id;

  RETURN v_user_id;
EXCEPTION
  WHEN OTHERS THEN RAISE;
END;
$$;
