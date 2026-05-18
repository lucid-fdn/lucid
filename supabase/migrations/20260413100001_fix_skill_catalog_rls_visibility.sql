-- Fix skill_catalog SELECT policy to enforce visibility + owner_org_id.
--
-- 20260411140000_skill_catalog_private_visibility.sql added visibility and
-- owner_org_id columns but never updated the RLS policy. The existing policy
-- allows any authenticated user to read any approved row regardless of
-- visibility — leaking org-private skills to every org.

DROP POLICY IF EXISTS skill_catalog_select ON skill_catalog;

-- Approved global skills are readable by all authenticated users.
-- Approved org-private skills are only readable by members of the owning org.
CREATE POLICY skill_catalog_select ON skill_catalog
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND status = 'approved'
    AND (
      visibility = 'global'
      OR (
        visibility = 'org_private'
        AND owner_org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );
