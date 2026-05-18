import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformGuarantees } from '@/lib/platform/guarantees'

export function PlatformGuaranteesCard({
  context = 'proof-loop',
  compact = false,
}: {
  context?: 'create-agent' | 'proof-loop'
  compact?: boolean
}) {
  const items = getPlatformGuarantees(context)

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Handled by Lucid</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The platform already owns the operational plumbing below. You should focus on the agent behavior and work model.
          </p>
        </div>
      </div>

      <div className={cn('mt-4 grid gap-3', compact ? 'sm:grid-cols-2' : 'lg:grid-cols-3')}>
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground">{item.title}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{item.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
