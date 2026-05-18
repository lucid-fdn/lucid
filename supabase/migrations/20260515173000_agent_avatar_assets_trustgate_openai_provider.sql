ALTER TABLE public.agent_avatar_assets
  DROP CONSTRAINT IF EXISTS agent_avatar_assets_provider_check;

ALTER TABLE public.agent_avatar_assets
  ADD CONSTRAINT agent_avatar_assets_provider_check
  CHECK (provider IN ('trustgate', 'openai'));

COMMENT ON COLUMN public.agent_avatar_assets.provider IS
  'Image provider that produced the persisted avatar asset: trustgate or openai.';
