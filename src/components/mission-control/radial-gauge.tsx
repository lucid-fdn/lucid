'use client'

/**
 * RadialGauge — Circular SVG gauge for resource metrics and health scores.
 *
 * colorScheme='resource' (default): low = good (CPU/RAM/Disk), shows percent sign
 * colorScheme='health': high = good (health dimension scores), shows raw number
 */

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Cpu, MemoryStick, HardDrive, Server } from 'lucide-react'

export interface RadialGaugeProps {
  /** 0-100 value */
  value: number | null
  /** Primary label below the gauge */
  label: string
  /** Secondary label below the primary (e.g. weight %) */
  sublabel?: string
  /** Lucide icon displayed in the center (resource mode only) */
  icon?: LucideIcon
  /** Size in pixels (default: 80) */
  size?: number
  /** Stroke width (default: 6) */
  strokeWidth?: number
  /**
   * 'resource' (default): low = good, shows "%" suffix.
   * 'health': high = good, shows raw number (no suffix).
   */
  colorScheme?: 'resource' | 'health'
  className?: string
}

function getColors(value: number | null, scheme: 'resource' | 'health') {
  if (value == null) {
    return { text: 'text-muted-foreground/30', stroke: 'stroke-muted-foreground/30' }
  }
  if (scheme === 'health') {
    // Higher is better
    if (value >= 75) return { text: 'text-green-400', stroke: 'stroke-green-500' }
    if (value >= 50) return { text: 'text-yellow-400', stroke: 'stroke-yellow-500' }
    if (value >= 25) return { text: 'text-orange-400', stroke: 'stroke-orange-500' }
    return { text: 'text-red-400', stroke: 'stroke-red-500' }
  }
  // resource: lower is better
  if (value > 80) return { text: 'text-red-500', stroke: 'stroke-red-500' }
  if (value > 60) return { text: 'text-amber-500', stroke: 'stroke-amber-500' }
  return { text: 'text-green-500', stroke: 'stroke-green-500' }
}

export function RadialGauge({
  value,
  label,
  sublabel,
  icon: Icon,
  size = 80,
  strokeWidth = 6,
  colorScheme = 'resource',
  className,
}: RadialGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const normalizedValue = Math.min(Math.max(value ?? 0, 0), 100)
  const offset = circumference - (normalizedValue / 100) * circumference
  const { text: textColor, stroke: strokeColor } = getColors(value, colorScheme)

  const displayValue = value != null
    ? colorScheme === 'health' ? String(Math.round(value)) : `${Math.round(value)}%`
    : '--'

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted/50"
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={value != null ? offset : circumference}
            strokeLinecap="round"
            className={cn('transition-all duration-500', strokeColor)}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && <Icon className={cn('h-3.5 w-3.5 mb-0.5', textColor)} />}
          <span className={cn('font-semibold tabular-nums', colorScheme === 'health' ? 'text-xs' : 'text-sm', textColor)}>
            {displayValue}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
      {sublabel && <span className="text-[9px] text-muted-foreground/40 -mt-0.5">{sublabel}</span>}
    </div>
  )
}

/** Compact row of radial gauges for a runtime */
export function RadialGaugeRow({
  cpu,
  ram,
  disk,
  gpu,
  size = 64,
  strokeWidth = 5,
  className,
}: {
  cpu: number | null
  ram: number | null
  disk: number | null
  gpu?: number | null
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      <RadialGauge value={cpu} label="CPU" icon={Cpu} size={size} strokeWidth={strokeWidth} />
      <RadialGauge value={ram} label="RAM" icon={MemoryStick} size={size} strokeWidth={strokeWidth} />
      <RadialGauge value={disk} label="Disk" icon={HardDrive} size={size} strokeWidth={strokeWidth} />
      {gpu != null && (
        <RadialGauge value={gpu} label="GPU" icon={Server} size={size} strokeWidth={strokeWidth} />
      )}
    </div>
  )
}
