alter table public.ai_assistants
  add column if not exists telegram_voice_instructions text;
