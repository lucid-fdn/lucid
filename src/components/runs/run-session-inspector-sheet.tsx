import React from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export interface RunInspectorSection {
  id: string
  label: string
  value: string
}

export function RunSessionInspectorSheet({
  open,
  onOpenChange,
  title,
  description,
  badges = [],
  sections,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  badges?: string[]
  sections: RunInspectorSection[]
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{title}</SheetTitle>
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="border-border text-muted-foreground">
                {badge}
              </Badge>
            ))}
          </div>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="space-y-4 pt-4">
            {sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-border/60 bg-background/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{section.label}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{section.value}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
