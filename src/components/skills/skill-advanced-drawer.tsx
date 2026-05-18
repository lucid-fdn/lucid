'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

// =============================================================================
// COMPONENT
// =============================================================================

interface SkillAdvancedDrawerProps {
  item: UnifiedSkillItem
  onClose: () => void
  onToolToggle?: (item: UnifiedSkillItem, enabledTools: string[]) => void
  onConnectionChange?: (item: UnifiedSkillItem, connectionRowId: string) => void
  isSaving?: boolean
}

export function SkillAdvancedDrawer({
  item,
  onClose,
  onToolToggle,
  onConnectionChange,
  isSaving,
}: SkillAdvancedDrawerProps) {
  // Initialize from enabled_tools or all tools enabled
  const allToolNames = item.tools?.map(t => t.name) ?? []
  const [enabledTools, setEnabledTools] = useState<Set<string>>(
    new Set(item.enabled_tools ?? allToolNames),
  )

  const isCore = item.always_on
  const hasTools = item.tools && item.tools.length > 0
  const connectionOptions = item.connection_options ?? []
  const hasConnectionOptions = Boolean(item.auth_provider && connectionOptions.length > 0)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!hasTools && !hasConnectionOptions) return null

  const handleToggleTool = (toolName: string) => {
    if (isCore) return
    const next = new Set(enabledTools)
    if (next.has(toolName)) {
      next.delete(toolName)
    } else {
      next.add(toolName)
    }
    setEnabledTools(next)
  }

  const handleSave = () => {
    onToolToggle?.(item, Array.from(enabledTools))
  }

  const hasChanges = (() => {
    const original = new Set(item.enabled_tools ?? allToolNames)
    if (original.size !== enabledTools.size) return true
    for (const t of enabledTools) {
      if (!original.has(t)) return true
    }
    return false
  })()

  return (
    <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0 duration-200"
      onClick={onClose}
      aria-hidden="true"
    />
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 bg-background border-l border-border shadow-lg flex flex-col animate-in slide-in-from-right-full duration-200" role="dialog" aria-label={`Configure ${item.name}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-sm font-medium">{item.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCore ? 'Core tools (always on)' : 'Configure enabled tools'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tool list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-2">
          {hasConnectionOptions ? (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Account
              </p>
              {connectionOptions.map((connection) => {
                const label = connection.account_label ?? connection.account_id ?? connection.connection_id
                const checked = connection.id === item.selected_connection_row_id
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => onConnectionChange?.(item, connection.id)}
                    disabled={isSaving || connection.status !== 'active'}
                    className={`flex w-full items-center justify-between rounded-md border p-2 text-left text-xs transition-colors ${
                      checked
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border hover:bg-muted/50'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{label}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {connection.status === 'active' ? 'Connected account' : connection.status}
                      </span>
                    </span>
                    {checked ? (
                      <span className="text-[10px] text-primary">Selected</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {hasTools ? item.tools!.map((tool) => (
            <label
              key={tool.name}
              className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                isCore ? 'opacity-60' : 'hover:bg-muted/50 cursor-pointer'
              }`}
            >
              <Checkbox
                checked={isCore || enabledTools.has(tool.name)}
                onCheckedChange={() => handleToggleTool(tool.name)}
                disabled={isCore}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-mono font-medium block">{tool.name}</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {tool.description}
                </span>
              </div>
            </label>
          )) : null}
        </div>
      </ScrollArea>

      {/* Footer */}
      {!isCore && hasTools && (
        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {enabledTools.size}/{allToolNames.length} enabled
          </span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="h-7 text-xs"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    </div>
    </>
  )
}
