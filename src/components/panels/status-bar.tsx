'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentPresenceIndicator } from '@/components/agent/agent-presence'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { AutoSaveIndicator } from '@/components/forms/auto-save-indicator'
import { Check, MoreHorizontal, Trash2, AlertTriangle, Pause, Play, MessageSquare, Rocket, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentPresence } from '@/lib/mission-control/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface StatusBarProps {
  /** Agent/assistant name */
  name: string
  /** Called when user edits the name inline */
  onNameChange?: (name: string) => void
  /** Current model identifier */
  model?: string
  /** Called when model chip is clicked (opens model selector popover) */
  onModelClick?: () => void
  /** Whether the agent is active */
  active?: boolean
  /** AutoSave status for the indicator */
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  /** Additional metrics to display */
  metrics?: { label: string; value: string | number }[]
  /** Back button handler */
  onBack?: () => void
  /** Agent presence data (state, sparkline, last activity) */
  presence?: AgentPresence
  /** Health score (0-100), shown as pill when < 60 */
  healthScore?: number | null
  /** Delete handler — moves dangerous action to page-level menu */
  onDelete?: () => void
  /** Whether delete is in progress */
  isDeleting?: boolean
  /** Agent name for delete confirmation */
  agentName?: string
  /** Quick action: pause/resume toggle */
  onPause?: () => void
  /** Quick action: open chat panel */
  onOpenChat?: () => void
  /** Quick action: deploy runtime */
  onDeploy?: () => void
  /** Whether the agent has a runtime (determines Deploy visibility) */
  hasRuntime?: boolean
  /** Save as template handler */
  onSaveAsTemplate?: () => void
  className?: string
}

export function StatusBar({
  name,
  onNameChange,
  model,
  onModelClick,
  active = true,
  saveStatus,
  metrics,
  onBack,
  presence,
  healthScore,
  onDelete,
  isDeleting,
  agentName,
  onPause,
  onOpenChat,
  onDeploy,
  hasRuntime,
  onSaveAsTemplate,
  className,
}: StatusBarProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external name changes
  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  // Focus input on edit start
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) {
      onNameChange?.(trimmed)
    } else {
      setDraft(name)
    }
    setEditing(false)
  }, [draft, name, onNameChange])

  const cancel = useCallback(() => {
    setDraft(name)
    setEditing(false)
  }, [name])

  // Extract short model name from full ID (e.g., "openai/gpt-4o-mini" -> "gpt-4o-mini")
  const shortModel = model?.includes('/') ? model.split('/').pop() : model

  return (
    <div
      className={cn(
        'flex items-center gap-3 h-10 px-3',
        'backdrop-blur-xl bg-muted/60 border-b border-border',
        'shrink-0',
        className,
      )}
    >
      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all p-1 -ml-1"
          aria-label="Go back"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Inline-editable name */}
      {editing ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') cancel()
            }}
            onBlur={commit}
            className="text-sm font-bold text-foreground bg-transparent border-b border-muted-foreground outline-none min-w-[80px] max-w-[240px] py-0 px-0"
            maxLength={80}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            className="text-muted-foreground hover:text-emerald-400 active:scale-[0.95] transition-all p-0.5"
            aria-label="Confirm name"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span
          className={cn(
            'text-sm font-bold text-foreground truncate',
            onNameChange && 'cursor-text hover:text-foreground rounded px-1 -mx-1 hover:bg-accent transition-colors',
          )}
          onClick={() => onNameChange && setEditing(true)}
          role={onNameChange ? 'button' : undefined}
          tabIndex={onNameChange ? 0 : undefined}
          onKeyDown={(e) => {
            if (onNameChange && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              setEditing(true)
            }
          }}
          title={onNameChange ? 'Click to rename' : undefined}
        >
          {name}
        </span>
      )}

      {/* Model chip */}
      {shortModel && (
        <button
          type="button"
          onClick={onModelClick}
          className={cn(
            'hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full',
            'text-[11px] font-mono text-muted-foreground bg-muted/60 border border-border',
            'hover:bg-accent hover:text-foreground transition-colors',
            onModelClick && 'cursor-pointer',
            !onModelClick && 'cursor-default',
          )}
          title={model}
        >
          {shortModel}
        </button>
      )}

      {/* State pill — contextual: idle/running/paused */}
      <span
        className={cn(
          'hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium',
          active && presence?.state !== 'idle'
            ? 'text-emerald-400'
            : active
              ? 'text-muted-foreground'
              : 'text-amber-400',
        )}
      >
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full shrink-0',
            active && presence?.state !== 'idle'
              ? 'bg-emerald-400 animate-pulse'
              : active
                ? 'bg-muted-foreground'
                : 'bg-amber-400',
          )}
        />
        {!active
          ? 'Paused'
          : presence?.state !== 'idle'
            ? 'Running'
            : 'Idle'}
      </span>

      {/* Health pill — only when degraded (<75) */}
      {healthScore != null && healthScore <= 75 && (
        <span
          className={cn(
            'hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium',
            healthScore > 40
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20',
          )}
          title={`Health score: ${healthScore}/100`}
        >
          {healthScore}
        </span>
      )}

      {/* Presence: only show when actively running */}
      {presence?.state !== 'idle' && presence ? (
        <AgentPresenceIndicator
          state={presence.state}
          lastActivityLabel={presence.lastActivityLabel}
          connected={presence.connected}
        />
      ) : null}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status — fixed width to prevent layout jump */}
      {saveStatus && (
        <div className="w-16 flex justify-end">
          <AutoSaveIndicator status={saveStatus} />
        </div>
      )}

      {/* Activity sparkline — heartbeat of the agent */}
      {presence && (
        <div className="hidden md:block" title="Activity (last 3.5 min)">
          <MiniSparkline
            data={presence.sparklineData}
            width={52}
            height={14}
            color={presence.state !== 'idle' ? '#10b981' : '#3f3f46'}
          />
        </div>
      )}

      {/* Quick actions — max 2 visible */}
      <div className="hidden sm:flex items-center gap-1">
        {onPause && (
          <button
            type="button"
            onClick={onPause}
            className="p-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors duration-150"
            title={active ? 'Pause agent' : 'Resume agent'}
          >
            {active ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        {/* Show Deploy for undeployed agents, Open Chat otherwise */}
        {!hasRuntime && onDeploy ? (
          <button
            type="button"
            onClick={onDeploy}
            className="p-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors duration-150"
            title="Deploy runtime"
          >
            <Rocket className="h-3.5 w-3.5" />
          </button>
        ) : onOpenChat ? (
          <button
            type="button"
            onClick={onOpenChat}
            className="p-1.5 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors duration-150"
            title="Open chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Metrics */}
      {metrics && metrics.length > 0 && (
        <div className="hidden md:flex items-center gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{m.label}</span>
              <span className="text-xs font-mono font-bold text-foreground">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions menu ("...") — Delete, Duplicate (future), Export (future) */}
      {onDelete && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground active:scale-[0.95] transition-all p-1 rounded hover:bg-accent"
                aria-label="Agent actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {hasRuntime && onDeploy && (
                <DropdownMenuItem onClick={onDeploy}>
                  <Rocket className="h-3.5 w-3.5 mr-2" />
                  Deploy runtime
                </DropdownMenuItem>
              )}
              {onSaveAsTemplate && (
                <DropdownMenuItem onClick={onSaveAsTemplate}>
                  <LayoutTemplate className="h-3.5 w-3.5 mr-2" />
                  Save as template
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Assistant</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{agentName || name}&quot;
                  and all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setShowDeleteDialog(false)
                    onDelete()
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
