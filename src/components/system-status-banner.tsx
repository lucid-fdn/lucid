'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type ServiceStatus = 'operational' | 'degraded' | 'down'

interface Service {
  name: string
  status: ServiceStatus
  latency?: number
  message?: string
}

interface StatusData {
  overall: ServiceStatus
  services: Service[]
  timestamp: string
}

const STATUS_CONFIG = {
  operational: {
    label: 'All Systems Operational',
    icon: '●',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dotClassName: 'text-emerald-400',
  },
  degraded: {
    label: 'Partial System Outage',
    icon: '●',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dotClassName: 'text-amber-400',
  },
  down: {
    label: 'Major System Outage',
    icon: '●',
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
    dotClassName: 'text-red-400',
  },
} as const

interface SystemStatusBannerProps {
  /** Polling interval in ms. Default: 60000 (1 min) */
  pollInterval?: number
  /** Show individual service statuses on hover/expand */
  showDetails?: boolean
  /** Compact mode - just the dot + label, no border */
  compact?: boolean
  /** Only show when there's an issue (hide when operational) */
  hideWhenHealthy?: boolean
  /** Additional className */
  className?: string
  /** Status API endpoint. Default: /api/status */
  endpoint?: string
}

export function SystemStatusBanner({
  pollInterval = 60_000,
  showDetails = true,
  compact = false,
  hideWhenHealthy = false,
  className,
  endpoint = '/api/status',
}: SystemStatusBannerProps) {
  const [status, setStatus] = React.useState<StatusData | null>(null)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [error, setError] = React.useState(false)
  const bannerRef = React.useRef<HTMLDivElement>(null)

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: StatusData = await res.json()
      setStatus(data)
      setError(false)
    } catch {
      setError(true)
    }
  }, [endpoint])

  React.useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(interval)
  }, [fetchStatus, pollInterval])

  // Sync banner height to CSS variable so the fixed navbar can offset itself
  const isVisible = (status || error) && !(hideWhenHealthy && status?.overall === 'operational' && !error)

  React.useEffect(() => {
    if (!compact && isVisible && bannerRef.current) {
      const update = () => {
        document.documentElement.style.setProperty(
          '--status-banner-height',
          `${bannerRef.current?.offsetHeight ?? 0}px`
        )
      }
      update()
      const obs = new ResizeObserver(update)
      obs.observe(bannerRef.current)
      return () => { obs.disconnect(); document.documentElement.style.setProperty('--status-banner-height', '0px') }
    }
    if (!compact) document.documentElement.style.setProperty('--status-banner-height', '0px')
  }, [isVisible, compact, isExpanded])

  // Don't render until first fetch completes
  if (!status && !error) return null

  // Hide when healthy if configured
  if (hideWhenHealthy && status?.overall === 'operational' && !error) {
    return null
  }

  const overall = error ? 'degraded' : (status?.overall ?? 'operational')
  const config = STATUS_CONFIG[overall]

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium',
          className
        )}
        title={config.label}
      >
        <span
          className={cn('text-[8px] animate-pulse', config.dotClassName)}
          aria-hidden
        >
          ●
        </span>
        <span className={config.dotClassName}>{config.label}</span>
      </div>
    )
  }

  return (
    <div
      ref={bannerRef}
      className={cn(
        'w-full border-b text-sm transition-all duration-200',
        config.className,
        className
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => showDetails && setIsExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-2 font-medium',
            showDetails && 'cursor-pointer hover:opacity-80'
          )}
          aria-expanded={isExpanded}
          disabled={!showDetails}
        >
          <span
            className={cn(
              'text-[10px]',
              overall === 'operational' && 'animate-pulse'
            )}
            aria-hidden
          >
            {config.icon}
          </span>
          <span>{error ? 'Unable to check system status' : config.label}</span>
          {showDetails && status && status.services.length > 0 && (
            <svg
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          )}
        </button>

        {status && (
          <time
            className="hidden text-xs opacity-60 sm:block"
            dateTime={status.timestamp}
          >
            Updated{' '}
            {new Date(status.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        )}
      </div>

      {/* Expandable service details */}
      {isExpanded && status && (
        <div className="mx-auto max-w-7xl border-t border-current/10 px-4 py-2 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {status.services.map((service) => {
              const sConfig = STATUS_CONFIG[service.status]
              return (
                <div
                  key={service.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1"
                >
                  <span className={cn('text-[8px]', sConfig.dotClassName)}>
                    ●
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">
                      {service.name}
                    </div>
                    <div className="text-[10px] opacity-60">
                      {service.status === 'operational'
                        ? service.latency
                          ? `${service.latency}ms`
                          : 'OK'
                        : service.message || service.status}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline status indicator — use in footers, navbars, etc.
 */
export function SystemStatusIndicator({
  className,
  ...props
}: Omit<SystemStatusBannerProps, 'compact'>) {
  return <SystemStatusBanner compact {...props} className={className} />
}
