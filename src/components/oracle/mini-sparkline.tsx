'use client'

import { useId, useMemo } from 'react'

/**
 * Mini SVG sparkline — always-visible heartbeat monitor.
 *
 * Idle:   Tiny EKG heartbeat loop (SVG animateMotion) — agent is sleeping but alive
 * Active: Smooth curves from real data, progressive intensity based on event volume
 *
 * Pure SVG, zero dependencies.
 */
export function MiniSparkline({
  data,
  width = 60,
  height = 20,
  color = '#3b82f6',
  idleOpacity = 0.4,
  strokeScale = 1,
  idleMode = 'heartbeat',
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  /** Opacity of the idle EKG group (default 0.4, use higher on light backgrounds) */
  idleOpacity?: number
  /** Multiplier for stroke width + dot sizes (default 1, use 1.5 for canvas nodes) */
  strokeScale?: number
  /** Idle rendering mode. Heartbeat means alive; flat means suspended/dead. */
  idleMode?: 'heartbeat' | 'flat'
}) {
  const instanceId = useId()
  const gradientId = `spark-fill-${instanceId}`

  const hasActivity = data.length > 0 && data.some((v) => v > 0)
  const totalEvents = data.reduce((a, b) => a + b, 0)

  // Intensity: 0 (idle) → 1 (busy) — drives opacity, stroke width, glow
  const intensity = Math.min(totalEvents / 10, 1)

  // Compute points + smooth path for real data
  const { linePath, areaPath, endX, endY } = useMemo(() => {
    const padding = 2
    const baseline = height - padding

    if (!hasActivity) {
      return { linePath: '', areaPath: '', endX: width - padding, endY: baseline }
    }

    const max = Math.max(...data, 1)
    const pts = data.map((v, i) => ({
      x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
      y: padding + (1 - v / max) * (height - padding * 2),
    }))

    const line = smoothPath(pts)
    const lastPt = pts[pts.length - 1]
    const firstPt = pts[0]
    const area = `${line} L ${lastPt.x},${baseline} L ${firstPt.x},${baseline} Z`

    return { linePath: line, areaPath: area, endX: lastPt.x, endY: lastPt.y }
  }, [data, width, height, hasActivity])

  // EKG heartbeat path for idle state — small blip in the middle
  const padding = 2
  const baseline = height - padding
  const ekgPath = useMemo(() => {
    const mid = width / 2
    const blipH = (height - padding * 2) * 0.35 // small heartbeat amplitude
    // flat ── tiny dip ── sharp spike up ── spike down ── recover ── flat
    return [
      `M ${padding},${baseline}`,
      `L ${mid - 8},${baseline}`,
      `L ${mid - 5},${baseline + 1}`,    // tiny dip before beat
      `L ${mid - 2},${baseline - blipH}`, // spike up
      `L ${mid + 1},${baseline + blipH * 0.5}`, // spike down
      `L ${mid + 4},${baseline}`,          // recover
      `L ${width - padding},${baseline}`,
    ].join(' ')
  }, [width, height, padding, baseline])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block overflow-visible"
      style={strokeScale > 1 ? { filter: `drop-shadow(0 0 6px ${color}26)` } : undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={hasActivity ? 0.1 + intensity * 0.2 : 0} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* ── Idle: EKG heartbeat loop ── */}
      {!hasActivity && idleMode === 'flat' ? (
        <g opacity={idleOpacity} style={{ transition: 'opacity 200ms ease' }}>
          <path
            d={`M ${padding},${baseline} L ${width - padding},${baseline}`}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="200"
            strokeDashoffset="200"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="200;0;0"
              keyTimes="0;0.6;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.6;0.6;0"
              keyTimes="0;0.1;0.7;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </path>
          <circle r={1.5} fill={color}>
            <animateMotion
              path={`M ${padding},${baseline} L ${width - padding},${baseline}`}
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.8;0.8;0"
              keyTimes="0;0.1;0.7;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      ) : null}

      {!hasActivity && idleMode === 'heartbeat' && (
        <g opacity={idleOpacity} style={{ transition: 'opacity 200ms ease' }}>
          {/* Static EKG trace */}
          <path
            d={ekgPath}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="200"
            strokeDashoffset="200"
          >
            <animate
              attributeName="stroke-dashoffset"
              values="200;0;0"
              keyTimes="0;0.6;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.6;0.6;0"
              keyTimes="0;0.1;0.7;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </path>

          {/* Traveling dot along the EKG */}
          <circle r={1.5} fill={color}>
            <animateMotion
              path={ekgPath}
              dur="2.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.8;0.8;0"
              keyTimes="0;0.1;0.7;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}

      {/* ── Active: real data ── */}
      {hasActivity && (
        <g style={{ transition: 'opacity 200ms ease' }}>
          {/* Gradient fill — intensity drives opacity */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              style={{ transition: 'd 0.6s ease-out' }}
            />
          )}

          {/* Smooth line — stroke gets bolder with more activity */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={(1 + intensity * 0.8) * strokeScale}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={strokeScale > 1 ? 0.6 + intensity * 0.4 : 0.5 + intensity * 0.5}
            style={{ transition: 'd 0.6s ease-out, stroke-opacity 0.4s ease, stroke-width 0.4s ease' }}
          />

          {/* Subtle glow under the line for prominence */}
          {strokeScale > 1 && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={(2 + intensity * 2) * strokeScale}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.08 + intensity * 0.08}
              style={{ transition: 'd 0.6s ease-out, stroke-opacity 0.4s ease' }}
            />
          )}

          {/* End dot — grows with intensity */}
          <circle
            cx={endX}
            cy={endY}
            r={(1.5 + intensity) * strokeScale}
            fill={color}
            fillOpacity={0.6 + intensity * 0.4}
            style={{ transition: 'cx 0.6s ease-out, cy 0.6s ease-out, r 0.4s ease, fill-opacity 0.4s ease' }}
          />

          {/* Glow ring on high activity */}
          {intensity > 0.5 && (
            <circle
              cx={endX}
              cy={endY}
              r={3 + intensity * 2}
              fill="none"
              stroke={color}
              strokeWidth={0.5}
              opacity={0.3}
              style={{ transition: 'cx 0.6s ease-out, cy 0.6s ease-out' }}
            >
              <animate
                attributeName="r"
                values={`${3 + intensity * 2};${5 + intensity * 2};${3 + intensity * 2}`}
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.3;0.1;0.3"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      )}
    </svg>
  )
}

// ── Smooth path (Catmull-Rom → Cubic Bézier) ──────────────────────

interface Point {
  x: number
  y: number
}

function smoothPath(pts: Point[]): string {
  if (pts.length < 2) return `M ${pts[0].x},${pts[0].y}`
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`

  const tension = 0.3
  let d = `M ${pts[0].x},${pts[0].y}`

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  return d
}
