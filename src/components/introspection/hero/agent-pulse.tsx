'use client'

/**
 * AgentPulse — Central breathing SVG indicator encoding full agent state.
 *
 * 3 concentric circles: core (solid), glow (blurred), pulse ring (expanding).
 * Rhythm driven by emotion. Uses layoutId for shared layout animation
 * between idle (centered, lg) and active (header, md) positions.
 */

import { motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { EMOTION_VISUALS } from '../emotion-visuals'
import { usePrefersReducedMotion } from '@/lib/design/motion'
import type { IntrospectionEmotion } from '@contracts/introspection'

function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

interface AgentPulseProps {
  emotion: IntrospectionEmotion
  size?: 'md' | 'lg' | 'xl'
  /** Increment to trigger a reactive "kick" (e.g. on new event) */
  eventTick?: number
  layoutId?: string
  className?: string
}

export const EMOTION_COLORS: Record<IntrospectionEmotion, string> = {
  idle: '#E8B86D',      // warm amber — signature idle
  confident: '#34d399', // emerald-400
  cautious: '#fbbf24',  // amber-400
  strained: '#f87171',  // red-400
  learning: '#60a5fa',  // blue-400
}

const SIZES = {
  md: { viewBox: 48, core: 8, glow: 12, ring: 18, outerRing: null, breatheRing: null },
  lg: { viewBox: 96, core: 14, glow: 22, ring: 34, outerRing: 44, breatheRing: null },
  xl: { viewBox: 180, core: 24, glow: 40, ring: 60, outerRing: 76, breatheRing: 86 },
} as const

export function AgentPulse({
  emotion,
  size = 'md',
  eventTick,
  layoutId,
  className,
}: AgentPulseProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLight = mounted && resolvedTheme === 'light'

  const visual = EMOTION_VISUALS[emotion]
  const baseColor = EMOTION_COLORS[emotion]
  // Core dot uses darkened color in light mode; rings/glow keep original for subtle effect
  const color = isLight ? darkenHex(baseColor, 0.45) : baseColor
  const s = SIZES[size]
  const center = s.viewBox / 2
  const dim = size === 'xl' ? 180 : size === 'lg' ? 96 : 48

  // Slower, more organic pulse for xl
  const effectivePulseMs = size === 'xl' ? Math.max(visual.pulseMs, 3000) : visual.pulseMs

  // Organic pulse scale via spring
  const pulseValue = useMotionValue(1)
  const pulseSpring = useSpring(pulseValue, { stiffness: 80, damping: 15 })

  useEffect(() => {
    if (prefersReducedMotion) return

    const interval = setInterval(() => {
      pulseValue.set(size === 'xl' ? 1.1 : 1.15)
      setTimeout(() => pulseValue.set(1), effectivePulseMs * 0.4)
    }, effectivePulseMs)

    return () => clearInterval(interval)
  }, [effectivePulseMs, pulseValue, prefersReducedMotion, size])

  // Event-reactive kick — dot briefly swells when an event arrives
  useEffect(() => {
    if (!eventTick || prefersReducedMotion) return
    pulseValue.set(size === 'xl' ? 1.25 : 1.3)
    const t = setTimeout(() => pulseValue.set(1), 400)
    return () => clearTimeout(t)
  }, [eventTick, pulseValue, prefersReducedMotion, size])

  return (
    <motion.div
      layoutId={layoutId}
      className={className}
      style={{ width: dim, height: dim }}
    >
      <svg
        viewBox={`0 0 ${s.viewBox} ${s.viewBox}`}
        width={dim}
        height={dim}
      >
        {/* Outermost breathing ring (xl only — ultra-faint, slow independent drift) */}
        {s.breatheRing != null && (
          <motion.circle
            cx={center}
            cy={center}
            r={s.breatheRing}
            fill="none"
            stroke={baseColor}
            strokeWidth={0.3}
            animate={prefersReducedMotion ? {} : { opacity: [0.03, 0.10, 0.03] }}
            transition={{
              duration: effectivePulseMs / 1000 * 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ scale: prefersReducedMotion ? 1 : pulseSpring }}
            transform-origin={`${center} ${center}`}
          />
        )}

        {/* Outer halo ring — very faint, slow drift */}
        {s.outerRing != null && (
          <motion.circle
            cx={center}
            cy={center}
            r={s.outerRing}
            fill="none"
            stroke={baseColor}
            strokeWidth={size === 'xl' ? 0.4 : 0.5}
            opacity={0.06}
            style={{ scale: prefersReducedMotion ? 1 : pulseSpring }}
            transform-origin={`${center} ${center}`}
          />
        )}

        {/* Pulse ring (expanding) */}
        <motion.circle
          cx={center}
          cy={center}
          r={s.ring}
          fill="none"
          stroke={baseColor}
          strokeWidth={1}
          opacity={0.15}
          style={{ scale: prefersReducedMotion ? 1 : pulseSpring }}
          transform-origin={`${center} ${center}`}
        />

        {/* Glow (blurred) — breathes on an independent slower cycle */}
        <motion.circle
          cx={center}
          cy={center}
          r={s.glow}
          fill={baseColor}
          filter="url(#pulse-blur)"
          animate={prefersReducedMotion ? {} : {
            opacity: size === 'xl'
              ? [0.08, 0.20, 0.10, 0.18, 0.08]
              : [0.05, 0.12, 0.05],
          }}
          transition={{
            duration: (effectivePulseMs / 1000) * 1.7,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: (effectivePulseMs / 1000) * 0.25,
          }}
        />

        {/* Core (solid) */}
        <motion.circle
          cx={center}
          cy={center}
          r={s.core}
          fill={color}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{
            duration: effectivePulseMs / 1000,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <defs>
          <filter id="pulse-blur">
            <feGaussianBlur stdDeviation={size === 'xl' ? 14 : size === 'lg' ? 6 : 3} />
          </filter>
        </defs>
      </svg>
    </motion.div>
  )
}
