-- Lucid auth returns profiles.id for authenticated operators. Project-policy
-- audit fields should therefore reference profiles, not Supabase auth.users.

ALTER TABLE agent_ops_project_policies
  DROP CONSTRAINT IF EXISTS agent_ops_project_policies_updated_by_fkey;

ALTER TABLE agent_ops_project_policies
  ADD CONSTRAINT agent_ops_project_policies_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES profiles(id)
  ON DELETE SET NULL;
