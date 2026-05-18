-- Migration: Rename plan tiers to match gateway
-- free → starter, enterprise → business
-- Self-hosted: plans table may not exist (billing bypassed). Skip gracefully.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans') THEN
    EXECUTE 'ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_name_check';
    EXECUTE 'UPDATE plans SET name = ''starter'', display_name = ''Starter'' WHERE name = ''free''';
    EXECUTE 'UPDATE plans SET name = ''business'', display_name = ''Business'' WHERE name = ''enterprise''';
    EXECUTE 'ALTER TABLE plans ADD CONSTRAINT plans_name_check CHECK (name IN (''starter'', ''pro'', ''business''))';
    EXECUTE 'UPDATE plans SET features = COALESCE(features, ''{}''::jsonb) || ''{"video_studio": true, "video_enabled": true}''::jsonb WHERE name IN (''pro'', ''business'')';
    EXECUTE 'UPDATE plans SET limits = COALESCE(limits, ''{}''::jsonb) || ''{"video_renders_per_month": 50}''::jsonb WHERE name = ''pro''';
    EXECUTE 'UPDATE plans SET limits = COALESCE(limits, ''{}''::jsonb) || ''{"video_renders_per_month": -1}''::jsonb WHERE name = ''business''';
  END IF;
END $$;
