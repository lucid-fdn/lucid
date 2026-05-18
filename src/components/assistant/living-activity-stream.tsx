'use client'

/**
 * LivingActivityStream — Ambient agent activity display.
 *
 * Not logs. Not events. A living signal layer.
 * Events fade in, drift upward, fade out. Max 5 visible.
 * Presence line always visible. Waveform breathes with state.
 *
 * No borders. No cards. Air, signal, flow.
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react'
import { EMOTION_COLORS } from '@/components/introspection/hero/agent-pulse'
import { getChannelUiStats } from '@/lib/channels/types'
import { setVisibleInterval } from '@/lib/utils/visible-interval'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { FeedEvent, FeedEventType, AgentPresenceState } from '@/lib/mission-control/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'

function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ─── Event → human-readable label ────────────────────────────────────────────

const EVENT_LABELS: Partial<Record<FeedEventType, string>> = {
  message_received: 'Incoming message',
  message_sent: 'Response sent',
  run_started: 'Processing started',
  run_finished: 'Processing complete',
  tool_call: 'Calling tool',
  tool_result: 'Tool result received',
  native_mutation_candidate: 'Native mutation proposed',
  error: 'Error detected',
  approval_requested: 'Approval needed',
  approval_resolved: 'Approval resolved',
  transaction_submitted: 'Transaction submitted',
  transaction_confirmed: 'Transaction confirmed',
  task_scheduled: 'Task scheduled',
  task_completed: 'Task completed',
  agent_message_sent: 'Cross-agent message',
  subagent_spawned: 'Subagent spawned',
  inbound: 'Message received',
  outbound: 'Message delivered',
}

function getEventLabel(event: FeedEvent): string {
  const base = EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')
  // Add channel context if available
  const channel = event.payload?.channel_type as string | undefined
  if (channel && (event.event_type === 'message_received' || event.event_type === 'inbound')) {
    return `${base} — ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
  }
  // Add tool name if available
  const toolName = event.payload?.tool_name as string | undefined
  if (toolName && (event.event_type === 'tool_call' || event.event_type === 'native_mutation_candidate')) {
    return `${base} — ${toolName}`
  }
  // Add latency if available
  const latency = event.payload?.latency_ms as number | undefined
  if (latency && event.event_type === 'message_sent') {
    return `${base} • ${latency}ms`
  }
  return base
}

function getEventIntensity(type: FeedEventType): 'low' | 'medium' | 'high' {
  if (type === 'error' || type === 'approval_requested') return 'high'
  if (type === 'run_started' || type === 'message_received' || type === 'transaction_submitted' || type === 'native_mutation_candidate') return 'medium'
  return 'low'
}

// ─── Live age display ────────────────────────────────────────────────────────

function formatAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function LiveAge({ createdAt }: { createdAt: string }) {
  const [label, setLabel] = useState(() => formatAge(createdAt))
  useEffect(() => {
    return setVisibleInterval(() => setLabel(formatAge(createdAt)), 1000)
  }, [createdAt])
  return <>{label}</>
}

// ─── Micro breathing waveform ────────────────────────────────────────────────

const WAVE_BARS = 12
const WAVE_HEIGHTS = [0.3, 0.7, 0.5, 0.9, 0.4, 0.8, 0.35, 0.75, 1.0, 0.45, 0.65, 0.55]

function BreathingWaveform({
  color,
  intensity,
  eventKick,
}: {
  color: string
  intensity: 'idle' | 'listening' | 'active'
  eventKick: number
}) {
  const config = {
    idle:      { opacity: 0.15, duration: 5.0, height: 12 },
    listening: { opacity: 0.22, duration: 3.2, height: 16 },
    active:    { opacity: 0.35, duration: 1.6, height: 20 },
  }[intensity]

  const kickValue = useMotionValue(1)
  const kickSpring = useSpring(kickValue, { stiffness: 100, damping: 12 })

  useEffect(() => {
    if (!eventKick) return
    kickValue.set(1.6)
    const t = setTimeout(() => kickValue.set(1), 400)
    return () => clearTimeout(t)
  }, [eventKick, kickValue])

  return (
    <div className="flex items-end gap-[2px]" style={{ height: config.height }}>
      {WAVE_HEIGHTS.map((h, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: 1.5,
            height: config.height,
            backgroundColor: color,
            opacity: config.opacity,
            originY: 1,
            scaleY: kickSpring,
          }}
          animate={{
            scaleY: [h * 0.1, h, WAVE_HEIGHTS[(i + 3) % WAVE_BARS] * 0.4, h * 0.1],
          }}
          transition={{
            duration: config.duration + (i % 4) * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  )
}

// ─── Stream event line ───────────────────────────────────────────────────────

interface StreamLine {
  id: string
  label: string
  intensity: 'low' | 'medium' | 'high'
  timestamp: string
}

function StreamEventLine({
  line,
  color,
  index,
}: {
  line: StreamLine
  color: string
  index: number
}) {
  const intensityOpacity = {
    low: 0.40,
    medium: 0.60,
    high: 0.80,
  }[line.intensity]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{
        opacity: intensityOpacity - index * 0.08,
        y: 0,
        filter: 'blur(0px)',
      }}
      exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex items-center gap-2 text-[11px] font-mono"
      style={{ color }}
    >
      <span
        className="w-1 h-1 rounded-full shrink-0"
        style={{
          backgroundColor: color,
          opacity: line.intensity === 'high' ? 0.9 : 0.5,
        }}
      />
      <span className="truncate">{line.label}</span>
    </motion.div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const MAX_VISIBLE_LINES = 5

const IDLE_SIGNALS = [
  'No incoming events',
  'Monitoring channels…',
  'System nominal',
  'Standing by',
  'Channels quiet',
]

export function LivingActivityStream({
  emotion = 'idle',
  presenceState = 'idle',
  channels = [],
  activityEvents = [],
  lastEvent,
  className,
}: {
  emotion?: IntrospectionEmotion
  presenceState?: AgentPresenceState
  channels?: AssistantChannel[]
  activityEvents?: FeedEvent[]
  lastEvent?: FeedEvent | null
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLight = mounted && resolvedTheme === 'light'

  const baseColor = EMOTION_COLORS[emotion]
  // Solid elements (dots, text, bars) use darkened color in light mode; gradients keep original
  const color = isLight ? darkenHex(baseColor, 0.45) : baseColor
  const activeChannels = getChannelUiStats(channels).connectedChannels
  const channelLabel = activeChannels.length > 0
    ? activeChannels.map((c) => c.channel_type.charAt(0).toUpperCase() + c.channel_type.slice(1)).join(', ')
    : null

  const waveformIntensity = presenceState === 'idle' ? 'idle'
    : presenceState === 'receiving' ? 'listening'
    : 'active'

  // ── Stream lines from real events ──
  const [lines, setLines] = useState<StreamLine[]>([])
  const processedIds = useRef(new Set<string>())
  const [eventKick, setEventKick] = useState(0)

  // Process new events into stream lines
  useEffect(() => {
    if (activityEvents.length === 0) return

    const newLines: StreamLine[] = []
    for (const event of activityEvents.slice(0, 10)) {
      if (processedIds.current.has(event.id)) continue
      processedIds.current.add(event.id)
      newLines.push({
        id: event.id,
        label: getEventLabel(event),
        intensity: getEventIntensity(event.event_type),
        timestamp: event.created_at,
      })
    }

    if (newLines.length > 0) {
      setEventKick((k) => k + 1)
      setLines((prev) => [...newLines, ...prev].slice(0, MAX_VISIBLE_LINES))
    }
  }, [activityEvents])

  // Idle cycling signal when no events
  const [idleSignal, setIdleSignal] = useState(0)
  useEffect(() => {
    if (lines.length > 0 || presenceState !== 'idle') return
    const t = setInterval(() => setIdleSignal((i) => (i + 1) % IDLE_SIGNALS.length), 4000)
    return () => clearInterval(t)
  }, [lines.length, presenceState])

  // Thinking state progression
  const [thinkingPhase, setThinkingPhase] = useState(0)
  const THINKING_PHASES = ['Thinking…', 'Parsing intent…', 'Loading context…', 'Generating response…']
  useEffect(() => {
    if (presenceState !== 'thinking' && presenceState !== 'responding') {
      setThinkingPhase(0)
      return
    }
    const t = setInterval(() => {
      setThinkingPhase((p) => Math.min(p + 1, THINKING_PHASES.length - 1))
    }, 1200)
    return () => clearInterval(t)
  }, [presenceState])

  const isProcessing = presenceState === 'thinking' || presenceState === 'responding' || presenceState === 'tool-calling'

  return (
    <div className={className}>
      {/* ── Presence line — always visible, no container ── */}
      <div className="flex items-center gap-3 px-14 py-3 max-w-[860px]">
        {/* Pulsing dot */}
        <span className="relative flex items-center justify-center w-3 h-3 shrink-0">
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: isProcessing ? (isLight ? darkenHex('#34d399', 0.55) : '#34d399') : color }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{ duration: isProcessing ? 1.2 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span
            className="w-2 h-2 rounded-full relative z-10"
            style={{ backgroundColor: isProcessing ? (isLight ? darkenHex('#34d399', 0.55) : '#34d399') : color }}
          />
        </span>

        {/* Presence text */}
        <span className="text-xs text-muted-foreground font-medium">
          {channelLabel ? (
            <>Listening on <span className="text-foreground capitalize">{channelLabel}</span></>
          ) : (
            <span className="text-muted-foreground">No channels connected</span>
          )}
        </span>

        {/* Separator */}
        <span className="text-muted-foreground/30">•</span>

        {/* Last event age */}
        <span className="text-xs text-muted-foreground">
          {lastEvent ? (
            <>Last event <LiveAge createdAt={lastEvent.created_at} /></>
          ) : (
            'Waiting for first event'
          )}
        </span>

        {/* Waveform — right-aligned */}
        <div className="ml-auto">
          <BreathingWaveform
            color={color}
            intensity={waveformIntensity}
            eventKick={eventKick}
          />
        </div>
      </div>

      {/* ── Activity stream — ambient, terminal-like ── */}
      <div className="px-14 pb-4 max-w-[860px] min-h-[80px]">
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-[11px] font-mono mb-2"
            style={{ color: isLight ? darkenHex('#34d399', 0.55) : '#34d399' }}
          >
            <motion.span
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: isLight ? darkenHex('#34d399', 0.55) : '#34d399' }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <AnimatePresence mode="wait">
              <motion.span
                key={thinkingPhase}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 0.8, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                {THINKING_PHASES[thinkingPhase]}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {lines.length > 0 ? (
            lines.map((line, index) => (
              <StreamEventLine
                key={line.id}
                line={line}
                color={color}
                index={index}
              />
            ))
          ) : !isProcessing ? (
            <motion.div
              key={`idle-${idleSignal}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.30 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              className="text-[11px] font-mono text-muted-foreground"
            >
              {IDLE_SIGNALS[idleSignal]}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ── Channel status (per-channel, subtle) ── */}
      {activeChannels.length > 1 && (
        <div className="flex items-center gap-4 px-14 pb-3 max-w-[860px]">
          {activeChannels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground"
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: color, opacity: 0.5 }}
              />
              <span className="capitalize">{ch.channel_type}</span>
              <span className="text-muted-foreground/50">— Listening</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
