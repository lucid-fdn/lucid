-- Managed Lucid runtimes should follow control-plane image updates by default.
-- Existing managed dedicated runtimes are backfilled from manual -> full_auto.

update dedicated_runtimes
set
  maintenance_channel = coalesce(maintenance_channel, 'stable'),
  auto_update_policy = 'full_auto'
where
  managed_by_lucid = true
  and coalesce(runtime_tier, 'dedicated') = 'dedicated'
  and status <> 'revoked'
  and auto_update_policy = 'manual';
