-- ============================================================================
-- Native mutation review hardening
-- ============================================================================

ALTER TABLE mc_native_mutation_candidates
  DROP CONSTRAINT IF EXISTS mc_native_mutation_candidates_status_check;

ALTER TABLE mc_native_mutation_candidates
  ADD CONSTRAINT mc_native_mutation_candidates_status_check
  CHECK (status IN ('pending', 'applying', 'approved', 'rejected', 'promoted'));

CREATE OR REPLACE FUNCTION mc_native_mutation_pending_breakdown(p_org_id UUID)
RETURNS TABLE (
  engine TEXT,
  mutation_kind TEXT,
  pending_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.engine,
    c.mutation_kind,
    COUNT(*)::BIGINT AS pending_count
  FROM mc_native_mutation_candidates c
  WHERE c.org_id = p_org_id
    AND c.status = 'pending'
  GROUP BY c.engine, c.mutation_kind
  ORDER BY c.engine ASC, c.mutation_kind ASC;
$$;

GRANT EXECUTE ON FUNCTION mc_native_mutation_pending_breakdown(UUID) TO service_role;
