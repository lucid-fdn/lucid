CREATE INDEX IF NOT EXISTS idx_knowledge_import_items_org_content_hash
  ON knowledge_import_items(org_id, content_hash);
