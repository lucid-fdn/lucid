-- Retire the pre-Pack template catalog.
--
-- Lucid Pack installs and managed resources are now the canonical template
-- lifecycle. We have no customer dependency on the old catalog tables, so this
-- migration removes the obsolete schema instead of keeping a compatibility
-- shadow around forever.

DROP TABLE IF EXISTS public.template_evals CASCADE;
DROP TABLE IF EXISTS public.template_ratings CASCADE;
DROP TABLE IF EXISTS public.template_deployments CASCADE;
DROP TABLE IF EXISTS public.template_catalog CASCADE;

DROP FUNCTION IF EXISTS public.increment_template_install_count(UUID);
DROP FUNCTION IF EXISTS public.set_template_catalog_updated_at();
DROP FUNCTION IF EXISTS public.set_template_ratings_updated_at();

ALTER TABLE IF EXISTS public.template_product_events
  DROP CONSTRAINT IF EXISTS template_product_events_backing_kind_check;

ALTER TABLE IF EXISTS public.template_product_events
  ADD CONSTRAINT template_product_events_backing_kind_check
  CHECK (backing_kind IS NULL OR backing_kind = 'lucid_pack');
