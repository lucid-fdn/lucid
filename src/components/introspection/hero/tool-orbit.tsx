'use client'

/**
 * ToolOrbit — SVG ring of tool nodes around AgentPulse during idle.
 *
 * Nodes sized proportional to callCount (16-32px), positioned evenly on circle.
 * Active tools glow emerald, error tools tint red. Max 12 + overflow node.
 */

import { motion } from 'motion/react'
import { Wrench } from 'lucide-react'
import type { ToolUsageStat } from '@/hooks/use-tool-usage-stats'
import type { IntrospectionEmotion } from '@contracts/introspection'

interface ToolOrbitProps {
  tools: ToolUsageStat[]
  emotion: IntrospectionEmotion
  className?: string
}

const MAX_VISIBLE = 12
const ORBIT_RADIUS = 56 // px from center

function getNodeSize(callCount: number, maxCalls: number): number {
  if (maxCalls <= 0) return 20
  const ratio = callCount / maxCalls
  return Math.round(16 + ratio * 16) // 16-32px range
}

function getNodeColor(stat: ToolUsageStat): string {
  if (stat.errorCount > 0 && stat.errorCount >= stat.callCount * 0.5) return '#f87171' // red-400
  if (stat.lastStatus === 'error') return '#f87171'
  if (stat.lastStatus === 'complete') return '#34d399' // emerald-400
  return 'var(--muted-foreground)'
}

export function ToolOrbit({ tools, emotion, className }: ToolOrbitProps) {
  if (tools.length === 0) return null

  const visibleTools = tools.slice(0, MAX_VISIBLE)
  const overflow = tools.length - MAX_VISIBLE
  const maxCalls = Math.max(...tools.map((t) => t.callCount), 1)
  const totalNodes = visibleTools.length + (overflow > 0 ? 1 : 0)

  return (
    <div className={`pointer-events-none ${className ?? ''}`}>
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        {/* Orbit path (subtle dashed circle) */}
        <circle
          cx="100"
          cy="100"
          r={ORBIT_RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Tool nodes */}
        {visibleTools.map((stat, i) => {
          const angle = (i / totalNodes) * Math.PI * 2 - Math.PI / 2
          const x = 100 + Math.cos(angle) * ORBIT_RADIUS
          const y = 100 + Math.sin(angle) * ORBIT_RADIUS
          const size = getNodeSize(stat.callCount, maxCalls)
          const color = getNodeColor(stat)
          const r = size / 2

          return (
            <g key={stat.toolName}>
              {/* Tooltip via SVG title */}
              <title>
                {stat.toolName}: {stat.callCount} calls, avg {stat.avgDurationMs}ms
                {stat.errorCount > 0 ? `, ${stat.errorCount} errors` : ''}
              </title>

              {/* Glow */}
              <motion.circle
                cx={x}
                cy={y}
                r={r + 2}
                fill={color}
                opacity={0.12}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.15 }}
              />

              {/* Node */}
              <motion.circle
                cx={x}
                cy={y}
                r={r}
                fill="var(--card)"
                stroke={color}
                strokeWidth={1.5}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.15, ease: 'easeOut' }}
              />

              {/* Tool icon placeholder (small wrench) */}
              <text
                x={x}
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize={Math.max(7, r * 0.8)}
                fontFamily="monospace"
              >
                {stat.toolName.charAt(0).toUpperCase()}
              </text>
            </g>
          )
        })}

        {/* Overflow node */}
        {overflow > 0 && (() => {
          const angle = (visibleTools.length / totalNodes) * Math.PI * 2 - Math.PI / 2
          const x = 100 + Math.cos(angle) * ORBIT_RADIUS
          const y = 100 + Math.sin(angle) * ORBIT_RADIUS
          return (
            <g>
              <circle cx={x} cy={y} r={10} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
              <text
                x={x}
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--muted-foreground)"
                fontSize={8}
                fontFamily="monospace"
              >
                +{overflow}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
