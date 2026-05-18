-- Phase 6: PM Mirroring + Approval Bridge indexes
-- Supports sweepUnmirroredWorkItems (Chunk 1) and approval bridge lookup (Chunk 5).

-- Unmirrored work items sweep: finds items with external_mirror set but no
-- corresponding work_item_external_refs row yet.
CREATE INDEX IF NOT EXISTS idx_human_work_items_unmirrored
  ON human_work_items (created_at)
  WHERE external_mirror IS NOT NULL
    AND status NOT IN ('done', 'cancelled', 'rejected');

-- Approval bridge lookup: resolving a work item linked to an mc_pending_approvals
-- row requires finding the mirror by approval_id stored in external_mirror JSONB.
CREATE INDEX IF NOT EXISTS idx_human_work_items_approval_mirror
  ON human_work_items ((external_mirror->>'approval_id'))
  WHERE external_mirror IS NOT NULL
    AND external_mirror->>'approval_id' IS NOT NULL;
