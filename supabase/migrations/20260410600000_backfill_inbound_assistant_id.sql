-- Backfill assistant_id for inbound events where it is null
-- Root cause: webhook handlers inserted events without assistant_id,
-- causing claim_next_inbound_event (which JOINs on e.assistant_id) to skip them.

UPDATE assistant_inbound_events e
SET assistant_id = ac.assistant_id
FROM assistant_channels ac
WHERE e.channel_id = ac.id
  AND e.assistant_id IS NULL;

-- Add a DB-level trigger to auto-populate assistant_id on insert as a safety net
CREATE OR REPLACE FUNCTION public.inbound_event_set_assistant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assistant_id IS NULL AND NEW.channel_id IS NOT NULL THEN
    SELECT assistant_id INTO NEW.assistant_id
    FROM assistant_channels
    WHERE id = NEW.channel_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbound_event_set_assistant_id ON assistant_inbound_events;
CREATE TRIGGER trg_inbound_event_set_assistant_id
  BEFORE INSERT ON assistant_inbound_events
  FOR EACH ROW
  EXECUTE FUNCTION public.inbound_event_set_assistant_id();
