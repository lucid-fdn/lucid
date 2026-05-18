-- Migration 088: Capability-based policy support
--
-- Adds documentation and a migration helper for transitioning from
-- tool-name-based allowlists to capability-based policy.
--
-- The policy_config JSONB column already exists (migration 058).
-- This migration adds a comment documenting the new capabilities format
-- and provides a helper function to migrate existing assistants.
--
-- OLD format: { "allowed_tools": ["dex_swap", "wallet_transfer", ...] }
-- NEW format: { "capabilities": ["execute:swap", "execute:transfer", ...] }
--
-- Both formats are supported simultaneously by CommandsAllowlist.
-- The new format is preferred for new assistants.

-- Document the capabilities format
COMMENT ON COLUMN ai_assistants.policy_config IS
  'Tool policy configuration (JSONB). Supports two formats:
   NEW (preferred): { "capabilities": ["execute:swap", "execute:transfer", "execute:perpetuals", "execute:orders"] }
   OLD (backwards compat): { "allowed_tools": ["dex_swap", "wallet_transfer", ...] }
   EMPTY/NULL: all tools enabled (backwards compat).

   Available capabilities:
     read:wallet, read:price, read:portfolio, read:history, read:quote (auto-granted, safe)
     reason:risk, reason:snapshot (auto-granted, safe)
     schedule, messaging, subagent, content, code (auto-granted, safe)
     execute:swap (elevated — dex_swap)
     execute:transfer (elevated — wallet_transfer)
     execute:perpetuals (elevated — hl_place_order, hl_cancel_order, hl_account_info)
     execute:orders (elevated — limit_order, dca_create, stop_loss, bridge)

   Safe capabilities are always granted. Only elevated capabilities need explicit grant.';

-- Helper function to migrate an assistant from allowed_tools to capabilities
CREATE OR REPLACE FUNCTION migrate_policy_to_capabilities(p_assistant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  current_config JSONB;
  allowed_tools TEXT[];
  new_capabilities TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT policy_config INTO current_config
  FROM ai_assistants WHERE id = p_assistant_id;

  -- Already migrated or no config
  IF current_config IS NULL OR current_config ? 'capabilities' THEN
    RETURN current_config;
  END IF;

  -- No allowed_tools — means all tools enabled
  IF NOT (current_config ? 'allowed_tools') THEN
    -- Grant all elevated capabilities (matches old "all tools" behavior)
    new_capabilities := ARRAY['execute:swap', 'execute:transfer', 'execute:perpetuals', 'execute:orders'];
    RETURN jsonb_build_object('capabilities', to_jsonb(new_capabilities));
  END IF;

  -- Map tool names to capabilities
  allowed_tools := ARRAY(SELECT jsonb_array_elements_text(current_config -> 'allowed_tools'));

  IF 'dex_swap' = ANY(allowed_tools) THEN
    new_capabilities := array_append(new_capabilities, 'execute:swap');
  END IF;
  IF 'wallet_transfer' = ANY(allowed_tools) THEN
    new_capabilities := array_append(new_capabilities, 'execute:transfer');
  END IF;
  IF 'hl_place_order' = ANY(allowed_tools) OR 'hl_cancel_order' = ANY(allowed_tools) THEN
    new_capabilities := array_append(new_capabilities, 'execute:perpetuals');
  END IF;
  IF 'limit_order' = ANY(allowed_tools) OR 'dca_create' = ANY(allowed_tools)
     OR 'stop_loss' = ANY(allowed_tools) OR 'bridge' = ANY(allowed_tools) THEN
    new_capabilities := array_append(new_capabilities, 'execute:orders');
  END IF;

  -- Update the assistant
  UPDATE ai_assistants
  SET policy_config = jsonb_build_object('capabilities', to_jsonb(new_capabilities))
  WHERE id = p_assistant_id;

  RETURN jsonb_build_object('capabilities', to_jsonb(new_capabilities));
END;
$$;

-- Batch migration: run this to migrate all existing assistants
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT id FROM ai_assistants WHERE policy_config ? 'allowed_tools' LOOP
--     PERFORM migrate_policy_to_capabilities(r.id);
--   END LOOP;
--   RAISE NOTICE 'Migration complete';
-- END;
-- $$;
