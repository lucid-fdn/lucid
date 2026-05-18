-- Hotfix: Drop old 2-param claim_next_inbound_event overload.
-- The A1 migration (20260326300000) used CREATE OR REPLACE but changed the signature
-- by adding p_runtime_id, creating a second overload instead of replacing.
-- This causes "Could not choose the best candidate function" errors.

DROP FUNCTION IF EXISTS public.claim_next_inbound_event(TEXT, INT);
