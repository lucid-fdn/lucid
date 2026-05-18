alter table public.ai_assistants
  add column if not exists telegram_voice_mode text not null default 'off',
  add column if not exists telegram_voice_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_assistants_telegram_voice_mode_check'
  ) then
    alter table public.ai_assistants
      add constraint ai_assistants_telegram_voice_mode_check
      check (telegram_voice_mode in ('off', 'auto', 'always'));
  end if;
end $$;
