-- ============================================================================
-- Update Stripe Product IDs for Pro Plan
-- ============================================================================
-- Product ID: prod_TEExjL9RP09vXE
-- 
-- TODO: Replace the price IDs below with your actual Stripe Price IDs
-- You can find them in:
-- Stripe Dashboard → Products → Professional Plan → Prices
-- ============================================================================

UPDATE plans 
SET 
  stripe_product_id = 'prod_TEExjL9RP09vXE',
  stripe_price_monthly_id = 'price_1SHmTuGf7at13DuTHEXugdjh',
  stripe_price_yearly_id = 'price_1SHmTuGf7at13DuTmhdtNlgd'
WHERE name = 'pro';

-- Verify the update
SELECT 
  name,
  display_name,
  price_monthly_usd / 100.0 as monthly_price,
  price_yearly_usd / 100.0 as yearly_price,
  stripe_product_id,
  stripe_price_monthly_id,
  stripe_price_yearly_id
FROM plans
WHERE name = 'pro';

-- Expected output:
-- name | display_name  | monthly_price | yearly_price | stripe_product_id      | stripe_price_monthly_id | stripe_price_yearly_id
-- -----+---------------+---------------+--------------+------------------------+-------------------------+------------------------
-- pro  | Professional  | 29.00         | 290.00       | prod_TEExjL9RP09vXE   | price_xxxxx             | price_yyyyy
