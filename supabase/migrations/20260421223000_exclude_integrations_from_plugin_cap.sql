-- Let OAuth integrations bypass the legacy assistant plugin cap.
-- The UI/API already treats kind='integration' separately from kind='plugin',
-- but the original trigger counted every assistant_plugin_activations row.

CREATE OR REPLACE FUNCTION check_max_active_plugins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count INT;
  new_kind TEXT;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT pc.kind INTO new_kind
  FROM org_plugin_installations opi
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE opi.id = NEW.installation_id;

  -- Integrations are managed separately and must not consume the hard plugin cap.
  IF COALESCE(new_kind, 'plugin') <> 'plugin' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO active_count
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE apa.assistant_id = NEW.assistant_id
    AND apa.is_active = true
    AND pc.kind = 'plugin'
    AND apa.id IS DISTINCT FROM NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 active plugins per assistant';
  END IF;

  RETURN NEW;
END;
$$;
