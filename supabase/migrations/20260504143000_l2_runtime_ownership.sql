-- Persist L2 passport ownership state separately from deployment identity.
-- Deployments can be wallet-optional for users while passports still keep
-- a valid wallet-shaped owner for L2/on-chain compatibility.

ALTER TABLE dedicated_runtimes
  ADD COLUMN IF NOT EXISTS l2_passport_owner TEXT,
  ADD COLUMN IF NOT EXISTS l2_owner_mode TEXT,
  ADD COLUMN IF NOT EXISTS l2_claim_status TEXT,
  ADD COLUMN IF NOT EXISTS l2_claimed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS l2_claimed_at TIMESTAMPTZ;

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_l2_owner_mode_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_l2_owner_mode_check
  CHECK (
    l2_owner_mode IS NULL
    OR l2_owner_mode IN ('user_wallet', 'workspace_custody', 'platform_default')
  );

ALTER TABLE dedicated_runtimes
  DROP CONSTRAINT IF EXISTS dedicated_runtimes_l2_claim_status_check;

ALTER TABLE dedicated_runtimes
  ADD CONSTRAINT dedicated_runtimes_l2_claim_status_check
  CHECK (
    l2_claim_status IS NULL
    OR l2_claim_status IN ('claimed', 'claimable')
  );

CREATE INDEX IF NOT EXISTS idx_runtimes_l2_owner_mode
  ON dedicated_runtimes (org_id, l2_owner_mode)
  WHERE l2_owner_mode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runtimes_l2_claim_status
  ON dedicated_runtimes (org_id, l2_claim_status)
  WHERE l2_claim_status IS NOT NULL;
