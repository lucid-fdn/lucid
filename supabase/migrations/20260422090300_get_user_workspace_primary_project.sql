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
  ORDER BY om.joined_at DESC
  LIMIT 1;
END;
$$;
