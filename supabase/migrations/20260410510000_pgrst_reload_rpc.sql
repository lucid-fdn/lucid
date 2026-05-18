-- Temporary helper: call pgrst_reload() via RPC to force schema cache reload
-- Can be dropped after schema stabilizes
CREATE OR REPLACE FUNCTION pgrst_reload()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

GRANT EXECUTE ON FUNCTION pgrst_reload TO service_role;
