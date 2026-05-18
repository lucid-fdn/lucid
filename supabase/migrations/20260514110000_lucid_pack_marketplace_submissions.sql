-- Pack-native marketplace review lifecycle.
--
-- Workspace Pack import is private by default. Public/community publication
-- flows through this review table so we can require validation, safety scans,
-- quality evidence, and human approval before any Pack becomes globally
-- visible.

CREATE TABLE IF NOT EXISTS public.lucid_pack_marketplace_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES public.lucid_packs(id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'needs_changes', 'approved', 'rejected', 'withdrawn')),
  review_notes TEXT,
  quality_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lucid_pack_marketplace_submissions_quality_object
    CHECK (jsonb_typeof(quality_report) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lucid_pack_marketplace_submissions_pack
  ON public.lucid_pack_marketplace_submissions(org_id, pack_id);

CREATE INDEX IF NOT EXISTS idx_lucid_pack_marketplace_submissions_review_queue
  ON public.lucid_pack_marketplace_submissions(status, submitted_at DESC);

DROP TRIGGER IF EXISTS trg_lucid_pack_marketplace_submissions_updated_at
  ON public.lucid_pack_marketplace_submissions;
CREATE TRIGGER trg_lucid_pack_marketplace_submissions_updated_at
  BEFORE UPDATE ON public.lucid_pack_marketplace_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lucid_pack_marketplace_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY lucid_pack_marketplace_submissions_org_select
  ON public.lucid_pack_marketplace_submissions
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY lucid_pack_marketplace_submissions_service_all
  ON public.lucid_pack_marketplace_submissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
