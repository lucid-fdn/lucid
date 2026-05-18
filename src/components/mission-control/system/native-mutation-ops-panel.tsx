'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock3, GitBranch } from 'lucide-react'
import { KPICard } from '@/components/mission-control/kpi-card'
import { Button } from '@/components/ui/button'
import type { NativeMutationOpsSummary } from '@/lib/db/mission-control'
import { getNativeMutationOpsHealth } from '@/lib/mission-control/native-mutations'

interface ProposedChangesOpsPanelProps {
  workspaceSlug: string
  summary: NativeMutationOpsSummary
}

export function ProposedChangesOpsPanel({ workspaceSlug, summary }: ProposedChangesOpsPanelProps) {
  const health = getNativeMutationOpsHealth(summary)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Proposed changes</h3>
          <p className="text-xs text-muted-foreground">
            Backlog and promotion health for memory and skill changes.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${workspaceSlug}/mission-control/mutations`}>Open queue</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KPICard label="Pending" value={summary.pendingCount} icon={Clock3} variant={health.backlogVariant} />
        <KPICard label="Reviewed 24h" value={summary.reviewedLast24h} icon={CheckCircle2} />
        <KPICard label="Promoted 24h" value={summary.promotedLast24h} icon={GitBranch} variant="success" />
        <KPICard label="Failures 24h" value={summary.failedLast24h} icon={AlertTriangle} variant={health.failureVariant} />
      </div>
    </section>
  )
}
