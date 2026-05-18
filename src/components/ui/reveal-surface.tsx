'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { CanvasRevealEffect } from '@/components/ui/canvas-reveal-effect'

interface RevealSurfaceProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function RevealSurface({
  children,
  className,
  contentClassName,
}: RevealSurfaceProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative overflow-hidden rounded-[32px] border border-border/60 bg-background',
        className,
      )}
    >
      <AnimatePresence>
        {hovered ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <CanvasRevealEffect
              animationSpeed={5}
              containerClassName="bg-transparent"
              colors={[
                [59, 130, 246],
                [139, 92, 246],
              ]}
              opacities={[0.2, 0.2, 0.2, 0.2, 0.2, 0.4, 0.4, 0.4, 0.4, 1]}
              dotSize={2}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="absolute inset-0 [mask-image:radial-gradient(400px_at_center,white,transparent)] bg-black/50 dark:bg-black/90" />
      <div className={cn('relative z-10', contentClassName)}>{children}</div>
    </div>
  )
}
