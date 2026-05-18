DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname
  INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'agent_avatar_assets'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%provider%trustgate%openai%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agent_avatar_assets DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$$;

ALTER TABLE public.agent_avatar_assets
  ADD CONSTRAINT agent_avatar_assets_provider_check
  CHECK (provider IN ('trustgate', 'litellm', 'openai'));

COMMENT ON COLUMN public.agent_avatar_assets.provider IS
  'Image provider that produced the persisted avatar asset: trustgate, litellm, or openai.';
