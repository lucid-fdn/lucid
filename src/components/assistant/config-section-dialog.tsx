'use client'

import * as React from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DEFAULT_SECTION_ICONS } from '@/components/assistant/config-panel'

interface ConfigSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  icon?: React.ReactNode
  sectionId?: string
  children: React.ReactNode
  widthClassName?: string
}

export function ConfigSectionDialog({
  open,
  onOpenChange,
  title,
  icon,
  sectionId,
  children,
  widthClassName = 'max-w-[800px] w-[90vw] max-h-[85vh]',
}: ConfigSectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent zIndex={120} className={`${widthClassName} p-0 bg-background border-border gap-0`}>
        <DialogHeader className="px-6 py-4 border-b border-border/60 shrink-0">
          <DialogTitle className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <span className="[&>svg]:h-4 [&>svg]:w-4 text-muted-foreground">
              {sectionId ? (DEFAULT_SECTION_ICONS[sectionId] ?? icon) : icon}
            </span>
            {title}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-y-auto max-h-[calc(85vh-56px)]">
          <div className="p-6">
            {children}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
