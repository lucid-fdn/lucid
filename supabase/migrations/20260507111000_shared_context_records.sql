-- Shared company/project/team/agent context: thesis, signals, feedback, daily intel, memory.

create table if not exists public.shared_context_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  agent_id uuid references public.ai_assistants(id) on delete cascade,
  scope_type text not null check (scope_type in ('workspace', 'project', 'team', 'agent', 'user')),
  scope_id text not null,
  record_type text not null check (
    record_type in ('thesis', 'signal', 'feedback', 'daily_intel', 'memory', 'decision', 'policy', 'risk', 'open_question')
  ),
  title text not null,
  body text not null,
  source_type text,
  source_id text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'active' check (status in ('draft', 'active', 'resolved', 'superseded', 'archived')),
  valid_from timestamptz,
  valid_until timestamptz,
  superseded_by_record_id uuid references public.shared_context_records(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_context_records_scope_idx
  on public.shared_context_records(workspace_id, scope_type, scope_id, record_type, status);

create index if not exists shared_context_records_project_idx
  on public.shared_context_records(workspace_id, project_id, record_type, status);

create index if not exists shared_context_records_agent_idx
  on public.shared_context_records(workspace_id, agent_id, record_type, status);

create table if not exists public.shared_context_links (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.shared_context_records(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  label text,
  url text,
  provenance text,
  observed_at timestamptz,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (record_id, target_type, target_id)
);

create table if not exists public.daily_intel_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  agent_id uuid references public.ai_assistants(id) on delete set null,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'failed')),
  summary text,
  context_record_id uuid references public.shared_context_records(id) on delete set null,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_heartbeats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  agent_id uuid not null references public.ai_assistants(id) on delete cascade,
  status text not null default 'active',
  focus text,
  health jsonb not null default '{}'::jsonb,
  next_check_in_at timestamptz,
  context_record_id uuid references public.shared_context_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_shared_context_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shared_context_records_updated_at on public.shared_context_records;
create trigger set_shared_context_records_updated_at
before update on public.shared_context_records
for each row execute function public.set_shared_context_records_updated_at();

alter table public.shared_context_records enable row level security;
alter table public.shared_context_links enable row level security;
alter table public.daily_intel_runs enable row level security;
alter table public.agent_heartbeats enable row level security;

drop policy if exists shared_context_records_org_members on public.shared_context_records;
create policy shared_context_records_org_members on public.shared_context_records
  for all using (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists shared_context_links_org_members on public.shared_context_links;
create policy shared_context_links_org_members on public.shared_context_links
  for all using (
    exists (
      select 1
      from public.shared_context_records r
      where r.id = shared_context_links.record_id
        and r.workspace_id in (
          select organization_id from public.organization_members where user_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.shared_context_records r
      where r.id = shared_context_links.record_id
        and r.workspace_id in (
          select organization_id from public.organization_members where user_id = auth.uid()
        )
    )
  );

drop policy if exists daily_intel_runs_org_members on public.daily_intel_runs;
create policy daily_intel_runs_org_members on public.daily_intel_runs
  for all using (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists agent_heartbeats_org_members on public.agent_heartbeats;
create policy agent_heartbeats_org_members on public.agent_heartbeats
  for all using (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists shared_context_records_service_all on public.shared_context_records;
create policy shared_context_records_service_all on public.shared_context_records
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists shared_context_links_service_all on public.shared_context_links;
create policy shared_context_links_service_all on public.shared_context_links
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists daily_intel_runs_service_all on public.daily_intel_runs;
create policy daily_intel_runs_service_all on public.daily_intel_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists agent_heartbeats_service_all on public.agent_heartbeats;
create policy agent_heartbeats_service_all on public.agent_heartbeats
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
