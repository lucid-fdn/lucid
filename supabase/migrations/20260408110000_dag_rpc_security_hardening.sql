-- Phase 4N-d hardening: REVOKE default EXECUTE on all SECURITY DEFINER DAG RPCs.
--
-- Background: Postgres grants EXECUTE on functions to PUBLIC by default. The
-- original DAG migrations (20260407220200_dag_scheduler_rpcs.sql,
-- 20260407220400_dag_mutator_rpcs.sql) and the confidence-floor follow-up
-- (20260408100000_dag_promote_return_confidence.sql) only added `GRANT EXECUTE
-- ... TO service_role` without first revoking the default PUBLIC grant. That
-- leaves these SECURITY DEFINER functions callable by `anon` and
-- `authenticated` roles via PostgREST — they'd run with the definer's
-- privileges and could be used to bypass RLS on orchestration_dag_* tables.
--
-- This migration follows the pattern established by
-- 20260407140000_telegram_multi_agent_atomic_bind.sql: REVOKE from PUBLIC +
-- anon + authenticated, then GRANT to service_role. service_role already had
-- EXECUTE via the original migrations; we re-assert it for idempotency.
--
-- Functions locked down:
--   - dag_promote_roots(UUID)
--   - dag_complete_node(UUID, UUID)
--   - dag_promote_added_subgraph(UUID, UUID[])
--   - dag_cancel_subtree(UUID, UUID)
--   - dag_bump_completed(UUID)
--   - dag_apply_expand_mutation(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID,
--                                TEXT, JSONB, JSONB)

-- ============================================================================
-- dag_promote_roots
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_promote_roots(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_promote_roots(UUID) TO service_role;

-- ============================================================================
-- dag_complete_node
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_complete_node(UUID, UUID) TO service_role;

-- ============================================================================
-- dag_promote_added_subgraph
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_promote_added_subgraph(UUID, UUID[]) TO service_role;

-- ============================================================================
-- dag_cancel_subtree
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_cancel_subtree(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_cancel_subtree(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_cancel_subtree(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_cancel_subtree(UUID, UUID) TO service_role;

-- ============================================================================
-- dag_bump_completed
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_bump_completed(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_bump_completed(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_bump_completed(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_bump_completed(UUID) TO service_role;

-- ============================================================================
-- dag_apply_expand_mutation
-- ============================================================================
REVOKE EXECUTE ON FUNCTION dag_apply_expand_mutation(
  UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, TEXT, JSONB, JSONB
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dag_apply_expand_mutation(
  UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, TEXT, JSONB, JSONB
) FROM anon;
REVOKE EXECUTE ON FUNCTION dag_apply_expand_mutation(
  UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, TEXT, JSONB, JSONB
) FROM authenticated;
GRANT  EXECUTE ON FUNCTION dag_apply_expand_mutation(
  UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, TEXT, JSONB, JSONB
) TO service_role;
