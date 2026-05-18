-- ============================================
-- SUPABASE MARKETPLACE SEED DATA - SAFE VERSION
-- ============================================
-- Works with supabase_marketplace_schema_ULTRA_SAFE.sql
-- No materialized views required

-- ============================================
-- 1. INSERT SAMPLE ORGANIZATIONS
-- ============================================

INSERT INTO public.organizations (slug, display_name, verified, bio) VALUES
  ('mistral-ai', 'Mistral AI', true, 'Leading provider of open and efficient AI models'),
  ('meta', 'Meta', true, 'Building the metaverse and AI infrastructure'),
  ('openai', 'OpenAI', true, 'Developing safe and beneficial AI'),
  ('community', 'Community', false, 'Open source community projects'),
  ('acme-inc', 'Acme Inc', false, 'Enterprise AI solutions provider'),
  ('europe-cloud', 'Europe Cloud', true, 'Secure European cloud infrastructure'),
  ('github', 'GitHub', true, 'Development platform for collaboration'),
  ('stanford', 'Stanford', true, 'Stanford University AI Research'),
  ('eleutherai', 'EleutherAI', false, 'Open source AI research collective'),
  ('render-network', 'Render Network', false, 'Decentralized GPU compute'),
  ('common-crawl', 'Common Crawl', false, 'Open web crawl data')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 2. INSERT SAMPLE ASSETS
-- ============================================

DO $$
DECLARE
  org_mistral_ai UUID;
  org_meta UUID;
  org_openai UUID;
  org_community UUID;
  org_acme_inc UUID;
  org_europe_cloud UUID;
  org_github UUID;
  org_stanford UUID;
  org_eleutherai UUID;
  org_render UUID;
  org_common_crawl UUID;
BEGIN
  -- Fetch organization IDs
  SELECT id INTO org_mistral_ai FROM public.organizations WHERE slug = 'mistral-ai';
  SELECT id INTO org_meta FROM public.organizations WHERE slug = 'meta';
  SELECT id INTO org_openai FROM public.organizations WHERE slug = 'openai';
  SELECT id INTO org_community FROM public.organizations WHERE slug = 'community';
  SELECT id INTO org_acme_inc FROM public.organizations WHERE slug = 'acme-inc';
  SELECT id INTO org_europe_cloud FROM public.organizations WHERE slug = 'europe-cloud';
  SELECT id INTO org_github FROM public.organizations WHERE slug = 'github';
  SELECT id INTO org_stanford FROM public.organizations WHERE slug = 'stanford';
  SELECT id INTO org_eleutherai FROM public.organizations WHERE slug = 'eleutherai';
  SELECT id INTO org_render FROM public.organizations WHERE slug = 'render-network';
  SELECT id INTO org_common_crawl FROM public.organizations WHERE slug = 'common-crawl';

  -- Insert assets
  INSERT INTO public.assets (
    external_id, slug, kind, name, version, summary, tags, license,
    eu_only, cc_on, p95_ms, cost_per_tok, proven_runs, owner_org_id
  ) VALUES
    (
      'mdl_mistral_7b', 
      'mistral-7b', 
      'MODEL', 
      'Mistral 7B Instruct', 
      'v0.2',
      'Fast, small LLM for chat & tools',
      ARRAY['chat', 'tools', 'llm'],
      'Apache 2.0',
      true,
      true,
      620,
      0.000002,
      1250,
      org_mistral_ai
    ),
    (
      'mdl_llama3_8b',
      'llama-3-8b',
      'MODEL',
      'Llama 3 8B',
      'v1.1',
      'General LLM 8B, fine-tunable',
      ARRAY['general', 'finetune', 'llm'],
      'Llama 3 Community',
      false,
      false,
      780,
      0.0000018,
      3420,
      org_meta
    ),
    (
      'ds_stackoverflow_2024',
      'stackoverflow-2024',
      'DATASET',
      'StackOverflow 2024 QA',
      '2024-09',
      'Cleaned Q/A pairs for RAG',
      ARRAY['code', 'rag', 'qa'],
      'CC BY-SA 4.0',
      false,
      false,
      NULL,
      NULL,
      0,
      org_community
    ),
    (
      'agt_support_helper',
      'support-helper',
      'AGENT',
      'Support Helper',
      'v0.7',
      'Ticket triage + canned replies',
      ARRAY['support', 'triage', 'automation'],
      'Commercial',
      true,
      true,
      540,
      0.0000025,
      890,
      org_acme_inc
    ),
    (
      'cmp_h100_ccon_fr',
      'h100-ccon-fr',
      'COMPUTE',
      'H100 CC-On (Paris)',
      'nvidia-24.09',
      'Attested confidential compute in EU',
      ARRAY['gpu', 'secure', 'nvidia'],
      'On-Demand',
      true,
      true,
      410,
      NULL,
      567,
      org_europe_cloud
    ),
    (
      'mdl_gpt4_vision',
      'gpt4-vision',
      'MODEL',
      'GPT-4 Vision',
      'v1.0',
      'Multimodal LLM with image understanding',
      ARRAY['vision', 'multimodal', 'gpt'],
      'Proprietary',
      false,
      false,
      1200,
      0.00001,
      8900,
      org_openai
    ),
    (
      'ds_imagenet_full',
      'imagenet-full',
      'DATASET',
      'ImageNet Full',
      '2024',
      '14M images, 21K categories',
      ARRAY['vision', 'classification', 'benchmark'],
      'ImageNet License',
      false,
      false,
      NULL,
      NULL,
      0,
      org_stanford
    ),
    (
      'agt_code_reviewer',
      'code-reviewer',
      'AGENT',
      'Code Reviewer Pro',
      'v2.1',
      'Automated PR review with security checks',
      ARRAY['code', 'security', 'devops'],
      'MIT',
      false,
      true,
      890,
      0.000003,
      2340,
      org_github
    ),
    (
      'mdl_whisper_large',
      'whisper-large-v3',
      'MODEL',
      'Whisper Large v3',
      'v3.0',
      'Speech-to-text in 99 languages',
      ARRAY['audio', 'stt', 'multilingual'],
      'MIT',
      false,
      false,
      2100,
      0.000006,
      4560,
      org_openai
    ),
    (
      'cmp_a100_depin',
      'a100-depin-network',
      'COMPUTE',
      'A100 DePIN Network',
      'v1.5',
      'Decentralized GPU compute mesh',
      ARRAY['depin', 'gpu', 'distributed'],
      'Utility Token',
      false,
      false,
      650,
      NULL,
      1890,
      org_render
    ),
    (
      'agt_eval_harness',
      'eval-harness',
      'AGENT',
      'Eval Harness Suite',
      'v1.3',
      'Automated LLM benchmarking',
      ARRAY['eval', 'benchmark', 'testing'],
      'Apache 2.0',
      false,
      false,
      1500,
      0.000004,
      678,
      org_eleutherai
    ),
    (
      'ds_common_crawl',
      'common-crawl-2024',
      'DATASET',
      'Common Crawl 2024',
      '2024-10',
      '250B tokens of web text',
      ARRAY['web', 'pretraining', 'corpus'],
      'Public Domain',
      false,
      false,
      NULL,
      NULL,
      0,
      org_common_crawl
    )
  ON CONFLICT (external_id) DO NOTHING;

END $$;

-- ============================================
-- 3. VERIFICATION
-- ============================================

DO $$
DECLARE
    org_count INT;
    asset_count INT;
BEGIN
    SELECT COUNT(*) INTO org_count FROM public.organizations;
    SELECT COUNT(*) INTO asset_count FROM public.assets;
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'MARKETPLACE SEED DATA COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Organizations: %', org_count;
    RAISE NOTICE 'Assets: %', asset_count;
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Sample marketplace data loaded successfully!';
    RAISE NOTICE '==================================================';
END $$;

-- View seeded data
SELECT 
  a.name,
  a.kind,
  a.version,
  o.display_name as org_name,
  a.proven_runs
FROM public.assets a
LEFT JOIN public.organizations o ON o.id = a.owner_org_id
ORDER BY a.created_at DESC;

-- ============================================
-- SEED DATA COMPLETE ✅
-- ============================================
-- Note: Materialized views were not created in ULTRA_SAFE schema
-- They are optional and can be added later if needed
