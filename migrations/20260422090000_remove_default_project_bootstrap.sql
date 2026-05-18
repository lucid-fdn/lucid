BEGIN;

-- Stop auto-creating a hidden default project for every new organization.
DROP TRIGGER IF EXISTS trigger_create_default_project_and_env ON organizations;

-- JIT user creation should provision identity + personal workspace only.
-- The first real project is now created explicitly through the product flow.
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

-- Workspace RPCs should resolve the first real project if one exists,
-- but still return the workspace when no project has been created yet.
CREATE OR REPLACE FUNCTION get_current_workspace(p_user_id UUID, p_org_id UUID)
RETURNS TABLE(
  org_id UUID,
  project_id UUID,
  env_id UUID,
  org_name TEXT,
  project_name TEXT,
  env_name TEXT,
  user_role TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS org_id,
    p.id AS project_id,
    e.id AS env_id,
    o.name AS org_name,
    p.name AS project_name,
    e.name AS env_name,
    om.role AS user_role
  FROM organizations o
  JOIN organization_members om
    ON o.id = om.organization_id
  LEFT JOIN LATERAL (
    SELECT p1.id, p1.name, p1.created_at
    FROM projects_active p1
    WHERE p1.org_id = o.id
    ORDER BY p1.is_default ASC, p1.created_at ASC
    LIMIT 1
  ) p ON TRUE
  LEFT JOIN LATERAL (
    SELECT e1.id, e1.name
    FROM environments_active e1
    WHERE p.id IS NOT NULL
      AND e1.project_id = p.id
      AND e1.is_default = true
    ORDER BY e1.created_at ASC
    LIMIT 1
  ) e ON TRUE
  WHERE om.user_id = p_user_id
    AND o.id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_workspace(p_user_id UUID)
RETURNS TABLE(
  org_id UUID,
  org_name TEXT,
  project_id UUID,
  project_name TEXT,
  env_id UUID,
  env_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    p.id,
    p.name,
    e.id,
    e.name
  FROM organization_members om
  JOIN organizations o
    ON o.id = om.organization_id
  LEFT JOIN LATERAL (
    SELECT p1.id, p1.name, p1.created_at
    FROM projects_active p1
    WHERE p1.org_id = o.id
    ORDER BY p1.is_default ASC, p1.created_at ASC
    LIMIT 1
  ) p ON TRUE
  LEFT JOIN LATERAL (
    SELECT e1.id, e1.name
    FROM environments_active e1
    WHERE p.id IS NOT NULL
      AND e1.project_id = p.id
      AND e1.is_default = true
    ORDER BY e1.created_at ASC
    LIMIT 1
  ) e ON TRUE
  WHERE om.user_id = p_user_id
  ORDER BY om.joined_at DESC
  LIMIT 1;
END;
$$;

COMMIT;
