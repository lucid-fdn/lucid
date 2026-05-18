'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { GraphNode, GraphLink } from '@/lib/oracle/api'

// ── Layout types ────────────────────────────────────────────

interface SimNode {
  id: string
  name: string | null
  tx_count: number
  portfolio_value_usd: number | null
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  hasEcosystem: boolean
  isActive: boolean
}

interface SimLink {
  source: string
  target: string
  tx_count: number
  total_value_usd: number | null
}

// ── Color helpers ───────────────────────────────────────────

function nodeColor(node: { hasEcosystem: boolean; isActive: boolean }): string {
  if (node.hasEcosystem) return '#3b82f6' // blue-500
  if (node.isActive) return '#10b981' // emerald-500
  return '#71717a' // zinc-500
}

function nodeGlowColor(node: { hasEcosystem: boolean; isActive: boolean }): string {
  if (node.hasEcosystem) return 'rgba(59, 130, 246, 0.3)'
  if (node.isActive) return 'rgba(16, 185, 129, 0.3)'
  return 'rgba(113, 113, 122, 0.15)'
}

// ── Component ───────────────────────────────────────────────

interface ForceGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
}

export function ForceGraph({ nodes, links }: ForceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const simNodesRef = useRef<SimNode[]>([])
  const simLinksRef = useRef<SimLink[]>([])
  const hoveredRef = useRef<SimNode | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; node: SimNode
  } | null>(null)

  // Initialize simulation nodes
  useEffect(() => {
    if (nodes.length === 0) return

    const cx = 300
    const cy = 200
    const layoutRadius = Math.min(cx, cy) * 0.7

    // Build sim nodes in circular layout
    const simNodes: SimNode[] = nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const jitter = (Math.random() - 0.5) * 40
      // Scale radius by tx_count (min 3, max 14)
      const r = Math.max(3, Math.min(14, 3 + Math.sqrt(n.tx_count) * 1.5))
      const hasEco = !!n.name && n.name.length > 0
      return {
        id: n.id,
        name: n.name,
        tx_count: n.tx_count,
        portfolio_value_usd: n.portfolio_value_usd,
        x: cx + Math.cos(angle) * layoutRadius + jitter,
        y: cy + Math.sin(angle) * layoutRadius + jitter,
        vx: 0,
        vy: 0,
        radius: r,
        hasEcosystem: hasEco,
        isActive: n.tx_count > 0,
        color: '',
      }
    })

    // Assign colors
    for (const n of simNodes) {
      n.color = nodeColor(n)
    }

    simNodesRef.current = simNodes
    simLinksRef.current = links.map((l) => ({
      source: l.source,
      target: l.target,
      tx_count: l.tx_count ?? 0,
      total_value_usd: l.total_value_usd,
    }))
  }, [nodes, links])

  // Force simulation + drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const nodeMap = new Map<string, SimNode>()

    let tick = 0
    const maxTicks = 200 // stop simulation after convergence
    const alpha = 0.3
    const decay = 0.995

    function simulate() {
      const simNodes = simNodesRef.current
      const simLinks = simLinksRef.current
      if (simNodes.length === 0) return

      // Rebuild map
      nodeMap.clear()
      for (const n of simNodes) nodeMap.set(n.id, n)

      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height
      const cxCenter = w / 2
      const cyCenter = h / 2

      if (tick < maxTicks) {
        const currentAlpha = alpha * Math.pow(decay, tick)

        // Center gravity
        for (const n of simNodes) {
          n.vx += (cxCenter - n.x) * 0.001 * currentAlpha
          n.vy += (cyCenter - n.y) * 0.001 * currentAlpha
        }

        // Repulsion between nodes
        for (let i = 0; i < simNodes.length; i++) {
          for (let j = i + 1; j < simNodes.length; j++) {
            const a = simNodes[i]
            const b = simNodes[j]
            let dx = b.x - a.x
            let dy = b.y - a.y
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 1) { dist = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5 }
            const force = (80 * currentAlpha) / (dist * dist)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            a.vx -= fx
            a.vy -= fy
            b.vx += fx
            b.vy += fy
          }
        }

        // Link attraction
        for (const link of simLinks) {
          const s = nodeMap.get(link.source)
          const t = nodeMap.get(link.target)
          if (!s || !t) continue
          const dx = t.x - s.x
          const dy = t.y - s.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1) continue
          const targetDist = 60
          const force = (dist - targetDist) * 0.005 * currentAlpha
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          s.vx += fx
          s.vy += fy
          t.vx -= fx
          t.vy -= fy
        }

        // Apply velocity with damping
        for (const n of simNodes) {
          n.vx *= 0.8
          n.vy *= 0.8
          n.x += n.vx
          n.y += n.vy
          // Clamp to canvas
          n.x = Math.max(n.radius, Math.min(w - n.radius, n.x))
          n.y = Math.max(n.radius, Math.min(h - n.radius, n.y))
        }

        tick++
      }

      // ── Draw ────────────────────────────────────────────

      ctx!.clearRect(0, 0, w, h)

      // Links
      for (const link of simLinks) {
        const s = nodeMap.get(link.source)
        const t = nodeMap.get(link.target)
        if (!s || !t) continue
        const thickness = Math.max(0.5, Math.min(3, link.tx_count * 0.3))
        const isHovered =
          hoveredRef.current?.id === link.source || hoveredRef.current?.id === link.target
        ctx!.beginPath()
        ctx!.moveTo(s.x, s.y)
        ctx!.lineTo(t.x, t.y)
        ctx!.strokeStyle = isHovered
          ? 'rgba(161, 161, 170, 0.4)'
          : 'rgba(63, 63, 70, 0.4)'
        ctx!.lineWidth = isHovered ? thickness + 0.5 : thickness
        ctx!.stroke()
      }

      // Nodes
      for (const n of simNodes) {
        const isHovered = hoveredRef.current?.id === n.id

        // Glow
        if (isHovered || n.isActive) {
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, n.radius + (isHovered ? 6 : 3), 0, Math.PI * 2)
          ctx!.fillStyle = isHovered
            ? 'rgba(255, 255, 255, 0.08)'
            : nodeGlowColor(n)
          ctx!.fill()
        }

        // Node circle
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx!.fillStyle = n.color
        ctx!.fill()

        // Label for named nodes or hovered
        if (n.name && (isHovered || n.radius > 6)) {
          ctx!.font = '10px ui-monospace, monospace'
          ctx!.fillStyle = isHovered ? '#e4e4e7' : '#a1a1aa'
          ctx!.textAlign = 'center'
          ctx!.fillText(
            n.name.length > 16 ? n.name.slice(0, 15) + '...' : n.name,
            n.x,
            n.y - n.radius - 5,
          )
        }
      }

      rafRef.current = requestAnimationFrame(simulate)
    }

    rafRef.current = requestAnimationFrame(simulate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [nodes, links])

  // Mouse interaction
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      let found: SimNode | null = null
      for (const n of simNodesRef.current) {
        const dx = mx - n.x
        const dy = my - n.y
        if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) {
          found = n
          break
        }
      }

      hoveredRef.current = found
      if (found) {
        setTooltip({ x: e.clientX, y: e.clientY, node: found })
        canvas.style.cursor = 'pointer'
      } else {
        setTooltip(null)
        canvas.style.cursor = 'default'
      }
    },
    [],
  )

  const handleClick = useCallback(() => {
    const hovered = hoveredRef.current
    if (hovered) {
      window.location.href = `/oracle/agents/${hovered.id}`
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null
    setTooltip(null)
  }, [])

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background p-12 text-center">
        <p className="text-sm text-muted-foreground">No network data available</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 420 }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg border border-border bg-popover/95 shadow-xl backdrop-blur-sm"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
          }}
        >
          <div className="text-xs font-medium text-foreground">
            {tooltip.node.name ?? `Agent ${tooltip.node.id.slice(0, 8)}...`}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
            <span>{tooltip.node.tx_count} txns</span>
            {tooltip.node.portfolio_value_usd != null &&
              tooltip.node.portfolio_value_usd > 0 && (
                <span className="text-emerald-400">
                  ${tooltip.node.portfolio_value_usd >= 1000
                    ? `${(tooltip.node.portfolio_value_usd / 1000).toFixed(1)}K`
                    : tooltip.node.portfolio_value_usd.toFixed(0)}
                </span>
              )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          Named
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          Active
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-zinc-500" />
          Idle
        </div>
      </div>
    </div>
  )
}
