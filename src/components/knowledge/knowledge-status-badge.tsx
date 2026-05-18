import { Badge } from '@/components/ui/badge'
import type { KnowledgeManagerStatus } from '@/features/knowledge-manager/types'

const STATUS_LABELS: Record<KnowledgeManagerStatus, string> = {
  ready: 'Ready',
  indexing: 'Indexing',
  needs_review: 'Needs review',
  paused: 'Paused',
  failed: 'Failed',
  archived: 'Archived',
}

export function KnowledgeStatusBadge({ status }: { status: KnowledgeManagerStatus }) {
  const variant = status === 'failed' || status === 'needs_review' ? 'destructive' : status === 'ready' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>
}
