'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────

export interface PanelConfig {
  id: string
  /** Default size as percentage (e.g. 20 = 20%) */
  defaultSize: number
  minSize?: number
  maxSize?: number
  collapsible?: boolean
  collapsedSize?: number
  content: ReactNode
}

interface ResizablePanelLayoutProps {
  panels: PanelConfig[]
  /** Direction — default horizontal (side-by-side) */
  direction?: 'horizontal' | 'vertical'
  /** localStorage key for persisting sizes */
  autoSaveId?: string
  className?: string
}

// ── Drag Handle ────────────────────────────────────────────────────

function DragHandle({ direction = 'horizontal' }: { direction?: 'horizontal' | 'vertical' }) {
  const isVertical = direction === 'vertical'

  return (
    <Separator
      className={cn(
        'group relative flex items-center justify-center',
        'transition-colors duration-120',
        isVertical
          ? 'h-1.5 w-full hover:bg-accent/40 active:bg-blue-500/10'
          : 'w-1.5 h-full hover:bg-accent/40 active:bg-blue-500/10',
      )}
    >
      {/* Visual grip indicator */}
      <div
        className={cn(
          'rounded-full transition-all duration-120 pointer-events-none',
          'bg-border group-hover:bg-muted-foreground group-active:bg-blue-400',
          'group-active:shadow-[0_0_6px_rgba(96,165,250,0.4)]',
          isVertical ? 'h-0.5 w-8 group-hover:w-12' : 'w-0.5 h-8 group-hover:h-12',
        )}
      />
    </Separator>
  )
}

// ── Main Layout ────────────────────────────────────────────────────

export function ResizablePanelLayout({
  panels,
  direction = 'horizontal',
  autoSaveId,
  className,
}: ResizablePanelLayoutProps) {
  const defaultLayoutMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const panel of panels) {
      map[panel.id] = panel.defaultSize
    }
    return map
  }, [panels])

  // Defer localStorage access until after hydration to avoid SSR/client mismatch.
  // Server and first client render both use noopStorage → identical output.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const noopStorage = useMemo(
    () => ({
      getItem: () => null,
      setItem: () => {},
    }),
    [],
  )

  const safeStorage = useMemo(() => {
    if (!autoSaveId || !mounted) return noopStorage
    return localStorage
  }, [autoSaveId, mounted, noopStorage])

  const persistedLayout = useDefaultLayout({
    id: autoSaveId ?? '__no-persist__',
    storage: safeStorage,
  })

  // Build flat children array — Panel and Separator must be direct children of Group
  const children: ReactNode[] = []
  panels.forEach((panel, i) => {
    if (i > 0) {
      children.push(<DragHandle key={`sep-${panel.id}`} direction={direction} />)
    }
    children.push(
      <Panel
        key={panel.id}
        id={panel.id}
        defaultSize={`${panel.defaultSize}%`}
        minSize={`${panel.minSize ?? 10}%`}
        maxSize={panel.maxSize ? `${panel.maxSize}%` : undefined}
        collapsible={panel.collapsible}
        collapsedSize={panel.collapsedSize != null ? `${panel.collapsedSize}%` : undefined}
      >
        <div className="h-full w-full overflow-hidden">
          {panel.content}
        </div>
      </Panel>
    )
  })

  return (
    <Group
      orientation={direction}
      id={autoSaveId}
      defaultLayout={persistedLayout.defaultLayout ?? defaultLayoutMap}
      onLayoutChanged={autoSaveId ? persistedLayout.onLayoutChanged : undefined}
      className={cn('h-full w-full overflow-hidden', className)}
    >
      {children}
    </Group>
  )
}

export { Panel, Group, Separator, DragHandle }
