'use client'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'

interface CostRecommendation {
  id: string
  agent_id: string | null
  recommendation_type: string
  title: string
  description: string
  estimated_savings_usd: number | null
  status: string
}

interface CostRecommendationCardProps {
  recommendation: CostRecommendation
}

export function CostRecommendationCard({ recommendation: rec }: CostRecommendationCardProps) {
  return (
    <WorkspaceActionRow
      title={rec.title}
      eyebrow={rec.recommendation_type.replace('_', ' ')}
      description={rec.description}
      tone={rec.status === 'open' ? 'warning' : 'default'}
      meta={
        rec.estimated_savings_usd != null ? (
          <span className="font-medium text-emerald-500">
            -${rec.estimated_savings_usd.toFixed(2)}
          </span>
        ) : null
      }
    />
  )
}
