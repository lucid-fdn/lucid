-- ============================================================================
-- Migration: 104_webhook_events_status_dedupe
-- Purpose: Widen webhook idempotency dedupe key to include event_type so that
--          legitimate state transitions for the same upstream object (e.g.
--          NOWPayments `partially_paid` → `finished`) are not collapsed to a
--          single dedupe slot. The previous (provider, event_id)-only key
--          would silently drop the terminal status webhook after an
--          intermediate one had been recorded, leaving subscriptions stuck.
--
-- Notes:
--   * `event_type` is already on the table (074) but was nullable. We backfill
--     to '' before tightening the constraint so existing rows remain unique.
--   * The lookup index is replaced with the wider one to keep query plans
--     using a covering index.
-- ============================================================================

-- 1. Backfill any null event_type rows so the unique constraint can apply.
UPDATE webhook_events
SET event_type = ''
WHERE event_type IS NULL;

-- 2. Deduplicate any rows that already share the widened key. This is mainly a
-- defensive upgrade path for environments that created webhook_events without
-- the original unique constraint or manually backfilled historical data.
DELETE FROM webhook_events older
USING webhook_events newer
WHERE older.provider = newer.provider
  AND older.event_id = newer.event_id
  AND older.event_type = newer.event_type
  AND older.id <> newer.id
  AND older.processed_at <= newer.processed_at;

-- 3. Make event_type NOT NULL going forward.
ALTER TABLE webhook_events
  ALTER COLUMN event_type SET DEFAULT '',
  ALTER COLUMN event_type SET NOT NULL;

-- 4. Replace the (provider, event_id) unique constraint with the wider one.
ALTER TABLE webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_event_id_key;

-- Some Postgres versions name the auto-generated constraint differently;
-- attempt the conventional name plus a defensive lookup.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'webhook_events'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (provider, event_id)';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE webhook_events DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE webhook_events
  ADD CONSTRAINT webhook_events_provider_event_id_event_type_key
  UNIQUE (provider, event_id, event_type);

-- 5. Update lookup index to match the new dedupe shape.
DROP INDEX IF EXISTS idx_webhook_events_lookup;
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
  ON webhook_events(provider, event_id, event_type);
