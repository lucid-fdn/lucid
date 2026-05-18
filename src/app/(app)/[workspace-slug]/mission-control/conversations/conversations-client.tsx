'use client'

import { useState, useEffect, useCallback } from 'react'
import { KPICard } from '@/components/mission-control/kpi-card'
import { TopicClusters } from '@/components/mission-control/conversations/topic-clusters'
import { AIInsightsPanel } from '@/components/mission-control/conversations/ai-insights-panel'
import { MessageVolumeChart } from '@/components/mission-control/conversations/message-volume-chart'
import {
  AlertTriangle,
  MessageSquare,
  Smile,
  TrendingUp,
} from 'lucide-react'

interface ConversationsClientProps {
  orgId: string
}

interface Intelligence {
  avg_sentiment: number
  avg_satisfaction: number
  total_conversations_7d: number
  abandonment_rate: number
  topics: Array<{ cluster_label: string; conversation_count: number }>
  recent_insights: Array<{
    id: string
    insight_type: string
    title: string
    body: string
    severity: string
    created_at: string
  }>
}

interface OverviewKPIs {
  total_runs_24h: number
  errors_24h: number
}

export function ConversationsClient({ orgId }: ConversationsClientProps) {
  const [kpis, setKpis] = useState<OverviewKPIs | null>(null)
  const [intel, setIntel] = useState<Intelligence | null>(null)
  const [volume, setVolume] = useState<Array<{ date: string; count: number }>>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, intelRes, volumeRes] = await Promise.all([
        fetch(`/api/mission-control/overview?org_id=${orgId}`),
        fetch(`/api/mission-control/conversations/intelligence?org_id=${orgId}`),
        fetch(`/api/mission-control/conversations/volume?org_id=${orgId}`),
      ])
      if (overviewRes.ok) setKpis(await overviewRes.json())
      if (intelRes.ok) setIntel(await intelRes.json())
      if (volumeRes.ok) {
        const data = await volumeRes.json()
        setVolume(data.volume ?? [])
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

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const sentimentLabel = (v: number) => {
    if (v > 0.3) return 'Positive'
    if (v < -0.3) return 'Negative'
    return 'Neutral'
  }

  return (
    <div className="p-4 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Conversations (24h)"
          value={kpis?.total_runs_24h ?? 0}
          icon={MessageSquare}
        />
        <KPICard
          label="Errors (24h)"
          value={kpis?.errors_24h ?? 0}
          icon={AlertTriangle}
          variant={Number(kpis?.errors_24h) > 0 ? 'error' : 'default'}
        />
        <KPICard
          label="Avg Sentiment"
          value={intel ? sentimentLabel(intel.avg_sentiment) : '--'}
          icon={Smile}
          variant={
            intel && intel.avg_sentiment < -0.3
              ? 'warning'
              : 'default'
          }
        />
        <KPICard
          label="Satisfaction"
          value={
            intel
              ? `${Math.round(intel.avg_satisfaction * 100)}%`
              : '--'
          }
          icon={TrendingUp}
        />
      </div>

      {/* Volume Chart */}
      {volume.length > 0 && (
        <MessageVolumeChart data={volume} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopicClusters topics={intel?.topics ?? []} />
        <AIInsightsPanel insights={intel?.recent_insights ?? []} />
      </div>
    </div>
  )
}
