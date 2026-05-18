'use client'

import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Users, Play, MoreHorizontal, Check, X } from 'lucide-react'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/animate-ui/primitives/radix/tooltip'
import type { CrewStatus } from '@contracts/crew'

export interface CrewNodeData {
  name: string
  objective: string
  status: CrewStatus
  memberCount: number
  coordinatorName: string | null
  totalCostUsd: number
  onStartRun?: (crewId: string) => void
  onContextMenu?: (crewId: string) => void
  onRename?: (crewId: string, newName: string) => void
  /** Triggered from context menu to enter inline rename mode */
  isRenaming?: boolean
  onRenameComplete?: () => void
  isDropTarget?: boolean
}

const STATUS_COLORS: Record<CrewStatus, { dot: string; border: string; animate: boolean }> = {
  draft: { dot: 'bg-zinc-500', border: 'border-zinc-500/20', animate: false },
  active: { dot: 'bg-emerald-400', border: 'border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]', animate: true },
  paused: { dot: 'bg-yellow-500', border: 'border-yellow-500/20', animate: false },
  completed: { dot: 'bg-blue-500', border: 'border-blue-500/20', animate: false },
  archived: { dot: 'bg-zinc-400', border: 'border-zinc-400/20', animate: false },
}

const CrewNodeComponent = ({ id, data, selected }: NodeProps<CrewNodeData>) => {
  const statusConfig = STATUS_COLORS[data.status] ?? STATUS_COLORS.draft

  // Feature 4: Inline rename
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(data.name)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guard against double-fire from blur + button click
  const commitGuardRef = useRef(false)

  // Enter edit mode when triggered externally (context menu "Rename")
  useEffect(() => {
    if (data.isRenaming && !isEditing) {
      setIsEditing(true)
    }
  }, [data.isRenaming, isEditing])

  useEffect(() => {
    if (isEditing) {
      setEditValue(data.name)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [isEditing, data.name])

  const crewId = id.replace('crew-', '')

  const commitRename = useCallback(() => {
    if (commitGuardRef.current) return
    commitGuardRef.current = true
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== data.name) {
      data.onRename?.(crewId, trimmed)
    }
    setIsEditing(false)
    data.onRenameComplete?.()
    // Reset guard after a tick (allows next rename cycle)
    setTimeout(() => { commitGuardRef.current = false }, 0)
  }, [editValue, data.name, data.onRename, data.onRenameComplete, crewId])

  const cancelRename = useCallback(() => {
    setEditValue(data.name)
    setIsEditing(false)
    data.onRenameComplete?.()
  }, [data.name, data.onRenameComplete])

  return (
    <div
      className={cn(
        'group relative rounded-xl border-2 bg-background/60 backdrop-blur-sm transition-all duration-200',
        'min-w-[300px]',
        statusConfig.border,
        selected && 'ring-2 ring-primary/50',
        data.isDropTarget && 'ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-background',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <BreathingDot
            color={statusConfig.dot}
            animate={statusConfig.animate}
            size="xs"
          />
        </div>
        {/* Feature 4: Inline rename — double-click to edit */}
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') cancelRename()
                e.stopPropagation()
              }}
              onBlur={commitRename}
              maxLength={100}
              className="text-sm font-semibold bg-transparent border-b border-primary/50 outline-none flex-1 min-w-0"
            />
            <button onClick={commitRename} className="p-0.5 text-emerald-500 hover:text-emerald-400">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={cancelRename} className="p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
              Team
            </span>
            <span
              className="text-sm font-semibold truncate cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              title="Double-click to rename"
            >
              {data.name}
            </span>
          </div>
        )}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
              {data.memberCount} {data.memberCount === 1 ? 'agent' : 'agents'}
            </span>
            {data.status === 'active' || data.status === 'draft' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Start team run"
                    onClick={(e) => {
                      e.stopPropagation()
                      data.onStartRun?.(id)
                    }}
                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-500/10 text-emerald-500"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
              <TooltipContent>Start team run</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Open team options"
                  onClick={(e) => {
                    e.stopPropagation()
                    data.onContextMenu?.(id)
                  }}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent text-muted-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Team options</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Objective preview */}
      <div className="px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
          {data.objective}
        </p>
      </div>

      {/* Interior space where child nodes sit (via ReactFlow parentNode) */}
      <div className="min-h-[120px]" />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50">
        {data.coordinatorName && (
          <span className="text-[9px] text-muted-foreground/50">
            Lead: {data.coordinatorName}
          </span>
        )}
        {data.totalCostUsd > 0 && (
          <span className="text-[9px] text-muted-foreground/50 ml-auto">
            ${data.totalCostUsd.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}

export const CrewCanvasNode = memo(CrewNodeComponent)
CrewCanvasNode.displayName = 'CrewCanvasNode'
