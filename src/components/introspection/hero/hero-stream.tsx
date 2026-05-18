'use client'

/**
 * HeroStream — Orchestrator: ambient idle <-> active stream.
 *
 * AnimatePresence switches between AmbientPresence (idle) and
 * IntrospectionStream (active) with 200ms Apple easing crossfade.
 * AgentPulse persists in header during active via shared layoutId.
 */

import { AnimatePresence, motion } from 'motion/react'
import { AmbientPresence } from './ambient-presence'
import { SmartAnnotations } from './smart-annotations'
import { IntrospectionStream } from '../introspection-stream'
import { cn } from '@/lib/utils'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { StreamNode } from '@/hooks/use-introspection-stream'
import type { ToolUsageStat } from '@/hooks/use-tool-usage-stats'
import type { Annotation } from '@/hooks/use-smart-annotations'

interface HeroStreamProps {
  orgId: string
  agentId: string
  enabled: boolean
  isActive: boolean
  emotion: IntrospectionEmotion
  annotations: Annotation[]
  channels?: Array<{
    type: string
    name?: string
    message_count?: number
  }>
  tasks?: Array<{
    id: string
    label: string
    next_run_at?: string
  }>
  lastMemory?: {
    content: string
    created_at: string
  } | null
  memoryCount?: number
  toolStats: ToolUsageStat[]
  className?: string
}

const crossfade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15, ease: [0.2, 0.8, 0.2, 1] as const },
}

export function HeroStream({
  orgId,
  agentId,
  enabled,
  isActive,
  emotion,
  annotations,
  channels,
  tasks,
  lastMemory,
  memoryCount,
  toolStats,
  className,
}: HeroStreamProps) {
  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Content: idle ambient or active stream */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {isActive ? (
            <motion.div key="active" {...crossfade} className="absolute inset-0 overflow-y-auto">
              <IntrospectionStream
                orgId={orgId}
                agentId={agentId}
                enabled={enabled}
                channels={channels}
                tasks={tasks}
                lastMemory={lastMemory}
                heroMode
              />
              {/* Smart annotations after stream content */}
              {annotations.length > 0 && (
                <div className="px-4">
                  <SmartAnnotations annotations={annotations} />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="idle" {...crossfade} className="absolute inset-0">
              <AmbientPresence
                emotion={emotion}
                channels={channels}
                tasks={tasks}
                lastMemory={lastMemory}
                memoryCount={memoryCount}
                toolStats={toolStats}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
