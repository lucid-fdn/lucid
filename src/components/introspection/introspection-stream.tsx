'use client'

/**
 * IntrospectionStream — Main component for the Consciousness Stream.
 *
 * Vertical spine with nodes rendered in real-time. Shows idle view when
 * no active run, active stream during runs, and supports click-to-expand
 * trace inspection.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Spine, SpineLine } from './spine'
import { StreamNode } from './stream-node'
import { IdleView } from './idle-view'
import { TraceInspector } from './trace-inspector'
import { CollapsedToolGroup, useCollapsedNodes } from './collapsed-tool-group'
import { EMOTION_VISUALS } from './emotion-visuals'
import {
  useIntrospectionStream,
  type StreamNode as StreamNodeType,
} from '@/hooks/use-introspection-stream'

interface IntrospectionStreamProps {
  orgId: string
  agentId: string
  enabled: boolean
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
  /** Hero mode: hides header (moved to HeroStream layout), stretches content full-width */
  heroMode?: boolean
  className?: string
}

const nodeAnimation = {
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 4 },
  transition: {
    duration: 0.18,
    ease: [0.2, 0.8, 0.2, 1] as const,
  },
}

export function IntrospectionStream({
  orgId,
  agentId,
  enabled,
  channels,
  tasks,
  lastMemory,
  heroMode = false,
  className,
}: IntrospectionStreamProps) {
  const { nodes, isActive, activeRunId, emotion, streamState } = useIntrospectionStream({
    orgId,
    agentId,
    enabled,
  })

  const prefersReducedMotion = useReducedMotion()
  const collapsedItems = useCollapsedNodes(nodes)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)

  // Auto-scroll to bottom during active runs
  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [nodes.length, isActive])

  const handleExpand = useCallback((node: StreamNodeType) => {
    setExpandedNodeId((prev) => (prev === node.id ? null : node.id))
  }, [])

  if (streamState === 'disabled') return null

  const emotionVisual = EMOTION_VISUALS[emotion]

  // Emotion-driven subtle background tint on the stream
  const streamBgStyle = emotionVisual.streamBg
    ? { background: `linear-gradient(to bottom, transparent 0%, ${emotionVisual.streamBg} 100%)` }
    : undefined

  return (
    <div className={cn('flex flex-col', className)} style={streamBgStyle}>
      {/* Header — hidden in hero mode (HeroStream provides its own) */}
      {!heroMode && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <Spine emotion={emotion} className="h-5" />
          <span className={cn('text-xs font-medium', emotionVisual.text)}>
            {emotionVisual.label}
          </span>
          {isActive && activeRunId && (
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
              {activeRunId.slice(0, 8)}
            </span>
          )}
        </div>
      )}

      {/* Content area */}
      <div ref={scrollRef} className="overflow-y-auto">
        <div className="flex">
          {/* Spine line */}
          <div className="flex-shrink-0 w-4 flex justify-center">
            <SpineLine emotion={emotion} />
          </div>

          {/* Nodes, waiting, or idle view */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {streamState === 'waiting' ? (
                <motion.div
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="py-4 px-4">
                    <p className="text-sm text-muted-foreground">Waiting for first activity.</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Send a message or trigger a task.</p>
                  </div>
                </motion.div>
              ) : isActive || nodes.length > 0 ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <AnimatePresence initial={false}>
                    {collapsedItems.map((item, idx) => {
                      // ageIndex: 0 = newest (bottom), higher = older (top)
                      const ageIndex = collapsedItems.length - 1 - idx
                      if ('type' in item && item.type === 'group') {
                        return (
                          <div key={`group-${item.toolName}-${item.nodes[0].id}`} style={{ contentVisibility: 'auto', opacity: Math.max(0.25, 1 - ageIndex * 0.14) }}>
                            <CollapsedToolGroup toolName={item.toolName} nodes={item.nodes} />
                          </div>
                        )
                      }
                      const node = item as StreamNodeType
                      return (
                        <motion.div
                          key={node.id}
                          {...(prefersReducedMotion ? {} : nodeAnimation)}
                          layout={!prefersReducedMotion}
                          style={{ contentVisibility: 'auto' }}
                        >
                          <StreamNode node={node} onExpand={handleExpand} ageIndex={ageIndex} />
                          <AnimatePresence>
                            {expandedNodeId === node.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden pl-4 pr-2"
                              >
                                <TraceInspector
                                  node={node}
                                  onClose={() => setExpandedNodeId(null)}
                                  className="my-1"
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <IdleView
                    channels={channels}
                    tasks={tasks}
                    lastMemory={lastMemory}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
