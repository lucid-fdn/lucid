'use client'

/**
 * GhostActivity — Live System Brain (right-side execution consciousness).
 *
 * This IS the product differentiation. Not a component — a living system zone.
 * The right side is the execution brain. 70% of emotional UX lives here.
 *
 * Architecture (6 layers, back to front):
 *   1. Zone field — ultra-gradual gradient (NO visible edge — dissolves into bg)
 *   2. Data field — reactive particles (ambient nervous system)
 *   3. Event echoes — real FeedEvent visual reactions
 *   4. Signal bridge — particle travels left→right on events
 *   5. Activity beacon — dot + waveform + status (synchronized organism)
 *   6. Semantic whispers — evolving timeline with temporal context
 *
 * Coordinated state machine (EVERYTHING syncs from STATE_CONFIG):
 *   Idle      → almost silent, dim, minimal (CONTRAST creates magic)
 *   Listening → gentle presence, flowing field
 *   Active    → ALIVE — full bars, bright field, fast whispers
 *   Event hit → SYNCHRONIZED spike (dot + bars + field + glow, 300-600ms)
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'motion/react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { EMOTION_COLORS } from '@/components/introspection/hero/agent-pulse'
import { setVisibleInterval } from '@/lib/utils/visible-interval'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { FeedEvent, FeedEventType } from '@/lib/mission-control/types'

// ─── Semantic whispers (evolving narrative, not stacked) ─────────────────────

const IDLE_WHISPERS: Array<[string, string]> = [
  ['System ready', '0 pending'],
  ['Memory idle', 'No queries'],
  ['Standing by', 'Channels quiet'],
  ['Heartbeat ok', 'Next: 5s'],
  ['Context clear', 'Awaiting signal'],
]

const LISTENING_WHISPERS: Array<[string, string]> = [
  ['Monitoring inbound', 'Next: 2.3s'],
  ['Channels active', '0 detected'],
  ['Pipeline warm', 'Ready'],
  ['Scanning sources', 'Waiting'],
  ['Context loaded', 'Standing by'],
]

const ACTIVE_WHISPERS: Array<[string, string]> = [
  ['Processing input', 'Parsing intent…'],
  ['Context loaded', 'Reasoning…'],
  ['Tool dispatch', 'Executing…'],
  ['Generating', 'Streaming…'],
  ['Memory write', 'Storing…'],
]

// ─── Event → semantic label + visual echo ────────────────────────────────────

type EchoType = 'pulse' | 'streak' | 'glow'
interface EchoEffect { type: EchoType; scale: number }

const EVENT_ECHO_MAP: Partial<Record<FeedEventType, EchoEffect>> = {
  message_received:       { type: 'pulse',  scale: 1.2 },
  message_sent:           { type: 'pulse',  scale: 1.0 },
  run_started:            { type: 'glow',   scale: 1.5 },
  run_finished:           { type: 'glow',   scale: 1.0 },
  tool_call:              { type: 'streak', scale: 1.0 },
  tool_result:            { type: 'streak', scale: 0.8 },
  error:                  { type: 'pulse',  scale: 1.8 },
  approval_requested:     { type: 'pulse',  scale: 1.4 },
  transaction_submitted:  { type: 'streak', scale: 1.3 },
  transaction_confirmed:  { type: 'glow',   scale: 1.2 },
  task_scheduled:         { type: 'pulse',  scale: 0.9 },
}

const EVENT_LABELS: Partial<Record<FeedEventType, string>> = {
  message_received: 'Message inbound',
  message_sent: 'Response delivered',
  run_started: 'Run initiated',
  run_finished: 'Run complete',
  tool_call: 'Tool executing',
  tool_result: 'Tool returned',
  error: 'Error detected',
  approval_requested: 'Approval needed',
  transaction_submitted: 'Transaction sent',
  transaction_confirmed: 'Transaction confirmed',
  task_scheduled: 'Task queued',
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BAR_COUNT = 24
const BAR_HEIGHTS = [
  0.3, 0.7, 0.45, 0.9, 0.55, 0.8, 0.35, 0.65, 1.0, 0.4,
  0.75, 0.5, 0.85, 0.3, 0.6, 0.95, 0.42, 0.78, 0.52, 0.88,
  0.38, 0.72, 0.58, 0.82,
]

const ECHO_POSITIONS = [
  { x: 25, y: 15 }, { x: 70, y: 30 }, { x: 50, y: 50 },
  { x: 80, y: 65 }, { x: 35, y: 75 }, { x: 60, y: 12 },
  { x: 65, y: 40 }, { x: 20, y: 55 }, { x: 85, y: 25 },
  { x: 45, y: 80 }, { x: 75, y: 18 }, { x: 30, y: 38 },
]

/**
 * STATE_CONFIG — single source of truth for the coordinated state machine.
 *
 * IDLE is intentionally dim/silent so that when something HAPPENS the
 * contrast creates the "it woke up" moment. That contrast IS the magic.
 */
const STATE_CONFIG = {
  idle: {
    waveOpacity: 0.14,        // visible but calm
    waveDuration: 7.0,        // very slow, meditative
    waveScale: 0.05,          // FLAT — barely any movement at all
    ghostInterval: 5500,
    maxGhosts: 3,
    flowSpeed: 0.4,
    flowOpacity: 0.05,
    fieldPulse: 0.09,
    dotSpeed: 3.5,
    dotScale: [1, 1.03, 1] as number[],
    dotOpacity: [0.45, 0.22, 0.45] as number[],
    glowBase: 0.025,
    barHeight: 64,
    labelOpacity: 0.50,       // whispers visible (was 0.35 — too faint)
  },
  listening: {
    waveOpacity: 0.28,
    waveDuration: 3.2,
    waveScale: 0.55,
    ghostInterval: 3500,
    maxGhosts: 5,
    flowSpeed: 0.8,
    flowOpacity: 0.08,
    fieldPulse: 0.065,
    dotSpeed: 2.2,
    dotScale: [1, 1.15, 1] as number[],
    dotOpacity: [0.65, 0.30, 0.65] as number[],
    glowBase: 0.05,
    barHeight: 80,
    labelOpacity: 0.55,
  },
  active: {
    waveOpacity: 0.50,
    waveDuration: 1.6,
    waveScale: 1.0,
    ghostInterval: 2000,
    maxGhosts: 6,
    flowSpeed: 1.8,
    flowOpacity: 0.14,
    fieldPulse: 0.10,
    dotSpeed: 1.2,
    dotScale: [1, 1.3, 1] as number[],
    dotOpacity: [1, 0.4, 1] as number[],
    glowBase: 0.10,
    barHeight: 96,
    labelOpacity: 0.75,
  },
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface GhostLine { id: number; primary: string; secondary: string; age: number }
interface Echo { id: number; x: number; y: number; effect: EchoEffect; color: string }
interface EventLine { id: string; label: string; age: number }
interface BridgeParticle { id: number }

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Light-mode variant: darkens the color and boosts opacity so gradients
 * are visible on white/light backgrounds.
 */
function hexToRgbaLight(hex: string, alpha: number): string {
  let r = parseInt(hex.slice(1, 3), 16)
  let g = parseInt(hex.slice(3, 5), 16)
  let b = parseInt(hex.slice(5, 7), 16)
  // Darken by 40% to increase contrast against white
  r = Math.round(r * 0.6)
  g = Math.round(g * 0.6)
  b = Math.round(b * 0.6)
  // Boost opacity 5x (capped at 0.7 to keep it ambient, not opaque)
  const boosted = Math.min(alpha * 5, 0.7)
  return `rgba(${r},${g},${b},${boosted})`
}

/**
 * Darken a hex color for text readability on light backgrounds.
 * Returns a hex string darkened by the given factor (0-1, lower = darker).
 */
function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function formatAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5) return `0.${Math.floor(Math.random() * 9)}s ago`
  if (diff < 60) return `${diff}s ago`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ─── Data field — reactive ambient particles ────────────────────────────────

const FIELD_PARTICLES = [
  { x: 15, y: 8, delay: 0 },
  { x: 35, y: 20, delay: 2.1 },
  { x: 58, y: 14, delay: 4.3 },
  { x: 80, y: 35, delay: 1.4 },
  { x: 22, y: 48, delay: 3.7 },
  { x: 65, y: 58, delay: 0.8 },
  { x: 42, y: 72, delay: 5.2 },
  { x: 88, y: 18, delay: 2.9 },
  { x: 50, y: 38, delay: 1.9 },
  { x: 30, y: 65, delay: 4.1 },
  { x: 75, y: 45, delay: 3.3 },
  { x: 85, y: 68, delay: 1.1 },
  { x: 18, y: 82, delay: 2.5 },
  { x: 55, y: 88, delay: 3.8 },
]

function DataField({
  color,
  opacity,
  speedMultiplier,
  eventKick,
  toRgba,
}: {
  color: string
  opacity: number
  speedMultiplier: number
  eventKick: number
  toRgba: (hex: string, alpha: number) => string
}) {
  const flashValue = useMotionValue(0)
  const flashSpring = useSpring(flashValue, { stiffness: 120, damping: 18 })

  useEffect(() => {
    if (!eventKick) return
    flashValue.set(0.30)
    const t = setTimeout(() => flashValue.set(0), 500)
    return () => clearTimeout(t)
  }, [eventKick, flashValue])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Field flash — synchronized with beacon on events */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 70% 40%, ${toRgba(color, 0.14)} 0%, transparent 55%)`,
          opacity: flashSpring,
        }}
      />

      {/* Ambient particles */}
      {FIELD_PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            backgroundColor: color,
          }}
          animate={{
            opacity: [opacity * 0.3, opacity, opacity * 0.5, opacity * 0.8, opacity * 0.3],
            x: [0, (i % 2 === 0 ? 14 : -14) / speedMultiplier, 0],
            y: [0, (i % 3 === 0 ? -12 : 8), 0],
          }}
          transition={{
            duration: (14 + i * 1.3) / speedMultiplier,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: p.delay,
          }}
        />
      ))}

      {/* Directional flow lanes — left→right drift */}
      {[
        { y: 15, dur: 14, size: 3 },
        { y: 35, dur: 18, size: 2.5 },
        { y: 55, dur: 12, size: 3 },
        { y: 72, dur: 16, size: 2.5 },
        { y: 88, dur: 20, size: 2 },
      ].map((lane, i) => (
        <motion.div
          key={`lane-${i}`}
          className="absolute rounded-full"
          style={{
            top: `${lane.y}%`,
            width: lane.size,
            height: lane.size,
            backgroundColor: color,
            opacity: opacity * 0.4,
          }}
          animate={{
            left: ['-3%', '103%'],
            top: [`${lane.y}%`, `${lane.y + (i % 2 === 0 ? 5 : -5)}%`, `${lane.y}%`],
          }}
          transition={{
            left: {
              duration: lane.dur / speedMultiplier,
              repeat: Infinity,
              ease: 'linear',
              delay: i * 3.5,
            },
            top: {
              duration: lane.dur / speedMultiplier,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
        />
      ))}
    </div>
  )
}

// ─── Signal bridge — particle from left→right on events ─────────────────────

function SignalBridge({ particles, color, toRgba }: { particles: BridgeParticle[]; color: string; toRgba: (hex: string, alpha: number) => string }) {
  return (
    <AnimatePresence>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            top: '46%',
            width: 5,
            height: 5,
            backgroundColor: color,
            filter: 'blur(1.5px)',
            boxShadow: `0 0 10px ${toRgba(color, 0.5)}`,
          }}
          initial={{ left: '-5%', opacity: 0.7, y: '-50%' }}
          animate={{ left: '92%', opacity: 0 }}
          exit={{}}
          transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
        />
      ))}
    </AnimatePresence>
  )
}

// ─── Activity beacon — dot + waveform + status (THE CORE ORGANISM) ──────────

function ActivityBeacon({
  color,
  glowColor,
  cfg,
  eventKick,
  channelCount,
  presenceState,
  eventLine,
  lastEventAge,
  toRgba,
  isLight,
}: {
  color: string
  glowColor: string
  cfg: typeof STATE_CONFIG['idle']
  eventKick: number
  channelCount: number
  presenceState: 'idle' | 'listening' | 'active'
  eventLine: EventLine | null
  lastEventAge: string | null
  toRgba: (hex: string, alpha: number) => string
  isLight: boolean
}) {
  // Light mode needs higher base opacities for visibility on white
  const lightBoost = isLight ? 3 : 1
  // Synchronized springs — EVERYTHING reacts together (300-600ms)
  const glowValue = useMotionValue(cfg.glowBase * lightBoost)
  const glowSpring = useSpring(glowValue, { stiffness: 60, damping: 20 })
  const barKickValue = useMotionValue(1)
  const barKickSpring = useSpring(barKickValue, { stiffness: 100, damping: 12 })
  const dotKickValue = useMotionValue(1)
  const dotKickSpring = useSpring(dotKickValue, { stiffness: 120, damping: 14 })

  useEffect(() => {
    if (!eventKick) return
    // HERO MOMENT — synchronized spike across all elements
    glowValue.set(0.50)
    barKickValue.set(2.4)
    dotKickValue.set(2.0)
    const t1 = setTimeout(() => glowValue.set(cfg.glowBase * lightBoost), 800)
    const t2 = setTimeout(() => barKickValue.set(1), 600)
    const t3 = setTimeout(() => dotKickValue.set(1), 400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [eventKick, glowValue, barKickValue, dotKickValue, cfg.glowBase, lightBoost])

  const statusLabel = presenceState === 'active'
    ? 'Processing'
    : presenceState === 'listening'
      ? `${channelCount} channel${channelCount !== 1 ? 's' : ''}`
      : 'Standby'

  return (
    <div className="relative flex flex-col items-end">
      {/* ── Identity row — dot + label (strengthened) ── */}
      <div className="flex items-center gap-3 mb-8 mr-1">
        {/* Dot — SYNCHRONIZED with state config + event kick springs */}
        <span className="relative flex items-center justify-center">
          {/* Ambient glow ring */}
          <motion.span
            className="absolute rounded-full"
            style={{
              width: 14,
              height: 14,
              backgroundColor: glowColor,
              opacity: glowSpring,
              filter: 'blur(5px)',
            }}
          />
          {/* Core dot */}
          <motion.span
            className="w-2.5 h-2.5 rounded-full relative z-10"
            style={{
              backgroundColor: color,
              scale: dotKickSpring,
            }}
            animate={{
              opacity: cfg.dotOpacity,
              scale: cfg.dotScale,
            }}
            transition={{
              duration: cfg.dotSpeed,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </span>
        {/* Label — brighter, slightly larger for identity lock-on */}
        <span
          className="text-[11px] font-mono uppercase tracking-[0.16em]"
          style={{ color: color, opacity: Math.min(cfg.labelOpacity * lightBoost, 1) }}
        >
          Activity
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          · {statusLabel}
        </span>
      </div>

      {/* ── Halo glow — ambient + event-reactive ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 240,
          height: 140,
          right: -40,
          top: 20,
          background: `radial-gradient(ellipse, ${toRgba(glowColor, 0.18)} 0%, transparent 65%)`,
          filter: 'blur(20px)',
          opacity: glowSpring,
        }}
      />

      {/* ── Waveform bars — EXPANDED, state-driven, event-reactive ── */}
      <div className="relative flex items-end gap-[3.5px]" style={{ height: cfg.barHeight }}>
        {BAR_HEIGHTS.map((h, i) => {
          const minScale = h * (0.03 + (1 - cfg.waveScale) * 0.03)
          const maxScale = h * (0.20 + cfg.waveScale * 0.80)
          const midScale = BAR_HEIGHTS[(i + 5) % BAR_COUNT] * (0.08 + cfg.waveScale * 0.42)
          // Micro variation — bars breathe independently
          const jitter1 = BAR_HEIGHTS[(i + 7) % BAR_COUNT] * (0.05 + cfg.waveScale * 0.15)
          const jitter2 = BAR_HEIGHTS[(i + 11) % BAR_COUNT] * (0.06 + cfg.waveScale * 0.12)
          // Micro spikes scale with state — idle barely moves, active pulses
          const microSpike = i % 6 === 0 ? maxScale * (0.25 + cfg.waveScale * 0.40) : jitter2
          return (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: 2.5,
                height: cfg.barHeight,
                backgroundColor: color,
                opacity: Math.min(cfg.waveOpacity * lightBoost, 0.85),
                originY: 1,
                scaleY: barKickSpring,
              }}
              animate={{
                scaleY: [minScale, maxScale, midScale, jitter1, microSpike, maxScale * 0.6, minScale],
              }}
              transition={{
                duration: cfg.waveDuration + (i % 5) * 0.35,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.07,
              }}
            />
          )
        })}
      </div>

      {/* ── Event line + temporal info ── */}
      <div className="flex flex-col items-end gap-2 mt-6 mr-1 min-h-[44px]">
        <AnimatePresence mode="wait">
          {eventLine && eventLine.age < 12 && (
            <motion.div
              key={eventLine.id}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 0.80, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(3px)' }}
              transition={{ duration: 0.25 }}
              className="text-[11px] font-mono font-medium text-right"
              style={{ color: color }}
            >
              {eventLine.label}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Temporal — "Last: 0.8s ago" (creates memory/time feeling) */}
        <AnimatePresence mode="wait">
          {lastEventAge && (
            <motion.span
              key={lastEventAge}
              initial={{ opacity: 0, filter: 'blur(2px)' }}
              animate={{ opacity: 0.35, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[9px] font-mono text-muted-foreground"
            >
              Last: {lastEventAge}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Echo renderers ──────────────────────────────────────────────────────────

function EchoElement({ echo }: { echo: Echo }) {
  const { effect, color, x, y } = echo
  const size = 8 * effect.scale

  if (effect.type === 'pulse') {
    return (
      <motion.div
        className="absolute rounded-full border-2"
        style={{ left: `${x}%`, top: `${y}%`, borderColor: color }}
        initial={{ width: size, height: size, opacity: 0.6, x: '-50%', y: '-50%' }}
        animate={{ width: size * 10, height: size * 10, opacity: 0 }}
        exit={{}}
        transition={{ duration: 2.2, ease: 'easeOut' }}
      />
    )
  }

  if (effect.type === 'streak') {
    return (
      <motion.div
        className="absolute rounded-full"
        style={{ top: `${y}%`, backgroundColor: color, height: 2 }}
        initial={{ left: `${x - 5}%`, width: 0, opacity: 0.55 }}
        animate={{ left: `${x + 15}%`, width: 50, opacity: 0 }}
        exit={{}}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />
    )
  }

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${x}%`, top: `${y}%`,
        backgroundColor: color,
        filter: 'blur(16px)',
      }}
      initial={{ width: size * 3, height: size * 3, opacity: 0.3, x: '-50%', y: '-50%' }}
      animate={{ width: size * 8, height: size * 8, opacity: 0 }}
      exit={{}}
      transition={{ duration: 2.8, ease: 'easeOut' }}
    />
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function GhostActivity({
  emotion = 'idle',
  isActive = false,
  hasChannels = false,
  channelCount = 0,
  activityEvents = [],
  className,
}: {
  emotion?: IntrospectionEmotion
  isActive?: boolean
  hasChannels?: boolean
  channelCount?: number
  activityEvents?: FeedEvent[]
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Default to dark (original behavior) until client-side theme resolves
  const isLight = mounted && resolvedTheme === 'light'

  const presenceState = isActive ? 'active' : hasChannels ? 'listening' : 'idle'
  const cfg = STATE_CONFIG[presenceState]
  const baseColor = useMemo(() => EMOTION_COLORS[emotion], [emotion])
  // Gradients use the original bright color (looks good on both themes via toRgba boosting)
  // Solid elements (dots, bars, text) use darkened color in light mode for contrast
  const color = useMemo(() => isLight ? darkenHex(baseColor, 0.45) : baseColor, [baseColor, isLight])

  // Theme-aware rgba: light mode needs higher opacity + darker colors
  const toRgba = useCallback(
    (hex: string, alpha: number) => isLight ? hexToRgbaLight(hex, alpha) : hexToRgba(hex, alpha),
    [isLight],
  )

  const whispers = presenceState === 'active' ? ACTIVE_WHISPERS
    : presenceState === 'listening' ? LISTENING_WHISPERS
    : IDLE_WHISPERS

  // ── Semantic ghost whispers ──
  const [lines, setLines] = useState<GhostLine[]>([])
  const nextLineId = useRef(0)

  useEffect(() => {
    const emit = () => {
      const pair = whispers[Math.floor(Math.random() * whispers.length)]
      setLines((prev) => [
        { id: nextLineId.current++, primary: pair[0], secondary: pair[1], age: 0 },
        ...prev,
      ].slice(0, cfg.maxGhosts))
    }
    const age = setInterval(() => {
      setLines((prev) => prev.map((l) => ({ ...l, age: l.age + 1 })).filter((l) => l.age < 6))
    }, 2000)
    emit()
    const t = setInterval(emit, cfg.ghostInterval + Math.random() * 2000)
    return () => { clearInterval(age); clearInterval(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceState])

  // ── Event processing ──
  const [echoes, setEchoes] = useState<Echo[]>([])
  const [eventLine, setEventLine] = useState<EventLine | null>(null)
  const [bridgeParticles, setBridgeParticles] = useState<BridgeParticle[]>([])
  const nextEchoId = useRef(0)
  const nextBridgeId = useRef(0)
  const posIdx = useRef(0)
  const lastProcessedEventId = useRef<string | null>(null)
  const [eventKick, setEventKick] = useState(0)

  const spawnEcho = useCallback((effect: EchoEffect) => {
    const pos = ECHO_POSITIONS[posIdx.current % ECHO_POSITIONS.length]
    posIdx.current++
    const jitterX = (Math.random() - 0.5) * 16
    const jitterY = (Math.random() - 0.5) * 16
    const id = nextEchoId.current++
    const echo: Echo = {
      id,
      x: Math.max(5, Math.min(95, pos.x + jitterX)),
      y: Math.max(5, Math.min(95, pos.y + jitterY)),
      effect,
      color,
    }
    setEchoes((prev) => [...prev, echo])
    setEventKick((k) => k + 1)
    setTimeout(() => setEchoes((prev) => prev.filter((e) => e.id !== id)), 3000)
  }, [color])

  const spawnBridge = useCallback(() => {
    const id = nextBridgeId.current++
    setBridgeParticles((prev) => [...prev, { id }])
    setTimeout(() => setBridgeParticles((prev) => prev.filter((p) => p.id !== id)), 1500)
  }, [])

  useEffect(() => {
    if (!eventLine) return
    const t = setInterval(() => {
      setEventLine((prev) => prev ? { ...prev, age: prev.age + 1 } : null)
    }, 1000)
    return () => clearInterval(t)
  }, [eventLine?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activityEvents.length === 0) return
    const newest = activityEvents[0]
    if (!newest || newest.id === lastProcessedEventId.current) return
    lastProcessedEventId.current = newest.id
    const effect = EVENT_ECHO_MAP[newest.event_type]
    if (effect) {
      spawnEcho(effect)
      spawnBridge()
    }
    const label = EVENT_LABELS[newest.event_type]
    if (label) {
      setEventLine({ id: newest.id, label, age: 0 })
    }
  }, [activityEvents, spawnEcho, spawnBridge])

  // ── Live last-event age ──
  const lastEvent = activityEvents[0] ?? null
  const [lastEventAge, setLastEventAge] = useState<string | null>(null)
  useEffect(() => {
    if (!lastEvent) { setLastEventAge(null); return }
    setLastEventAge(formatAge(lastEvent.created_at))
    return setVisibleInterval(() => setLastEventAge(formatAge(lastEvent.created_at)), 1000)
  }, [lastEvent])

  return (
    <div
      className={cn(
        // WIDE zone — this is an execution brain, not a sidebar decoration
        'absolute inset-y-0 right-0 w-[480px] pointer-events-none overflow-hidden',
        'flex flex-col justify-center',
        className,
      )}
    >
      {/* ═══ Layer 1: Zone field — NO VISIBLE EDGE ═══
          The gradient must dissolve seamlessly into the page background.
          Start at 0% transparent, stay transparent until 40%, then GRADUALLY
          build presence. Multiple stops prevent any sudden color shift. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, transparent 0%, transparent 15%, ${toRgba(baseColor, cfg.fieldPulse * 0.25)} 32%, ${toRgba(baseColor, cfg.fieldPulse * 0.55)} 52%, ${toRgba(baseColor, cfg.fieldPulse * 0.85)} 70%, ${toRgba(baseColor, cfg.fieldPulse * 1.2)} 86%, ${toRgba(baseColor, cfg.fieldPulse * 1.5)} 100%)`,
        }}
      />
      {/* Vertical warmth — very subtle top/bottom edges */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${toRgba(baseColor, cfg.fieldPulse * 0.2)} 0%, transparent 20%, transparent 80%, ${toRgba(baseColor, cfg.fieldPulse * 0.2)} 100%)`,
        }}
      />
      {/* Corner anchor — soft radial at top-right (focus point) */}
      <div
        className="absolute top-0 right-0 w-[250px] h-[250px]"
        style={{
          background: `radial-gradient(ellipse at 100% 0%, ${toRgba(baseColor, cfg.fieldPulse * 0.35)} 0%, transparent 75%)`,
        }}
      />

      {/* ═══ Layer 2: Data field — ambient nervous system ═══ */}
      <DataField
        color={baseColor}
        opacity={isLight ? cfg.flowOpacity * 4 : cfg.flowOpacity}
        speedMultiplier={cfg.flowSpeed}
        eventKick={eventKick}
        toRgba={toRgba}
      />

      {/* ═══ Layer 3: Event echoes ═══ */}
      <AnimatePresence>
        {echoes.map((echo) => (
          <EchoElement key={echo.id} echo={echo} />
        ))}
      </AnimatePresence>

      {/* ═══ Layer 4: Signal bridge — left→right particle on events ═══ */}
      <SignalBridge particles={bridgeParticles} color={color} toRgba={toRgba} />

      {/* ═══ Layer 5: Activity beacon (THE CORE — generous vertical space) ═══ */}
      <div className="relative pr-16 py-8">
        <ActivityBeacon
          color={color}
          glowColor={baseColor}
          cfg={cfg}
          eventKick={eventKick}
          channelCount={channelCount}
          presenceState={presenceState}
          eventLine={eventLine}
          lastEventAge={lastEventAge}
          toRgba={toRgba}
          isLight={isLight}
        />
      </div>

      {/* ═══ Layer 6: Semantic whispers — evolving timeline ═══ */}
      <div className="flex flex-col gap-6 mt-10 pr-16">
        {lines.map((line, index) => {
          // Base opacity driven by state (idle needs to be readable)
          // Light mode: boost so colored text is visible on white
          const lightMul = isLight ? 1.5 : 1
          const baseOpacity = (presenceState === 'active' ? 0.65 : presenceState === 'listening' ? 0.58 : 0.52) * lightMul
          // Progressive fade: newest is brightest, oldest fades to nothing
          const ageFade = Math.max(0.06, baseOpacity - line.age * 0.09)
          const secondaryFade = Math.max(0.04, (baseOpacity * 0.5) - line.age * 0.05)
          const blur = Math.min(line.age * 0.4, 1.5)
          // First line is "current", rest are history
          const isCurrent = index === 0
          return (
            <motion.div
              key={line.id}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{
                opacity: 1,
                y: 0,
                filter: `blur(${blur}px)`,
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-right"
            >
              {/* Primary — strong, clear, THIS is what the system is doing */}
              <div
                className={cn(
                  'font-mono leading-relaxed',
                  isCurrent ? 'text-[12px] font-medium' : 'text-[10px]',
                )}
                style={{ color: color, opacity: isCurrent ? ageFade * 1.1 : ageFade }}
              >
                {line.primary}
              </div>
              {/* Secondary — softer, smaller, contextual */}
              <div
                className="text-[9px] font-mono leading-relaxed mt-0.5"
                style={{ color: 'var(--muted-foreground)', opacity: secondaryFade }}
              >
                {line.secondary}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
