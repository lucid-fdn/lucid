/**
 * Node Action Selector
 * 
 * Zapier-style action selector that opens when user clicks a node on canvas.
 * Shows available resources and their operations grouped by category.
 */

'use client'

import React, { useState, useMemo } from 'react'
import Image from 'next/image'
import { useNodeActions, type NodeAction, type NodeResource } from '@/hooks/use-node-actions'
import { DialogWithSidebar } from '@/ui/components/dialog-with-sidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config'

interface NodeActionSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: {
    id: string
    data: {
      label: string
      definition?: Record<string, unknown>
      icon?: string
      iconUrl?: string | { light: string; dark: string }
    }
  } | null
  onSelectAction: (action: { 
    resource: string
    operation: string
    action: NodeAction
    parameters?: Record<string, unknown>
    settings?: {
      alwaysOutputData: boolean
      executeOnce: boolean
      retryOnFail: boolean
      onError: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput'
      notes: string
      displayNoteInFlow: boolean
    }
  }) => void
}

export function NodeActionSelector({
  open,
  onOpenChange,
  node,
  onSelectAction
}: NodeActionSelectorProps) {
  const [search, setSearch] = useState('')

  // Parse actions from node definition
  const { resources, isLoading, error } = useNodeActions(node?.data?.definition)
  
  // Track if we've already auto-skipped to prevent duplicate calls
  const hasAutoSkippedRef = React.useRef(false)

  // Filter actions by search
  const filteredResources = useMemo(() => {
    if (!search.trim()) return resources
    
    const query = search.toLowerCase()
    return resources
      .map(resource => ({
        ...resource,
        actions: resource.actions.filter(action =>
          action.name.toLowerCase().includes(query) ||
          action.action.toLowerCase().includes(query) ||
          action.description?.toLowerCase().includes(query)
        )
      }))
      .filter(resource => resource.actions.length > 0)
  }, [resources, search])

  // Count total actions
  const totalActions = resources.reduce((sum, r) => sum + r.actions.length, 0)

  // Auto-skip action selector if node has no actions (triggers, webhooks, AI agents, etc)
  // Use useEffect to avoid hooks violation and prevent duplicate calls
  const hasNoActions = !isLoading && resources.length === 0 && !error
  
  React.useEffect(() => {
    if (hasNoActions && node && open && !hasAutoSkippedRef.current) {
      console.log('[NodeActionSelector] 🔄 Auto-skipping for node with no actions:', {
        nodeLabel: node.data.label,
        hasNoActions,
        isLoading,
        resourcesLength: resources.length,
        error
      })
      
      hasAutoSkippedRef.current = true
      
      onSelectAction({
        resource: 'default',
        operation: 'default',
        action: {
          name: node.data.label,
          value: 'default',
          action: node.data.label
        },
        parameters: {},
        settings: {
          alwaysOutputData: false,
          executeOnce: false,
          retryOnFail: false,
          onError: 'stopWorkflow',
          notes: '',
          displayNoteInFlow: false
        }
      })
      onOpenChange(false)
    }
  }, [hasNoActions, node, open, isLoading, resources.length, error, onSelectAction, onOpenChange])
  
  // Reset ref when dialog closes
  React.useEffect(() => {
    if (!open) {
      hasAutoSkippedRef.current = false
    }
  }, [open])

  if (!node) {
    console.log('[NodeActionSelector] ❌ No node provided')
    return null
  }

  // Handle action selection - directly add to canvas
  const handleActionClick = (action: { resource: string; operation: string; action: NodeAction }) => {
    onSelectAction({
      resource: action.resource,
      operation: action.operation,
      action: action.action,
      parameters: {},  // Empty parameters
      settings: {      // Default settings
        alwaysOutputData: false,
        executeOnce: false,
        retryOnFail: false,
        onError: 'stopWorkflow',
        notes: '',
        displayNoteInFlow: false
      }
    })
  }

  return (
    <DialogWithSidebar
      open={open}
      onOpenChange={onOpenChange}
      title={node.data.label}
      description={`Select an action for ${node.data.label}`}
      showBreadcrumb={false}
    >
      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${node.data.label} Actions...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState error={error} />
      ) : filteredResources.length === 0 ? (
        <EmptyState search={search} onClearSearch={() => setSearch('')} />
      ) : (
        <div className="space-y-6">
          {filteredResources.map((resource) => (
            <ActionGroup
              key={resource.value}
              resource={resource}
              nodeIcon={node.data.iconUrl || node.data.icon}
              onSelectAction={(action) => {
                handleActionClick({
                  resource: resource.value,
                  operation: action.value,
                  action
                })
              }}
            />
          ))}

          {/* Footer */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {totalActions} action{totalActions !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
      )}
    </DialogWithSidebar>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface ActionGroupProps {
  resource: NodeResource
  nodeIcon?: string | { light: string; dark: string }
  onSelectAction: (action: NodeAction) => void
}

function ActionGroup({ resource, nodeIcon, onSelectAction }: ActionGroupProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {resource.name} Actions
      </h3>
      <div className="space-y-1">
        {resource.actions.map((action) => (
          <button
            key={action.value}
            onClick={() => onSelectAction(action)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
              'border border-border bg-background',
              'hover:bg-accent hover:border-accent-foreground/20',
              'transition-all duration-120',
              'text-left'
            )}
          >
            {/* Node icon */}
            <div className="flex-shrink-0">
              {nodeIcon ? (
                typeof nodeIcon === 'object' && 'light' in nodeIcon ? (
                  <Image
                    src={getLucidL2IconUrl(nodeIcon.light)}
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 object-contain"
                    unoptimized
                  />
                ) : typeof nodeIcon === 'string' && !nodeIcon.startsWith('fa:') ? (
                  <Image
                    src={getLucidL2IconUrl(nodeIcon)}
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 object-contain"
                    unoptimized
                  />
                ) : nodeIcon.startsWith('fa:') ? (
                  <i className={`fa fa-${nodeIcon.replace('fa:', '')} text-sm`} />
                ) : (
                  <span className="text-base">⚡</span>
                )
              ) : (
                <span className="text-base">⚡</span>
              )}
            </div>

            {/* Action info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground">
                {action.action || action.name}
              </div>
              {action.description && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {action.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="space-y-1">
            {[...Array(3)].map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
      <p className="text-sm text-destructive mb-2">Failed to load actions</p>
      <p className="text-xs text-muted-foreground">{error}</p>
    </div>
  )
}

function EmptyState({ search, onClearSearch }: { search: string; onClearSearch: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
      <p className="text-sm text-muted-foreground mb-2">
        {search ? `No actions found for "${search}"` : 'No actions available'}
      </p>
      {search && (
        <Button variant="ghost" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      )}
    </div>
  )
}
