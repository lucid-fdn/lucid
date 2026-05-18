'use client'

/**
 * ToolProgress — SVG circular progress ring.
 * Fills from 0 to 100% when tool_result arrives.
 */

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ToolProgressProps {
  status: 'active' | 'complete' | 'error'
  className?: string
}

const RADIUS = 8
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ToolProgress({ status, className }: ToolProgressProps) {
  const progress = status === 'active' ? 0.5 : 1
  const color = status === 'error' ? '#ef4444' : status === 'complete' ? '#34d399' : '#60a5fa'

  return (
    <svg
      className={cn('h-5 w-5 -rotate-90', className)}
      viewBox="0 0 20 20"
    >
      {/* Background ring */}
      <circle
        cx="10" cy="10" r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="2"
      />
      {/* Progress ring */}
      <motion.circle
        cx="10" cy="10" r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        initial={{ strokeDashoffset: CIRCUMFERENCE }}
        animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </svg>
  )
}
