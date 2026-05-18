'use client'

import { BrainIntakeInput } from '@/components/brain-intake/brain-intake-input'
import type { KnowledgeManagerOverview } from '@/features/knowledge-manager/types'

interface KnowledgeBrainOverviewProps {
  overview: KnowledgeManagerOverview
  workspaceSlug: string
  workspaceId: string
  onOpenContext: () => void
  onOpenKnowledge: () => void
  onOpenHealth: () => void
  onRecall?: (query: string) => void
}

export function KnowledgeBrainOverview({
  overview: _overview,
  workspaceSlug: _workspaceSlug,
  workspaceId,
  onOpenContext: _onOpenContext,
  onOpenKnowledge: _onOpenKnowledge,
  onOpenHealth: _onOpenHealth,
  onRecall,
}: KnowledgeBrainOverviewProps) {
  return (
    <div className="space-y-5">
      <BrainIntakeInput
        orgId={workspaceId}
        scopeId={workspaceId}
        onRecall={onRecall}
      />
    </div>
  )
}
