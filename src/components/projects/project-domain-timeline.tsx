import React from 'react'
import { Badge } from '@/components/ui/badge'

export interface ProjectDomainTimelineItem {
  id: string
  status: 'delivered' | 'reviewed' | 'blocked' | 'escalated' | 'completed'
  title: string
  detail: string
}

const STATUS_STYLES: Record<ProjectDomainTimelineItem['status'], string> = {
  delivered: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  reviewed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  blocked: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  escalated: 'bg-red-500/10 text-red-500 border-red-500/20',
  completed: 'bg-foreground/10 text-foreground border-border',
}

export function ProjectDomainTimeline({
  items,
}: {
  items: ProjectDomainTimelineItem[]
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No business-progress milestones yet. Once agents produce work, approvals, and outcomes, this project will read as delivered progress instead of raw receipts.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3">
          <div className="flex min-h-full flex-col items-center">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="mt-2 w-px flex-1 bg-border/60" />
          </div>
          <div className="rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                {item.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
