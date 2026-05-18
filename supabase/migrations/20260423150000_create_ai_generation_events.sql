create table if not exists public.ai_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  prompt text not null,
  success boolean not null default true,
  tokens_used integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_generation_events_user_created_at
  on public.ai_generation_events(user_id, created_at desc);

create index if not exists idx_ai_generation_events_feature_created_at
  on public.ai_generation_events(feature, created_at desc);

alter table public.ai_generation_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_generation_events'
      and policyname = 'Users can read own ai generation events'
  ) then
    create policy "Users can read own ai generation events"
      on public.ai_generation_events
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_generation_events'
      and policyname = 'Users can insert own ai generation events'
  ) then
    create policy "Users can insert own ai generation events"
      on public.ai_generation_events
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ai_workflow_generations'
  ) then
    insert into public.ai_generation_events (user_id, feature, prompt, success, tokens_used, created_at)
    select
      user_id,
      'workflow-generation',
      prompt,
      success,
      tokens_used,
      created_at
    from public.ai_workflow_generations;
  end if;
end
$$;

comment on table public.ai_generation_events is
  'Tracks structured AI generation requests across features for rate limiting and analytics.';

comment on column public.ai_generation_events.feature is
  'Logical feature key such as workflow-generation or project-generation.';
