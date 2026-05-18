-- Versioned identity documents for agents.

create table if not exists public.agent_identity_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  agent_id uuid not null references public.ai_assistants(id) on delete cascade,
  document_type text not null check (
    document_type in (
      'SOUL',
      'USER',
      'HEARTBEAT',
      'MEMORY_POLICY',
      'ACCESS_POLICY',
      'TOOL_POLICY',
      'CURRENT_CONTEXT'
    )
  ),
  version integer not null check (version > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'superseded', 'archived')),
  content jsonb not null default '{}'::jsonb,
  passport_id text,
  wallet_address text,
  identity_anchor jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  supersedes_document_id uuid references public.agent_identity_documents(id) on delete set null,
  unique (agent_id, document_type, version)
);

create unique index if not exists agent_identity_documents_one_active_per_type
  on public.agent_identity_documents(agent_id, document_type)
  where status = 'active';

create index if not exists agent_identity_documents_workspace_idx
  on public.agent_identity_documents(workspace_id, project_id, agent_id);

create index if not exists agent_identity_documents_passport_idx
  on public.agent_identity_documents(passport_id)
  where passport_id is not null;

create index if not exists agent_identity_documents_wallet_idx
  on public.agent_identity_documents(wallet_address)
  where wallet_address is not null;

create index if not exists agent_identity_documents_latest_idx
  on public.agent_identity_documents(agent_id, document_type, version desc);

create or replace function public.set_agent_identity_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_agent_identity_documents_updated_at on public.agent_identity_documents;
create trigger set_agent_identity_documents_updated_at
before update on public.agent_identity_documents
for each row execute function public.set_agent_identity_documents_updated_at();

alter table public.agent_identity_documents enable row level security;

drop policy if exists agent_identity_documents_select_member on public.agent_identity_documents;
create policy agent_identity_documents_select_member
  on public.agent_identity_documents
  for select
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = agent_identity_documents.workspace_id
        and om.user_id = auth.uid()
    )
  );

drop policy if exists agent_identity_documents_write_member on public.agent_identity_documents;
create policy agent_identity_documents_write_member
  on public.agent_identity_documents
  for all
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = agent_identity_documents.workspace_id
        and om.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = agent_identity_documents.workspace_id
        and om.user_id = auth.uid()
    )
  );

drop policy if exists agent_identity_documents_service_all on public.agent_identity_documents;
create policy agent_identity_documents_service_all
  on public.agent_identity_documents
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
