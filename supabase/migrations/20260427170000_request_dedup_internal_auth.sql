CREATE TABLE IF NOT EXISTS request_dedup (
  request_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_dedup_created_at
  ON request_dedup(created_at);

COMMENT ON TABLE request_dedup IS 'Request ID deduplication for replay protection on internal APIs';

CREATE OR REPLACE FUNCTION cleanup_request_dedup()
RETURNS void AS $$
BEGIN
  DELETE FROM request_dedup WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

ALTER TABLE request_dedup ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'request_dedup'
      AND policyname = 'request_dedup_service'
  ) THEN
    CREATE POLICY request_dedup_service ON request_dedup
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END;
$$;
