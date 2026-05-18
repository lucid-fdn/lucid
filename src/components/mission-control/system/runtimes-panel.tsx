'use client'

import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useRuntimes } from '@/hooks/use-runtimes'
import { isSelfHosted } from '@/lib/deployment-mode'
import { RuntimeCard } from './runtime-card'
import { EmptyState } from '../empty-state'
import { detectFleetIssues, countIssues } from '@/lib/mission-control/issue-detector'
import { Cloud, Server, AlertTriangle } from 'lucide-react'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface RuntimesPanelProps {
  orgId: string
  workspaceSlug?: string
}

export function RuntimesPanel({ orgId, workspaceSlug }: RuntimesPanelProps) {
  const router = useRouter()
  const { runtimes, refetch } = useRuntimes(orgId)
  const selfHosted = isSelfHosted()

  // Fleet-wide issue detection
  const fleetIssues = useMemo(() => detectFleetIssues(runtimes), [runtimes])
  const { warnings, criticals } = useMemo(() => countIssues(fleetIssues), [fleetIssues])

  const handleClick = useCallback((runtimeId: string) => {
    if (workspaceSlug) {
      router.push(`/${workspaceSlug}/mission-control/system/runtimes/${runtimeId}`)
    }
  }, [workspaceSlug, router])

  const handleRemove = useCallback(async (runtimeId: string) => {
    const confirmed = window.confirm('Revoke this runtime? All agents on it will become unreachable.')
    if (!confirmed) return

    await fetch(`/api/runtimes/${runtimeId}?org_id=${orgId}`, {
      method: 'DELETE',
    })
    refetch()
  }, [orgId, refetch])

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Runtimes</h3>
        {/* Fleet issue summary */}
        {(criticals > 0 || warnings > 0) && (
          <div className="flex items-center gap-2">
            {criticals > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                {criticals} critical
              </span>
            )}
            {warnings > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                {warnings} warning{warnings !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Default runtime (always shown) */}
      <WorkspaceActionRow
        title={selfHosted ? 'This Instance' : 'Lucid Cloud'}
        description="Always on"
        icon={selfHosted ? Server : Cloud}
        tone="success"
        className="mb-3"
      />

      {/* Dedicated runtimes */}
      {runtimes.length === 0 ? (
        <EmptyState
          icon={<Server className="h-6 w-6" />}
          title="No dedicated runtimes"
          description="Add a runtime to deploy agents on your own infrastructure."
          className="py-6"
        />
      ) : (
        <div className="space-y-3">
          {runtimes.map((rt) => (
            <RuntimeCard key={rt.id} runtime={rt} onRemove={handleRemove} onClick={workspaceSlug ? handleClick : undefined} />
          ))}
        </div>
      )}

    </section>
  )
}
