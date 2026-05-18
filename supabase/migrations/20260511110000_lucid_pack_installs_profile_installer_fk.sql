-- Lucid auth resolves runtime sessions to profiles.id. Pack install audit rows
-- should therefore reference profiles rather than Supabase auth.users.

ALTER TABLE lucid_pack_installs
  DROP CONSTRAINT IF EXISTS lucid_pack_installs_installed_by_user_id_fkey;

ALTER TABLE lucid_pack_installs
  ADD CONSTRAINT lucid_pack_installs_installed_by_user_id_fkey
  FOREIGN KEY (installed_by_user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;
