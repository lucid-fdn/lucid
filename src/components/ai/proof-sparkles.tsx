'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface ProofSparklesProps {
  show: boolean
  position?: 'top-right' | 'bottom-right'
  className?: string
}

/**
 * Proof Sparkles
 * Tiny animated indicator for Thought Epoch proofs
 * 
 * Features:
 * - Sparkle animation (1s)
 * - Purple color (#8B5CF6)
 * - Appears when proof saved
 * - Tooltip on hover
 */
export function ProofSparkles({
  show,
  position = 'top-right',
  className,
}: ProofSparklesProps) {
  if (!show) return null

  const positionClasses = {
    'top-right': 'top-2 right-2',
    'bottom-right': 'bottom-2 right-2',
  }

  return (
    <motion.div
      className={cn(
        "absolute",
        positionClasses[position],
        "group",
        className
      )}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: [0, 1, 1, 0],
        scale: [0.5, 1, 1, 0.5]
      }}
      transition={{
        duration: 1,
        times: [0, 0.3, 0.7, 1],
        repeat: Infinity,
        repeatDelay: 2
      }}
    >
      {/* Sparkle Dot */}
      <div className="w-2 h-2 rounded-full bg-purple-500 relative">
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-purple-400 blur-sm opacity-75" />
      </div>

      {/* Tooltip */}
      <div className={cn(
        "absolute bottom-full right-0 mb-2",
        "px-2 py-1 rounded bg-purple-900 text-white text-xs whitespace-nowrap",
        "opacity-0 group-hover:opacity-100",
        "transition-opacity duration-200",
        "pointer-events-none"
      )}>
        ✨ Proof saved to LucidScan
      </div>
    </motion.div>
  )
}
