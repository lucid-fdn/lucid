'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface BuilderAccordionItemProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  badges?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function BuilderAccordionItem({
  open,
  onOpenChange,
  title,
  subtitle,
  badges,
  children,
  className,
}: BuilderAccordionItemProps) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'overflow-hidden rounded-2xl border transition-colors',
        open ? 'border-border bg-background shadow-sm' : 'border-border/50 bg-muted/10',
        className,
      )}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/20">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badges}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="space-y-3 border-t border-border/50 p-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function BuilderAccordionBadge({
  children,
  variant = 'outline',
}: {
  children: React.ReactNode
  variant?: React.ComponentProps<typeof Badge>['variant']
}) {
  return (
    <Badge variant={variant} className="rounded-full text-[10px]">
      {children}
    </Badge>
  )
}
