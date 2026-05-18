'use client'

import { EmptyState } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface Incident {
  id: string
  title: string
  description: string | null
  severity: string
  status: string
  started_at: string
  resolved_at: string | null
}

interface IncidentTimelineProps {
  incidents: Incident[]
}

export function IncidentTimeline({ incidents }: IncidentTimelineProps) {
  if (incidents.length === 0) {
    return (
      <EmptyState
        title="No incidents reported"
        description="All systems are operational."
        className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
      />
    )
  }

  return (
    <div className="space-y-2">
      {incidents.map((inc) => (
        <WorkspaceActionRow
          key={inc.id}
          title={inc.title}
          description={inc.description}
          tone={inc.severity === 'critical' ? 'danger' : 'warning'}
          meta={
            <>
              <div className="capitalize">{inc.status}</div>
              <div>
                {new Date(inc.started_at).toLocaleDateString()}{' '}
                {inc.resolved_at && `- Resolved ${new Date(inc.resolved_at).toLocaleDateString()}`}
              </div>
            </>
          }
        />
      ))}
    </div>
  )
}
