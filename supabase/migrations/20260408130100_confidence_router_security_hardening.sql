-- Phase 5N follow-up: re-assert the RLS hardening from
-- 20260408110000_dag_rpc_security_hardening.sql on the three promotion RPCs.
--
-- Background: 20260408130000_confidence_router.sql used DROP FUNCTION +
-- CREATE OR REPLACE to change the RETURNS TABLE tuple (adding `payload`).
-- Dropping a function wipes every prior grant/revoke on it, so the
-- REVOKEs from PUBLIC/anon/authenticated added in 110000 silently
-- regressed — Postgres re-granted EXECUTE to PUBLIC by default on the
-- newly-created functions.
--
-- This migration re-applies the same REVOKE + GRANT pattern to close
-- the window. Idempotent: re-asserts service_role grant too.
--
-- Functions re-locked-down:
--   - dag_promote_roots(UUID)
--   - dag_complete_node(UUID, UUID)
--   - dag_promote_added_subgraph(UUID, UUID[])

REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_promote_roots(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) TO service_role;
