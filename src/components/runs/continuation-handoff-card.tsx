import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { ContinuationHandoff } from '@/lib/runs/continuation'

export function ContinuationHandoffCard({
  handoff,
  emptyText = 'No explicit continuation handoff is needed right now.',
}: {
  handoff: ContinuationHandoff | null
  emptyText?: string
}) {
  if (!handoff) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{handoff.title}</p>
          <Badge variant="outline" className="border-border text-muted-foreground">
            {handoff.severity}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{handoff.detail}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium text-foreground">Next action</p>
        <p className="mt-2 text-xs text-muted-foreground">{handoff.nextAction}</p>
      </div>
    </div>
  )
}
