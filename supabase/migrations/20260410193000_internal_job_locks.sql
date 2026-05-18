CREATE TABLE IF NOT EXISTS internal_job_locks (
  lock_name TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION acquire_internal_job_lock(
  p_lock_name TEXT,
  p_owner_token TEXT,
  p_ttl_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO internal_job_locks AS l (
    lock_name,
    owner_token,
    expires_at,
    updated_at
  )
  VALUES (
    p_lock_name,
    p_owner_token,
    NOW() + make_interval(secs => p_ttl_seconds),
    NOW()
  )
  ON CONFLICT (lock_name) DO UPDATE
  SET
    owner_token = EXCLUDED.owner_token,
    expires_at = EXCLUDED.expires_at,
    updated_at = NOW()
  WHERE l.expires_at <= NOW() OR l.owner_token = EXCLUDED.owner_token;

  RETURN EXISTS (
    SELECT 1
    FROM internal_job_locks
    WHERE lock_name = p_lock_name
      AND owner_token = p_owner_token
      AND expires_at > NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION release_internal_job_lock(
  p_lock_name TEXT,
  p_owner_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM internal_job_locks
  WHERE lock_name = p_lock_name
    AND owner_token = p_owner_token;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION acquire_internal_job_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_internal_job_lock(TEXT, TEXT) TO service_role;
