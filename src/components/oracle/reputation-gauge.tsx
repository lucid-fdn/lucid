'use client'

import { getReputationColor } from '@/lib/oracle/format'

// Map Tailwind color classes to hex for SVG rendering
const COLOR_TO_HEX: Record<string, { stroke: string; bg: string }> = {
  'text-emerald-400': { stroke: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
  'text-amber-400': { stroke: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' },
  'text-orange-400': { stroke: '#fb923c', bg: 'rgba(251, 146, 60, 0.1)' },
  'text-red-400': { stroke: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' },
}

/**
 * Circular SVG reputation gauge.
 * Renders an arc from 0-100% with color coding.
 */
export function ReputationGauge({
  score,
  size = 80,
  strokeWidth = 6,
  label,
}: {
  score: number | null
  size?: number
  strokeWidth?: number
  label?: string
}) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox="0 0 80 80">
          <circle
            cx={40} cy={40} r={34}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          <text x={40} y={44} textAnchor="middle" fill="var(--muted-foreground)" fontSize={16} fontFamily="ui-monospace, monospace">
            --
          </text>
        </svg>
        {label && <span className="text-[10px] text-zinc-500 mt-1">{label}</span>}
      </div>
    )
  }

  const clamped = Math.max(0, Math.min(100, score))
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  const repColor = getReputationColor(clamped)
  const hex = COLOR_TO_HEX[repColor.text] ?? { stroke: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' }
  const color = hex.stroke
  const bgColor = hex.bg

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 80 80">
        {/* Background circle */}
        <circle
          cx={40} cy={40} r={radius}
          fill={bgColor}
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={40} cy={40} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        {/* Score text */}
        <text
          x={40} y={38}
          textAnchor="middle"
          fill={color}
          fontSize={18}
          fontWeight={700}
          fontFamily="ui-monospace, monospace"
        >
          {clamped.toFixed(0)}
        </text>
        <text
          x={40} y={52}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={10}
          fontFamily="ui-monospace, monospace"
        >
          / 100
        </text>
      </svg>
      {label && <span className="text-[10px] text-zinc-500 mt-1">{label}</span>}
    </div>
  )
}
