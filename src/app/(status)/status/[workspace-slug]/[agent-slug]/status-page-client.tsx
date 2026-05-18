'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

interface StatusData {
  agent_name: string
  title: string
  description: string | null
  current_status: string
  uptime_90d: number
  recent_incidents: Array<{
    id: string
    title: string
    description: string | null
    severity: string
    status: string
    started_at: string
    resolved_at: string | null
  }>
}

interface StatusPageClientProps {
  data: StatusData
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  operational: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-500/10 border-green-500/20',
    label: 'All Systems Operational',
  },
  degraded: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    label: 'Degraded Performance',
  },
  outage: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/20',
    label: 'Service Outage',
  },
}

export function StatusPageClient({ data }: StatusPageClientProps) {
  const config = STATUS_CONFIG[data.current_status] ?? STATUS_CONFIG.operational
  const StatusIcon = config.icon

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-1">{data.title}</h1>
        {data.description && (
          <p className="text-sm text-muted-foreground">{data.description}</p>
        )}
      </div>

      <div
        className={cn(
          'rounded-lg border p-6 text-center mb-8',
          config.bg
        )}
      >
        <StatusIcon className={cn('h-8 w-8 mx-auto mb-2', config.color)} />
        <p className={cn('text-lg font-semibold', config.color)}>
          {config.label}
        </p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Uptime (90 days)</span>
          <span className="text-sm font-mono tabular-nums">
            {data.uptime_90d}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              data.uptime_90d >= 99.5 ? 'bg-green-500' :
              data.uptime_90d >= 95 ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{ width: `${Math.min(data.uptime_90d, 100)}%` }}
          />
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-3">Recent Incidents</h2>
        {data.recent_incidents.length === 0 ? (
          <p className="text-xs text-muted-foreground/50">
            No incidents in the last 90 days.
          </p>
        ) : (
          <div className="space-y-3">
            {data.recent_incidents.map((incident) => (
              <div key={incident.id} className="rounded border p-3">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <span className="text-sm font-medium">{incident.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded capitalize',
                          incident.severity === 'critical' && 'bg-red-500/15 text-red-400',
                          incident.severity === 'major' && 'bg-orange-500/15 text-orange-400',
                          incident.severity === 'minor' && 'bg-yellow-500/15 text-yellow-400'
                        )}
                      >
                        {incident.severity}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded capitalize',
                          incident.status === 'resolved'
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-yellow-500/15 text-yellow-400'
                        )}
                      >
                        {incident.status}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50">
                    {new Date(incident.started_at).toLocaleDateString()}
                  </span>
                </div>
                {incident.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {incident.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-12 text-center text-[10px] text-muted-foreground/40">
        Powered by Lucid Operations
      </div>
    </div>
  )
}
