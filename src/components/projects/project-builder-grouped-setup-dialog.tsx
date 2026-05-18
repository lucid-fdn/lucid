'use client'

import * as React from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { ConfigSectionDialog } from '@/components/assistant/config-section-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LogoIcon } from '@/components/ui/logo-icon'

export interface ProjectBuilderGroupedSetupItem {
  id: string
  slug: string
  name: string
  category: string
  eyebrow?: string
  pendingLabel?: string
  connectedLabel?: string
  actionLabel?: string
  loadingLabel?: string
}

interface ProjectBuilderGroupedSetupDialogProps<TItem extends ProjectBuilderGroupedSetupItem> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  sectionId: string
  description: string
  helperText?: string
  emptyText: string
  items: TItem[]
  connectedItemIds: Set<string>
  loadingItemId: string | null
  onAction: (item: TItem) => void | Promise<void>
  renderItemDetail?: (item: TItem, state: { isConnected: boolean; isLoading: boolean }) => React.ReactNode
  onAllComplete?: () => void
  autoCloseDelayMs?: number
}

export function ProjectBuilderGroupedSetupDialog<TItem extends ProjectBuilderGroupedSetupItem>({
  open,
  onOpenChange,
  title,
  sectionId,
  description,
  helperText,
  emptyText,
  items,
  connectedItemIds,
  loadingItemId,
  onAction,
  renderItemDetail,
  onAllComplete,
  autoCloseDelayMs = 650,
}: ProjectBuilderGroupedSetupDialogProps<TItem>) {
  const [completedItems, setCompletedItems] = React.useState<TItem[]>([])
  const requiredItemIdsRef = React.useRef<Set<string>>(new Set())
  const hasCompletedRef = React.useRef(false)
  const itemsRef = React.useRef(items)

  React.useEffect(() => {
    itemsRef.current = items
  }, [items])

  React.useEffect(() => {
    if (!open) {
      requiredItemIdsRef.current = new Set()
      hasCompletedRef.current = false
      setCompletedItems([])
      return
    }

    if (requiredItemIdsRef.current.size === 0 && items.length > 0) {
      requiredItemIdsRef.current = new Set(items.map((item) => item.id))
    }
  }, [items, open])

  React.useEffect(() => {
    setCompletedItems((current) => {
      const nextCompletedItems = [...current]
      let changed = false

      for (const id of connectedItemIds) {
        if (nextCompletedItems.some((item) => item.id === id)) continue
        const item = itemsRef.current.find((candidate) => candidate.id === id)
        if (!item) continue
        nextCompletedItems.push(item)
        changed = true
      }

      return changed ? nextCompletedItems : current
    })
  }, [connectedItemIds])

  const displayedItems = React.useMemo(() => {
    const itemIds = new Set(items.map((item) => item.id))
    return [
      ...items,
      ...completedItems.filter((item) => !itemIds.has(item.id)),
    ]
  }, [completedItems, items])

  React.useEffect(() => {
    if (!open || hasCompletedRef.current || loadingItemId) return

    const requiredItemIds = requiredItemIdsRef.current
    if (requiredItemIds.size === 0) return

    const remainingItemIds = new Set(items.map((item) => item.id))
    const allComplete = Array.from(requiredItemIds).every((id) => (
      connectedItemIds.has(id) || !remainingItemIds.has(id)
    ))
    if (!allComplete) return

    hasCompletedRef.current = true
    const timeout = window.setTimeout(() => {
      onOpenChange(false)
      onAllComplete?.()
    }, autoCloseDelayMs)

    return () => window.clearTimeout(timeout)
  }, [
    autoCloseDelayMs,
    connectedItemIds,
    items,
    loadingItemId,
    onAllComplete,
    onOpenChange,
    open,
  ])

  return (
    <ConfigSectionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sectionId={sectionId}
      widthClassName="max-w-[720px] w-[90vw] max-h-[85vh]"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-foreground">{description}</p>
          {helperText ? (
            <p className="text-xs text-muted-foreground">{helperText}</p>
          ) : null}
        </div>

        {displayedItems.length > 0 ? (
          <div className="space-y-3">
            {displayedItems.map((item) => {
              const isLoading = loadingItemId === item.id
              const isConnected = connectedItemIds.has(item.id)
              const pendingLabel = item.pendingLabel ?? 'Needs setup'
              const connectedLabel = item.connectedLabel ?? 'Connected'
              const actionLabel = item.actionLabel ?? 'Connect'
              const loadingLabel = item.loadingLabel ?? 'Connecting'

              return (
                <div key={item.id} className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <LogoIcon slug={item.slug} category={item.category} size={20} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.eyebrow ? `${item.eyebrow} - ` : ''}{isConnected ? connectedLabel.toLowerCase() : pendingLabel.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isConnected ? 'default' : 'outline'}
                        className="rounded-full text-[10px]"
                      >
                        {isConnected ? connectedLabel : pendingLabel}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => { void onAction(item) }}
                        disabled={isLoading || isConnected}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            {loadingLabel}
                          </>
                        ) : isConnected ? (
                          <>
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            {connectedLabel}
                          </>
                        ) : (
                          actionLabel
                        )}
                      </Button>
                    </div>
                  </div>
                  {renderItemDetail ? renderItemDetail(item, { isConnected, isLoading }) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </ConfigSectionDialog>
  )
}
