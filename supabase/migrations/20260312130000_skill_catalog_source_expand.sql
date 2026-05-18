-- Expand skill_catalog source constraint to allow external community sources
ALTER TABLE skill_catalog DROP CONSTRAINT skill_catalog_source_check;
ALTER TABLE skill_catalog ADD CONSTRAINT skill_catalog_source_check
  CHECK (source IN ('openclaw', 'manual', 'community', 'bankrbot'));
