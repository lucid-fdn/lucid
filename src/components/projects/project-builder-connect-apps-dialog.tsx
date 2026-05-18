'use client'

import * as React from 'react'

import {
  ProjectBuilderGroupedSetupDialog,
  type ProjectBuilderGroupedSetupItem,
} from '@/components/projects/project-builder-grouped-setup-dialog'
import { useOrgOAuthConnector } from '@/hooks/use-org-oauth-connector'
import type { BuilderPendingConnection } from '@/lib/ai/project-generation/builder-step-utils'

export interface ProjectBuilderConnectAppsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  pendingConnections: BuilderPendingConnection[]
  onConnected?: (providerId: string) => void | Promise<void>
  onConnectionSelected?: (providerId: string, connectionRowId: string) => void
  onAllConnected?: () => void
}

type ConnectAppSetupItem = ProjectBuilderGroupedSetupItem & {
  providerId: string
  providerName: string
  setupMode: 'connect' | 'choose_account'
  selectedConnectionRowId: string | null
  connectionOptions: BuilderPendingConnection['connectionOptions']
}

export function ProjectBuilderConnectAppsDialog({
  open,
  onOpenChange,
  orgId,
  pendingConnections,
  onConnected,
  onConnectionSelected,
  onAllConnected,
}: ProjectBuilderConnectAppsDialogProps) {
  const [locallySelectedConnectionIds, setLocallySelectedConnectionIds] = React.useState<Record<string, string>>({})
  const [chosenAccountProviderIds, setChosenAccountProviderIds] = React.useState<Set<string>>(() => new Set())
  const { connectingProviderId, connectedProviderIds, connectProvider } = useOrgOAuthConnector({
    orgId,
    onConnected,
  })

  const items = React.useMemo<ConnectAppSetupItem[]>(
    () => pendingConnections.map((item) => ({
      id: item.providerId,
      slug: item.slug,
      name: item.name,
      category: item.category,
      providerId: item.providerId,
      providerName: item.providerName,
      eyebrow: item.itemType === 'plugin' ? 'Integration' : 'Skill',
      pendingLabel: item.setupMode === 'choose_account' ? 'Choose account' : 'Needs connection',
      connectedLabel: 'Connected',
      actionLabel: item.setupMode === 'choose_account' ? 'Use account' : 'Connect',
      loadingLabel: 'Connecting',
      setupMode: item.setupMode,
      selectedConnectionRowId: locallySelectedConnectionIds[item.providerId] ?? item.selectedConnectionRowId,
      connectionOptions: item.connectionOptions,
    })),
    [locallySelectedConnectionIds, pendingConnections],
  )

  const completedItemIds = React.useMemo(() => {
    const ids = new Set(connectedProviderIds)
    for (const providerId of chosenAccountProviderIds) ids.add(providerId)
    return ids
  }, [chosenAccountProviderIds, connectedProviderIds])

  return (
    <ProjectBuilderGroupedSetupDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set up selected apps"
      sectionId="skills"
      description="Connect missing apps or choose which existing account this agent should use."
      helperText="App accounts are reusable at the workspace level; this step binds the selected account to this agent."
      emptyText="Everything selected here is already set up."
      items={items}
      connectedItemIds={completedItemIds}
      loadingItemId={connectingProviderId}
      onAction={(item) => {
        if (item.setupMode === 'choose_account') {
          const selectedConnectionRowId = item.selectedConnectionRowId ?? item.connectionOptions[0]?.id
          if (!selectedConnectionRowId) return
          onConnectionSelected?.(item.providerId, selectedConnectionRowId)
          setChosenAccountProviderIds((current) => {
            const next = new Set(current)
            next.add(item.providerId)
            return next
          })
          return
        }

        return connectProvider({
          providerId: item.providerId,
          providerName: item.providerName,
        })
      }}
      renderItemDetail={(item, state) => {
        if (item.setupMode !== 'choose_account' || state.isConnected) return null
        return (
          <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-2">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </label>
            <select
              value={item.selectedConnectionRowId ?? item.connectionOptions[0]?.id ?? ''}
              onChange={(event) => {
                const connectionRowId = event.target.value
                setLocallySelectedConnectionIds((current) => ({
                  ...current,
                  [item.providerId]: connectionRowId,
                }))
                onConnectionSelected?.(item.providerId, connectionRowId)
              }}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/60"
            >
              {item.connectionOptions.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.account_label ?? connection.account_id ?? connection.connection_id}
                </option>
              ))}
            </select>
          </div>
        )
      }}
      onAllComplete={onAllConnected}
    />
  )
}

export const AgentBuilderConnectAppsDialog = ProjectBuilderConnectAppsDialog
export type AgentBuilderConnectAppsDialogProps = ProjectBuilderConnectAppsDialogProps
