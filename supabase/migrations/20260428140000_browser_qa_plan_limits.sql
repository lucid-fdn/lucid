-- Browser QA plan-tier limits.
--
-- Worker gateways use these optional plan limits when available and fall back
-- to BROWSER_QA_MAX_* env defaults for self-hosted/local deployments.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plans'
  ) THEN
    UPDATE public.plans
    SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
      'browser_qa_sessions_per_run', 10,
      'browser_qa_screenshots_per_run', 30
    )
    WHERE name = 'starter';

    UPDATE public.plans
    SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
      'browser_qa_sessions_per_run', 50,
      'browser_qa_screenshots_per_run', 200
    )
    WHERE name = 'pro';

    UPDATE public.plans
    SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
      'browser_qa_sessions_per_run', -1,
      'browser_qa_screenshots_per_run', -1
    )
    WHERE name = 'business';
  END IF;
END $$;
