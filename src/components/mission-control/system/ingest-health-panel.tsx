'use client'

import { useEffect, useState } from 'react'
import { KPICard } from '@/components/mission-control/kpi-card'
import { Database, Activity, Clock, AlertTriangle } from 'lucide-react'

interface IngestHealth {
  available: boolean
  status?: 'healthy' | 'warning' | 'critical'
  streams?: {
    eventsDepth: number
    costsDepth: number
    oldestEntryAgeMs: number | null
  }
  drain?: {
    lastDrainAt: string
    durationMs: number
    heartbeatsUpdated: number
    eventsDrained: number
    costsDrained: number
    fallbackCount: number
  } | null
}

export function IngestHealthPanel() {
  const [health, setHealth] = useState<IngestHealth | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetch_() {
      try {
        const res = await fetch('/api/internal/runtimes/ingest-health')
        if (!res.ok) return
        const data = await res.json()
        if (mounted) setHealth(data)
      } catch {
        // silent
      }
    }

    fetch_()
    const interval = setInterval(fetch_, 10_000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  if (!health || !health.available) return null

  const eventsDepth = health.streams?.eventsDepth ?? 0
  const costsDepth = health.streams?.costsDepth ?? 0
  const oldestAge = health.streams?.oldestEntryAgeMs
  const drainMs = health.drain?.durationMs ?? 0
  const fallbacks = health.drain?.fallbackCount ?? 0

  const statusVariant = (s?: string): 'default' | 'success' | 'warning' | 'error' => {
    if (s === 'critical') return 'error'
    if (s === 'warning') return 'warning'
    return 'default'
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground/70 uppercase tracking-wide mb-2">
        Redis ingest buffer
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Event stream"
          value={eventsDepth}
          icon={Database}
          variant={eventsDepth > 20000 ? 'error' : eventsDepth > 5000 ? 'warning' : 'default'}
        />
        <KPICard
          label="Cost stream"
          value={costsDepth}
          icon={Database}
          variant={costsDepth > 10000 ? 'error' : costsDepth > 2000 ? 'warning' : 'default'}
        />
        <KPICard
          label="Oldest entry"
          value={
            oldestAge != null
              ? oldestAge > 1000
                ? `${(oldestAge / 1000).toFixed(1)}s`
                : `${oldestAge}ms`
              : '--'
          }
          icon={Clock}
          variant={oldestAge != null && oldestAge > 30000 ? 'error' : 'default'}
        />
        <KPICard
          label="Drain cycle"
          value={drainMs > 0 ? `${drainMs}ms` : '--'}
          icon={Activity}
          variant={drainMs > 3000 ? 'warning' : 'default'}
        />
      </div>
      {fallbacks > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-500">
          <AlertTriangle className="h-3 w-3" />
          <span>{fallbacks} Redis fallback(s) to Postgres</span>
        </div>
      )}
    </div>
  )
}
