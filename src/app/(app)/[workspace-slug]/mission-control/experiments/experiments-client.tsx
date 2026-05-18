'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmptyState } from '@/components/mission-control/empty-state'
import { ExperimentList } from '@/components/mission-control/experiments/experiment-list'
import { FlaskConical } from 'lucide-react'

interface Experiment {
  id: string
  name: string
  description: string | null
  variable_type: string
  split_pct: number
  status: string
  winner: string | null
  created_at: string
}

interface ExperimentsClientProps {
  orgId: string
  workspaceSlug: string
}

export function ExperimentsClient({ orgId }: ExperimentsClientProps) {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/mission-control/experiments?org_id=${orgId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setExperiments(data.experiments ?? [])
    } catch {
      setExperiments([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">A/B Experiments</h2>
      </div>

      {experiments.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-8 w-8" />}
          title="No experiments yet"
          description="Create an A/B test to compare agent variants with different models, prompts, or tools."
        />
      ) : (
        <ExperimentList experiments={experiments} />
      )}
    </div>
  )
}
