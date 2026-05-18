'use client'

import { ClipboardCheck, RefreshCw } from 'lucide-react'

import { EmptyState } from '@/components/mission-control/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AgentOpsWorkflowPickerItem {
  id: string
  name: string
  promise: string
  executionMode: string
  safetyMode: string
  evidenceTypes: string[]
}

export function WorkflowPicker({
  title = 'Run a check',
  description,
  variant = 'sidebar',
  workflows,
  selectedWorkflowId,
  loading,
  totalCount,
  onSelectWorkflow,
  onRefresh,
  onOpenCatalog,
}: {
  title?: string
  description?: string
  variant?: 'sidebar' | 'panel'
  workflows: AgentOpsWorkflowPickerItem[]
  selectedWorkflowId?: string | null
  loading: boolean
  totalCount?: number
  onSelectWorkflow: (workflowId: string) => void
  onRefresh?: () => void
  onOpenCatalog?: () => void
}) {
  return (
    <section
      className={cn(
        variant === 'sidebar'
          ? 'min-h-0 border-r bg-background/80'
          : 'rounded-2xl border bg-background/80',
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {onRefresh ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh Agent Ops"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        ) : null}
      </div>
      <div className={cn('min-h-0 space-y-2 overflow-y-auto p-3', variant === 'panel' && 'max-h-[520px]')}>
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-muted/60" />
          ))
        ) : workflows.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="No workflows"
            description="No launchable checks were returned."
          />
        ) : (
          workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => onSelectWorkflow(workflow.id)}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent/50',
                selectedWorkflowId === workflow.id
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{workflow.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {workflow.promise}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {formatExecutionMode(workflow.executionMode)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {formatSafetyMode(workflow.safetyMode)}
                </Badge>
                {workflow.evidenceTypes.slice(0, 1).map((type) => (
                  <Badge key={type} variant="outline" className="text-[10px]">
                    {formatLabel(type)}
                  </Badge>
                ))}
              </div>
            </button>
          ))
        )}

        {onOpenCatalog && totalCount && totalCount > workflows.length ? (
          <Button type="button" variant="outline" className="mt-2 w-full rounded-full" onClick={onOpenCatalog}>
            View all {totalCount} checks
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function formatExecutionMode(value: string): string {
  if (value === 'dag') return 'Workflow'
  if (value === 'single') return 'Single run'
  return formatLabel(value)
}

function formatSafetyMode(value: string): string {
  if (value === 'approval_gated') return 'Approval'
  if (value === 'read_only') return 'Read-only'
  return formatLabel(value)
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
