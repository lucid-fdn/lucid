'use client'
import { Tag } from 'lucide-react'
import { EmptyState, PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface TopicClustersProps {
  topics: Array<{ cluster_label: string; conversation_count: number }>
}

export function TopicClusters({ topics }: TopicClustersProps) {
  return (
    <PageSection
      title="Top Topics (7d)"
      actions={<Tag className="h-4 w-4 text-muted-foreground" />}
    >
      {topics.length > 0 ? (
        <div className="space-y-1.5">
          {topics.map((t) => (
            <WorkspaceActionRow
              key={t.cluster_label}
              title={t.cluster_label}
              meta={<span className="tabular-nums">{t.conversation_count}</span>}
              className="py-2"
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No topic clusters yet"
          description="Data populates after conversations are analyzed."
          className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
        />
      )}
    </PageSection>
  )
}
