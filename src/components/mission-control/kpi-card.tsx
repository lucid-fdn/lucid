'use client'

import type { LucideIcon } from 'lucide-react'

import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'

interface KPICardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: 'up' | 'down' | 'flat'
  trendValue?: string
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

export function KPICard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  variant = 'default',
  className,
}: KPICardProps) {
  const tone = variant === 'error' ? 'danger' : variant

  return (
    <WorkspaceMetricCard
      label={label}
      value={value}
      detail={trendValue}
      icon={Icon}
      tone={tone}
      density="compact"
      className={className}
    />
  )
}
