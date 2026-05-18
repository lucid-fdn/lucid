'use client'

import { memo, useRef, useEffect } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow'

export interface DataFlowEdgeData {
  is_active: boolean
  eventCount?: number
  lastEventAt?: number
}

/**
 * Animated edge showing data flow direction.
 * Active connections show animated dashes flowing from agent → channel.
 * Event particles: SVG circles with animateMotion along edge path.
 * Event pulse: CSS class toggle (no keyed remount) on new events.
 */
const DataFlowEdgeComponent = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<DataFlowEdgeData>) => {
  const isActive = data?.is_active ?? false
  const eventCount = data?.eventCount ?? 0
  const lastEventAt = data?.lastEventAt ?? 0

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  })

  // Ref-based pulse detection (no remount)
  const lastSeenRef = useRef(0)
  const pulseRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (lastEventAt > 0 && lastEventAt !== lastSeenRef.current) {
      lastSeenRef.current = lastEventAt
      const el = pulseRef.current
      if (el) {
        el.classList.remove('animate-edge-pulse')
        // Force reflow to restart animation
        void el.getBoundingClientRect()
        el.classList.add('animate-edge-pulse')
      }
    }
  }, [lastEventAt])

  // Determine particle count based on event intensity
  const particleCount = eventCount === 0 ? 0 : eventCount <= 3 ? 1 : eventCount <= 10 ? 2 : 3
  const particleDur = '2s'
  const particleStagger = 0.7

  return (
    <>
      {/* Base path */}
      <BaseEdge
        path={edgePath}
        style={{
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: selected
            ? 'hsl(var(--primary))'
            : isActive
              ? 'hsl(var(--muted-foreground) / 0.4)'
              : 'hsl(var(--muted-foreground) / 0.15)',
          strokeDasharray: isActive ? undefined : '6 4',
        }}
      />

      {/* Animated flow overlay for active connections */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          strokeWidth={1.5}
          stroke="hsl(var(--primary) / 0.5)"
          strokeDasharray="6 12"
          className="animate-flow"
        />
      )}

      {/* Event pulse overlay (CSS class toggle, no remount) */}
      <path
        ref={pulseRef}
        d={edgePath}
        fill="none"
        stroke="hsl(var(--primary) / 0.8)"
        strokeWidth={1.5}
        strokeOpacity={0}
        pointerEvents="none"
      />

      {/* Data flow particles */}
      {particleCount > 0 && Array.from({ length: particleCount }, (_, i) => (
        <circle
          key={i}
          r={2}
          fill="hsl(var(--primary))"
          opacity={0.8}
        >
          <animateMotion
            path={edgePath}
            dur={particleDur}
            begin={`${i * particleStagger}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </>
  )
}

export const DataFlowEdge = memo(DataFlowEdgeComponent)
DataFlowEdge.displayName = 'DataFlowEdge'
