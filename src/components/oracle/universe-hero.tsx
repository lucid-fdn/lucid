'use client'

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  fadeDir: number // 1 = fading in, -1 = fading out
}

/**
 * Subtle animated particle field background.
 * Renders 60-80 small floating dots on a dark canvas.
 * Pure Canvas API, no dependencies.
 */
export function UniverseHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)

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
      ctx!.scale(dpr, dpr)
    }

    resize()
    window.addEventListener('resize', resize)

    // Initialize particles
    const count = 70
    const particles: Particle[] = []
    const rect = canvas.getBoundingClientRect()

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: 1.0 + Math.random() * 1.8,
        opacity: 0.1 + Math.random() * 0.5,
        fadeDir: Math.random() > 0.5 ? 1 : -1,
      })
    }
    particlesRef.current = particles

    function draw() {
      if (!canvas || !ctx) return
      const w = canvas.getBoundingClientRect().width
      const h = canvas.getBoundingClientRect().height

      ctx.clearRect(0, 0, w, h)

      for (const p of particlesRef.current) {
        // Move
        p.x += p.vx
        p.y += p.vy

        // Wrap around edges
        if (p.x < -5) p.x = w + 5
        if (p.x > w + 5) p.x = -5
        if (p.y < -5) p.y = h + 5
        if (p.y > h + 5) p.y = -5

        // Fade in/out
        p.opacity += p.fadeDir * 0.002
        if (p.opacity >= 0.7) {
          p.opacity = 0.7
          p.fadeDir = -1
        } else if (p.opacity <= 0.05) {
          p.opacity = 0.05
          p.fadeDir = 1
        }

        // Draw with subtle glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 200, 220, ${p.opacity})` // lighter for visibility
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  )
}
