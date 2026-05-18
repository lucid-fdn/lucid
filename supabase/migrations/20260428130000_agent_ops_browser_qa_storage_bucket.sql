-- Durable Browser QA artifact bucket.
--
-- The browser gateway proxies `/artifacts/...` through its authenticated API,
-- so this bucket stays private. Service-role workers can upload/download
-- evidence while users continue to access artifacts through Mission Control
-- and gateway-authenticated URLs.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'agent-ops-browser-qa',
  'agent-ops-browser-qa',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
