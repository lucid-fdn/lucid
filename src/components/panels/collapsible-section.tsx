'use client'

import { useState } from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  /** Section title */
  title: string
  /** Lucide icon component */
  icon?: React.ReactNode
  /** Badge count or text shown in header */
  badge?: string | number | null
  /** Badge variant for custom styling */
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
  /** Custom badge className */
  badgeClassName?: string
  /** Whether section starts open */
  defaultOpen?: boolean
  /** Controlled open state */
  open?: boolean
  /** Called when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Section content */
  children: React.ReactNode
  /** Additional className for the container */
  className?: string
  /** ID for keyboard navigation / URL hash */
  id?: string
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  badgeVariant = 'secondary',
  badgeClassName,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
  id,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [hasBeenOpened, setHasBeenOpened] = useState(defaultOpen)
  const isOpen = controlledOpen ?? internalOpen
  const handleOpenChange = (open: boolean) => {
    if (open) setHasBeenOpened(true)
    ;(onOpenChange ?? setInternalOpen)(open)
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn('border-b border-border', className)}
    >
      <CollapsibleTrigger
        id={id}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2.5',
          'text-xs font-medium text-muted-foreground hover:text-foreground',
          'bg-muted/30 hover:bg-muted/60 transition-colors duration-120',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isOpen && 'rotate-90',
          )}
        />
        {icon && (
          <span className={cn('shrink-0 transition-colors duration-120', isOpen ? 'text-foreground' : 'text-muted-foreground')}>
            {icon}
          </span>
        )}
        <span className="flex-1 text-left truncate">{title}</span>
        {badge != null && badge !== '' && badge !== 0 && (
          <Badge
            variant={badgeVariant}
            className={cn('text-[11px] h-4 px-1.5 font-mono', badgeClassName)}
          >
            {badge}
          </Badge>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent
        className={cn(
          'overflow-hidden',
          'data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up',
        )}
      >
        <div className="px-3 py-3">
          {hasBeenOpened ? children : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
