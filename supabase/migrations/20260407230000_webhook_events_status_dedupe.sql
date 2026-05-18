-- ============================================================================
-- Migration: 20260407230000_webhook_events_status_dedupe
-- Purpose: Widen webhook idempotency dedupe key to include event_type so that
--          legitimate state transitions for the same upstream object (e.g.
--          NOWPayments `partially_paid` → `finished`) are not collapsed to a
--          single dedupe slot. The previous (provider, event_id)-only key
--          would silently drop the terminal status webhook after an
--          intermediate one had been recorded, leaving subscriptions stuck.
--
-- Notes:
--   * Mirror of raw SQL migrations/104_webhook_events_status_dedupe.sql so
--     it is tracked by supabase migration list and reproducible across
--     environments.
--   * `event_type` already exists on the table but was nullable. We backfill
--     to '' before tightening the constraint so existing rows remain unique.
--   * The lookup index is replaced with the wider one to keep query plans
--     using a covering index.
-- ============================================================================

DO $$
DECLARE
  conname text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhook_events'
  ) THEN
    -- 1. Backfill any null event_type rows so the unique constraint can apply.
    UPDATE webhook_events
    SET event_type = ''
    WHERE event_type IS NULL;

    -- 2. Deduplicate any rows that already share the widened key. Defensive.
    --    Use row_number() over the dedupe key so a single row always survives,
    --    even when processed_at ties (the previous self-join with `<=` would
    --    delete BOTH rows on a tie and lose the only record of that event).
    DELETE FROM webhook_events
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               row_number() OVER (
                 PARTITION BY provider, event_id, event_type
                 ORDER BY processed_at DESC NULLS LAST, id DESC
               ) AS rn
        FROM webhook_events
      ) ranked
      WHERE rn > 1
    );

    -- 3. Make event_type NOT NULL going forward.
    ALTER TABLE webhook_events
      ALTER COLUMN event_type SET DEFAULT '',
      ALTER COLUMN event_type SET NOT NULL;

    -- 4. Replace the (provider, event_id) unique constraint with the wider one.
    ALTER TABLE webhook_events
      DROP CONSTRAINT IF EXISTS webhook_events_provider_event_id_key;

    -- Some Postgres versions name the auto-generated constraint differently;
    -- attempt the conventional name plus a defensive lookup.
    SELECT c.conname INTO conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'webhook_events'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (provider, event_id)';
    IF conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE webhook_events DROP CONSTRAINT %I', conname);
    END IF;

    -- Idempotency guard: if the widened constraint already exists (e.g. from a
    -- prior manual apply of migrations/104), skip the ADD.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'webhook_events'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) = 'UNIQUE (provider, event_id, event_type)'
    ) THEN
      ALTER TABLE webhook_events
        ADD CONSTRAINT webhook_events_provider_event_id_event_type_key
        UNIQUE (provider, event_id, event_type);
    END IF;

    -- 5. Update lookup index to match the new dedupe shape.
    DROP INDEX IF EXISTS idx_webhook_events_lookup;
    CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
      ON webhook_events(provider, event_id, event_type);
  END IF;
END $$;
