alter table public.dedicated_runtimes
  add column if not exists runtime_bootstrap_config jsonb;

update public.dedicated_runtimes
set runtime_bootstrap_config = jsonb_build_object('migration', engine_metadata -> 'migration')
where runtime_bootstrap_config is null
  and engine_metadata ? 'migration';

