'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Lightbulb } from 'lucide-react'
import { EmptyState, PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface Insight {
  id: string
  insight_type: string
  title: string
  body: string
  severity: string
  created_at: string
}

interface AIInsightsPanelProps {
  insights: Insight[]
}

export function AIInsightsPanel({ insights }: AIInsightsPanelProps) {
  return (
    <PageSection
      title="AI Insights"
      actions={<Lightbulb className="h-4 w-4 text-muted-foreground" />}
    >
      {insights.length > 0 ? (
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1.5">
            {insights.map((insight) => (
              <WorkspaceActionRow
                key={insight.id}
                title={insight.title}
                description={insight.body}
                tone={insight.severity === 'action_required' || insight.severity === 'warning' ? 'warning' : 'default'}
                meta={new Date(insight.created_at).toLocaleDateString()}
              />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <EmptyState
          title="No insights yet"
          description="AI-generated insights appear after sufficient conversation data."
          className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
        />
      )}
    </PageSection>
  )
}
