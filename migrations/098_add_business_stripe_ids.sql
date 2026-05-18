-- ============================================================================
-- Add Stripe Product/Price IDs for Business Plan
-- ============================================================================
-- Product: prod_UCUaNfNrshBTy4 (Business - $99/mo, $990/yr)
-- Created via Stripe CLI on 2026-03-23
-- ============================================================================

UPDATE plans
SET
  stripe_product_id = 'prod_UCUaNfNrshBTy4',
  stripe_price_monthly_id = 'price_1TE5bMGf7at13DuTbvLF0pdx',
  stripe_price_yearly_id = 'price_1TE5bbGf7at13DuTOG9sMAL4'
WHERE name = 'business';

-- Verify both plans have Stripe IDs configured
SELECT
  name,
  display_name,
  price_monthly_usd / 100.0 AS monthly_price,
  price_yearly_usd / 100.0 AS yearly_price,
  stripe_product_id,
  stripe_price_monthly_id,
  stripe_price_yearly_id
FROM plans
WHERE name IN ('pro', 'business')
ORDER BY sort_order;
