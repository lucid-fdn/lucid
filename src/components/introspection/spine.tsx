'use client'

/**
 * Spine — The agent's nervous system, made visible.
 *
 * A vertical line that transitions between emotion states.
 * Uses centralized EMOTION_VISUALS for consistent visual language.
 */

import { cn } from '@/lib/utils'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { EMOTION_VISUALS } from './emotion-visuals'
import type { IntrospectionEmotion } from '@contracts/introspection'

interface SpineProps {
  emotion: IntrospectionEmotion
  className?: string
}

export function Spine({ emotion, className }: SpineProps) {
  const v = EMOTION_VISUALS[emotion]

  return (
    <div className={cn('flex flex-col items-center gap-0', className)}>
      <BreathingDot
        color={v.dot}
        animate={v.dotAnimate}
        size="sm"
      />
      <div
        className={cn(
          'w-px flex-1 min-h-[2rem] border-l transition-all duration-150',
          v.spine,
        )}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      />
    </div>
  )
}

export function SpineLine({ emotion }: { emotion: IntrospectionEmotion }) {
  const v = EMOTION_VISUALS[emotion]
  return (
    <div
      className={cn(
        'w-px self-stretch border-l transition-all duration-150',
        v.spine,
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    />
  )
}
