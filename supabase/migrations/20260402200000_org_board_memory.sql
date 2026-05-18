-- Board Memory — persistent org-level knowledge shared across all agents.
-- Reuses the same patterns as assistant_memory (vector search, encryption, dedup).

CREATE TABLE IF NOT EXISTS org_board_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Content (same mutually-exclusive pattern as assistant_memory)
  content TEXT,
  content_encrypted BYTEA,
  embedding vector(1536),
  content_hash TEXT,

  -- Metadata
  category TEXT NOT NULL DEFAULT 'insight'
    CHECK (category IN ('insight', 'policy', 'alert', 'context')),
  importance NUMERIC(3,2) NOT NULL DEFAULT 0.7
    CHECK (importance >= 0 AND importance <= 1),

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  source TEXT DEFAULT 'operator',  -- 'operator' | 'agent' | 'system'
  source_agent_id UUID REFERENCES ai_assistants(id) ON DELETE SET NULL,

  -- Lifecycle
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Encryption invariant (same as assistant_memory)
  CONSTRAINT board_memory_content_xor CHECK (
    (content IS NOT NULL AND content_encrypted IS NULL) OR
    (content IS NULL AND content_encrypted IS NOT NULL)
  ),

  -- Dedup within org
  CONSTRAINT board_memory_unique_hash UNIQUE (org_id, content_hash)
);

-- Indexes — matches RPC sort order (importance DESC, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_board_memory_org_active
  ON org_board_memory (org_id, importance DESC, created_at DESC)
  WHERE NOT is_archived;

CREATE INDEX IF NOT EXISTS idx_board_memory_embedding
  ON org_board_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- RPC: Get recent board memories for an org (simple recency, no vector search).
-- Pure read — no write-on-read side-effect (avoids write amplification).
-- SECURITY DEFINER with explicit membership guard to prevent cross-tenant reads.
CREATE OR REPLACE FUNCTION get_board_memories(
  p_org_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance NUMERIC,
  source TEXT,
  source_agent_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: caller must be a member of the target org (or service role)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.content,
      bm.category,
      bm.importance,
      bm.source,
      bm.source_agent_id,
      bm.created_at
    FROM org_board_memory bm
    WHERE bm.org_id = p_org_id
      AND bm.is_archived = false
      AND bm.content IS NOT NULL
    ORDER BY bm.importance DESC, bm.created_at DESC
    LIMIT p_limit;
END;
$$;

-- RLS
ALTER TABLE org_board_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_memory_org_read ON org_board_memory
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY board_memory_org_write ON org_board_memory
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY board_memory_org_update ON org_board_memory
  FOR UPDATE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY board_memory_org_delete ON org_board_memory
  FOR DELETE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
