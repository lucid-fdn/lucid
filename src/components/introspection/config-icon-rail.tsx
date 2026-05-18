'use client'

/**
 * ConfigIconRail — Agent control rail.
 *
 * Vertical icon strip with semantic grouping:
 *   Operate  — health, tasks (live state)
 *   Connect  — channels, runtime (inputs/outputs)
 *   Configure — settings, memories, skills, guardrails, wallet, verification
 *
 * Icons open the section in a large centered modal overlay.
 * Contextual dots signal actionable state.
 */

import { useState, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/radix/tooltip'
import { type ConfigSection, DEFAULT_SECTION_ICONS } from '@/components/assistant/config-panel'
import type { SectionHighlight } from '@/hooks/use-contextual-sections'
import { AutoSaveIndicator } from '@/components/forms/auto-save-indicator'

interface ConfigIconRailProps {
  sections: ConfigSection[]
  highlights: Record<string, SectionHighlight>
  /** Externally controlled — set to a section ID to open it programmatically */
  externalOpenSection?: string | null
  onExternalOpenHandled?: () => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  className?: string
}

const HIGHLIGHT_COLORS: Record<NonNullable<SectionHighlight>, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
}

// Semantic grouping — separators appear between these group boundaries
const SECTION_GROUPS: Array<{ ids: Set<string>; label: string }> = [
  { ids: new Set(['channels', 'skills', 'memories', 'tasks']), label: 'Engage' },
  // everything else → Configure (no explicit set needed)
]

function getSectionGroup(id: string): string {
  for (const group of SECTION_GROUPS) {
    if (group.ids.has(id)) return group.label
  }
  return 'Configure'
}

export function ConfigIconRail({ sections, highlights, externalOpenSection, onExternalOpenHandled, saveStatus, className }: ConfigIconRailProps) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  // React to external open requests — only open if section exists
  useEffect(() => {
    if (externalOpenSection) {
      const exists = sections.some((s) => s.id === externalOpenSection)
      if (exists) setOpenSectionId(externalOpenSection)
      onExternalOpenHandled?.()
    }
  }, [externalOpenSection, onExternalOpenHandled, sections])

  const handleOpen = useCallback((id: string) => {
    setOpenSectionId(id)
  }, [])

  const handleClose = useCallback(() => {
    setOpenSectionId(null)
  }, [])

  const openSection = openSectionId
    ? sections.find((s) => s.id === openSectionId)
    : null

  // Build grouped items with separator positions
  type RailItem =
    | { kind: 'separator'; label: string; key: string }
    | { kind: 'section'; section: ConfigSection }

  const railItems: RailItem[] = []
  let lastGroup: string | null = null

  for (const section of sections) {
    const group = getSectionGroup(section.id)
    if (group !== lastGroup) {
      // Separator before every group except the first
      if (lastGroup !== null) {
        railItems.push({ kind: 'separator', label: group, key: `sep-${group}` })
      }
      lastGroup = group
    }
    railItems.push({ kind: 'section', section })
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex flex-col items-center py-3 gap-0.5 w-11 border-r border-border bg-background shrink-0',
          className,
        )}
      >
        {railItems.map((item) => {
          if (item.kind === 'separator') {
            return (
              <div key={item.key} className="w-6 border-t border-border my-1.5" />
            )
          }

          const { section } = item
          const icon = DEFAULT_SECTION_ICONS[section.id] ?? section.icon
          const highlight = highlights[section.id]
          const isActive = openSectionId === section.id

          return (
            <Tooltip key={section.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleOpen(section.id)}
                  className={cn(
                    'relative flex items-center justify-center w-8 h-8 rounded-md',
                    'transition-colors duration-120',
                    isActive
                      ? 'text-foreground bg-accent'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  {/* Left accent bar for active state */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-muted-foreground" />
                  )}
                  <span className="[&>svg]:h-[15px] [&>svg]:w-[15px]">{icon}</span>
                  {/* Contextual highlight dot */}
                  {highlight && (
                    <span
                      className={cn(
                        'absolute top-1 right-1 w-1.5 h-1.5 rounded-full',
                        HIGHLIGHT_COLORS[highlight],
                      )}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-medium">
                {section.title}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Section content in centered modal overlay */}
      <Dialog open={!!openSectionId} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className={cn(
            'max-w-[80vw] w-[800px] max-h-[85vh] p-0',
            'bg-background border-border',
            'flex flex-col',
          )}
        >
          {openSection && (
            <>
              <div className="flex items-center gap-2.5 px-6 pt-5 pb-3 border-b border-border shrink-0">
                <span className="[&>svg]:h-4 [&>svg]:w-4 text-muted-foreground">
                  {DEFAULT_SECTION_ICONS[openSection.id] ?? openSection.icon}
                </span>
                <DialogTitle className="text-sm font-medium text-foreground">
                  {openSection.title}
                </DialogTitle>
                {saveStatus && <AutoSaveIndicator status={saveStatus} className="ml-auto" />}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {openSection.content}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
