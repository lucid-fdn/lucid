-- Add engine column to ai_assistants
-- Engine = the agent loop framework (openclaw, langchain, crewai, etc.)
-- Distinct from infrastructure runtime (shared / dedicated / byo)
ALTER TABLE ai_assistants
  ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'openclaw';
