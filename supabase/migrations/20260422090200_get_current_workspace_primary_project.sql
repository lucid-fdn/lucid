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
    SELECT p1.id, p1.name, p1.created_at, p1.is_default
    FROM projects_active p1
    WHERE p1.org_id = o.id
    ORDER BY p1.is_default ASC, p1.created_at ASC
    LIMIT 1
  ) p ON TRUE
  LEFT JOIN LATERAL (
    SELECT e1.id, e1.name, e1.created_at
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
