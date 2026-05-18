-- Fix crew RLS: organization_members.organization_id was incorrectly
-- referenced as org_id throughout the original crews RLS policies
-- (20260328200000_crews.sql). Every policy subquery against organization_members
-- used .org_id which does not exist — causing all RLS checks to match zero rows
-- and silently blocking every authenticated crew query under service-role bypass.

-- ─── Drop broken policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Crews visible to org members"          ON crews;
DROP POLICY IF EXISTS "Crew members visible to org members"   ON crew_members;
DROP POLICY IF EXISTS "Crew edges visible to org members"     ON crew_edges;
DROP POLICY IF EXISTS "Crew runs visible to org members"      ON crew_runs;
DROP POLICY IF EXISTS "Crew run members visible to org members" ON crew_run_members;

-- ─── Recreate with correct column name ───────────────────────────────

CREATE POLICY crews_org_members ON crews
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY crew_members_org_members ON crew_members
  FOR ALL USING (
    crew_id IN (
      SELECT id FROM crews
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
      AND deleted_at IS NULL
    )
  );

CREATE POLICY crew_edges_org_members ON crew_edges
  FOR ALL USING (
    crew_id IN (
      SELECT id FROM crews
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
      AND deleted_at IS NULL
    )
  );

CREATE POLICY crew_runs_org_members ON crew_runs
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY crew_run_members_org_members ON crew_run_members
  FOR ALL USING (
    crew_run_id IN (
      SELECT id FROM crew_runs
      WHERE org_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid()
      )
    )
  );
