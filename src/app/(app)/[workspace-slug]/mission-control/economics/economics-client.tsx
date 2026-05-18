'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KPICard } from '@/components/mission-control/kpi-card'
import { CostBreakdown } from '@/components/mission-control/economics/cost-breakdown'
import { CostRecommendationCard } from '@/components/mission-control/economics/cost-recommendation-card'
import { DollarSign, TrendingDown, Lightbulb } from 'lucide-react'
import { EmptyState, PageSection } from '@/components/page'

interface SpendClientProps {
  orgId: string
}

interface CostRecommendation {
  id: string
  agent_id: string | null
  recommendation_type: string
  title: string
  description: string
  estimated_savings_usd: number | null
  status: string
}

interface CostCategory {
  category: string
  amount: number
}

export function SpendClient({ orgId }: SpendClientProps) {
  const [costToday, setCostToday] = useState<number>(0)
  const [breakdown, setBreakdown] = useState<CostCategory[]>([])
  const [recommendations, setRecommendations] = useState<CostRecommendation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [economicsRes, recsRes] = await Promise.all([
        fetch(`/api/mission-control/economics?org_id=${orgId}`),
        fetch(`/api/mission-control/economics/recommendations?org_id=${orgId}`),
      ])
      if (economicsRes.ok) {
        const data = await economicsRes.json()
        setCostToday(Number(data.cost_today_usd ?? 0))
        setBreakdown(data.cost_breakdown ?? [])
      }
      if (recsRes.ok) {
        const data = await recsRes.json()
        setRecommendations(data.recommendations ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalSavings = recommendations.reduce(
    (sum, r) => sum + (r.estimated_savings_usd ?? 0),
    0
  )

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPICard
          label="Cost Today"
          value={`$${costToday.toFixed(2)}`}
          icon={DollarSign}
          variant={costToday > 50 ? 'warning' : 'default'}
        />
        {totalSavings > 0 && (
          <KPICard
            label="Potential Savings"
            value={`$${totalSavings.toFixed(2)}`}
            icon={TrendingDown}
            variant="success"
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost Breakdown */}
        <CostBreakdown categories={breakdown} total={costToday} />

        {/* Cost Recommendations */}
        <PageSection
          title="Cost Recommendations"
          actions={<Lightbulb className="h-4 w-4 text-muted-foreground" />}
        >
          {recommendations.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {recommendations.map((rec) => (
                  <CostRecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <EmptyState
              title="No recommendations yet"
              description="Cost analysis runs weekly and generates actionable suggestions."
              className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
            />
          )}
        </PageSection>
      </div>
    </div>
  )
}
