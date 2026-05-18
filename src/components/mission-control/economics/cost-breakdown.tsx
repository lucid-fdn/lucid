'use client'
import { EmptyState, PageSection } from '@/components/page'
import { DollarSign } from 'lucide-react'

interface CostCategory {
  category: string
  amount: number
}

interface CostBreakdownProps {
  categories: CostCategory[]
  total: number
}

export function CostBreakdown({ categories, total }: CostBreakdownProps) {
  if (categories.length === 0) {
    return (
      <EmptyState
        title="No cost data available"
        description="Workspace spend categories will appear once usage is recorded."
        className="min-h-24 py-6"
      />
    )
  }
  return (
    <PageSection
      title="Cost Breakdown"
      action={<DollarSign className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="space-y-2">
        {categories.map((c) => {
          const pct = total > 0 ? (c.amount / total) * 100 : 0
          return (
            <div key={c.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize">
                  {c.category.replace('_', ' ')}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  ${c.amount.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </PageSection>
  )
}
