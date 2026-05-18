'use client'
import { EmptyState } from '@/components/page'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { cn } from '@/lib/utils'

interface Experiment {
  id: string
  name: string
  description: string | null
  variable_type: string
  split_pct: number
  status: string
  winner: string | null
  created_at: string
}

interface ExperimentListProps {
  experiments: Experiment[]
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-green-500/15 text-green-400',
  paused: 'bg-yellow-500/15 text-yellow-400',
  completed: 'bg-blue-500/15 text-blue-400',
}

export function ExperimentList({ experiments }: ExperimentListProps) {
  if (experiments.length === 0) {
    return (
      <EmptyState
        title="No experiments yet"
        description="Prompt, model, and variable experiments will appear here when configured."
      />
    )
  }

  return (
    <ScrollArea className="max-h-[600px]">
      <div className="space-y-2">
        {experiments.map((exp) => (
          <WorkspaceActionRow
            key={exp.id}
            title={exp.name}
            description={exp.description}
            tone={
              exp.status === 'running'
                ? 'success'
                : exp.status === 'paused'
                  ? 'warning'
                  : 'default'
            }
            meta={
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] capitalize',
                  STATUS_STYLES[exp.status] ?? STATUS_STYLES.draft,
                )}
              >
                {exp.status}
              </span>
            }
          >
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
              <span>Variable: {exp.variable_type}</span>
              <span>Split: {exp.split_pct}%</span>
              {exp.winner && <span>Winner: {exp.winner}</span>}
            </div>
          </WorkspaceActionRow>
        ))}
      </div>
    </ScrollArea>
  )
}
