'use client'

import { Button } from '@/components/ui/button'

interface ProjectBuilderStepActionsProps {
  pendingConnectionsCount: number
  onOpenConnectApps: () => void
  onSkipConnectApps: () => void
  isReady?: boolean
  onCreate?: () => void
  createLabel?: string
  createDisabled?: boolean
  disabled?: boolean
}

export function ProjectBuilderStepActions({
  pendingConnectionsCount,
  onOpenConnectApps,
  onSkipConnectApps,
  isReady = false,
  onCreate,
  createLabel = 'Create agent',
  createDisabled = false,
  disabled = false,
}: ProjectBuilderStepActionsProps) {
  if (pendingConnectionsCount === 0 && !isReady) return null
  const isConnectStep = pendingConnectionsCount > 0

  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {isConnectStep ? 'Set up selected apps' : 'Ready to create'}
        </p>
        <p className="text-xs text-muted-foreground">
          {isConnectStep
            ? pendingConnectionsCount === 1
              ? 'One selected app needs connection or account selection before it can run.'
              : `${pendingConnectionsCount} selected apps need connection or account selection before they can run.`
            : 'The guided setup is complete. Create now or keep refining from the panel.'}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isConnectStep ? (
          <>
            <Button type="button" size="sm" onClick={onOpenConnectApps} disabled={disabled}>
              Set up selected apps
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onSkipConnectApps} disabled={disabled}>
              Skip
            </Button>
          </>
        ) : null}
        {!isConnectStep && isReady && onCreate ? (
          <Button type="button" size="sm" onClick={onCreate} disabled={disabled || createDisabled}>
            {createLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
