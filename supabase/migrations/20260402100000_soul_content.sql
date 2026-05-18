-- ============================================================================
-- SOUL System (Phase 2D)
--
-- Adds soul_content to ai_assistants for agent persona/identity.
-- SOUL is injected into the system prompt after instructions, providing
-- persistent personality, values, and behavioral identity that the agent
-- can self-modify via the soul_edit tool.
-- ============================================================================

ALTER TABLE ai_assistants ADD COLUMN IF NOT EXISTS soul_content TEXT;

COMMENT ON COLUMN ai_assistants.soul_content IS
  'Agent SOUL — persistent persona, values, and behavioral identity. Injected into system prompt. Editable by owner and by agent via soul_edit tool.';
