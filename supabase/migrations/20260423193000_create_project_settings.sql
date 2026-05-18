create table if not exists project_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  org_id uuid not null,
  preferred_runtime text not null default 'auto',
  approval_policy text not null default 'human_in_loop',
  mutation_policy text not null default 'review',
  default_creation_mode text not null default 'template_first',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  constraint project_settings_preferred_runtime_check check (preferred_runtime in ('shared', 'managed', 'byo', 'auto')),
  constraint project_settings_approval_policy_check check (approval_policy in ('human_in_loop', 'auto_low_risk', 'strict')),
  constraint project_settings_mutation_policy_check check (mutation_policy in ('review', 'guided', 'manual')),
  constraint project_settings_default_creation_mode_check check (default_creation_mode in ('template_first', 'describe_first', 'blank_first'))
);

create index if not exists idx_project_settings_org_id on project_settings(org_id);

alter table project_settings enable row level security;

create policy "project_settings_select_authenticated"
on project_settings
for select
to authenticated
using (true);

create policy "project_settings_insert_authenticated"
on project_settings
for insert
to authenticated
with check (true);

create policy "project_settings_update_authenticated"
on project_settings
for update
to authenticated
using (true)
with check (true);
