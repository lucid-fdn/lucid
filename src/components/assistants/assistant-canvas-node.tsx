'use client'

import { memo, useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Wallet, Crown, AlertTriangle, Server, Check, Loader2, PowerOff, Power } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/animate-ui/primitives/radix/tooltip'
import { ModelIcon } from '@/components/icons/model-icon'
import { EngineIcon, engineHasLogo } from '@/components/icons/engine-icon'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { AvatarStack } from '@/components/ui/avatar-stack'
import { CapabilityAvatarStack } from '@/components/ui/capability-avatar-stack'
import { LogoIcon } from '@/components/ui/logo-icon'
import { useAgentPresence } from '@/hooks/use-agent-presence'
import { HEALTH_SCORE_THRESHOLDS } from '@/lib/mission-control/health-score-constants'
import { PRESENCE_STATE_CONFIG } from '@/lib/mission-control/constants'
import { TypingText } from '@/ui/components/typing-text'
import { getVibeStatusLabel } from '@/lib/expressions'
import { formatRelativeTime } from '@/lib/mission-control/constants'
import type { FeedEvent, L2DeployStatus } from '@/lib/mission-control/types'
import { getChannelUiStats } from '@/lib/channels/types'
import { resolveCapabilityIconItems } from '@/lib/capabilities/icon-resolver'

export interface AssistantNodeData {
  label: string
  status: 'active' | 'paused' | 'idle'
  model: string
  systemPrompt?: string | null
  memoryEnabled?: boolean
  walletEnabled?: boolean
  channels: { id: string; channel_type: string; is_active: boolean }[]
  updatedAt: string
  feedEvents: FeedEvent[]
  onSelect?: (id: string) => void
  isCoordinator?: boolean
  isDeleting?: boolean
  isShuttingDown?: boolean
  isResuming?: boolean
  // MC monitoring data
  healthScore?: number | null
  presenceState?: string
  recentEventCount?: number
  recentErrorCount?: number
  runtimeProvider?: string | null
  isFocused?: boolean
  engine?: string | null
  skills?: { id: string; slug: string }[]
  onNameChange?: (id: string, name: string) => void
  deployment?: {
    phase: 'deploying' | 'connecting' | 'creating' | 'failed'
    l2Status?: L2DeployStatus | null
    startedAt?: number
    onRetry?: () => void
    onCancel?: () => void
  }
}

const STATUS_DOT_COLORS: Record<string, { color: string; animate: boolean }> = {
  active: { color: 'bg-emerald-400', animate: true },
  idle: { color: 'bg-muted-foreground/40', animate: true },
  paused: { color: 'bg-yellow-500', animate: false },
}


/** Status-based border + subtle inner glow */
const STATUS_BORDER: Record<string, string> = {
  active: 'border-emerald-500/20',
  idle: 'border-border/60',
  paused: 'border-yellow-500/15',
}

/** Status-based inner glow (gradient overlay) */
const STATUS_GLOW: Record<string, string> = {
  active: 'from-emerald-500/[0.04]',
  idle: 'from-white/[0.01]',
  paused: 'from-yellow-500/[0.03]',
}

/** Short model label — extract last meaningful segment */
function getModelShortLabel(model: string): string {
  const parts = model.split('/')
  const name = parts[parts.length - 1]
  // Truncate long names
  if (name.length > 16) return name.slice(0, 14) + '...'
  return name
}


/** Presence label for non-idle states */
const PRESENCE_LABELS: Record<string, string> = {
  thinking: 'Thinking',
  'tool-calling': 'Tool-calling',
  responding: 'Responding',
  receiving: 'Receiving',
}

/** Sparkline color — presence-aware (matches MC agent node) */
const PRESENCE_SPARKLINE_COLORS: Record<string, string> = {
  idle: '#71717a',
  thinking: '#fbbf24',
  'tool-calling': '#a78bfa',
  responding: '#34d399',
  receiving: '#60a5fa',
}

/** Runtime provider badge styles.
 * Dedicated (Lucid-managed) always shows "Dedicated".
 * BYO shows the actual provider (Railway, Akash, etc.).
 */
const PROVIDER_BADGE: Record<string, { label: string; color: string }> = {
  // Dedicated — Lucid-managed runtime
  lucid: { label: 'Lucid Cloud', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  // BYO — user's own infrastructure
  railway: { label: 'Railway', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  akash: { label: 'Akash', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  phala: { label: 'Phala', color: 'bg-lime-500/10 text-lime-400 border-lime-500/20' },
  'io.net': { label: 'io.net', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  nosana: { label: 'Nosana', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  docker: { label: 'Docker', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  manual: { label: 'Manual', color: 'bg-muted-foreground/10 text-muted-foreground border-border/20' },
}

// ── Matrix overlay for delete / shutdown animations ──────────────

const DELETE_MESSAGES = [
  'Severing neural pathways...',
  'Erasing memory banks...',
  'Disconnecting channels...',
  'Purging identity matrix...',
  'Wiping consciousness...',
  'Decommissioning agent...',
]

const SHUTDOWN_MESSAGES = [
  'Suspending consciousness...',
  'Saving cognitive state...',
  'Draining active connections...',
  'Powering down inference...',
  'Entering hibernation...',
  'Agent going to sleep...',
]

const RESUME_MESSAGES = [
  'Restoring heartbeat...',
  'Rehydrating memory context...',
  'Reconnecting channels...',
  'Warming inference loop...',
  'Agent coming online...',
]

const OVERLAY_CHARS = 'アイウエオカキクケコ01001101'

const MATRIX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'

type DeploymentPhase = NonNullable<AssistantNodeData['deployment']>['phase']
type MilestoneState = 'pending' | 'active' | 'done' | 'error'

interface DeploymentMilestone {
  label: string
  state: MilestoneState
}

const DEPLOY_FLAVOR: Record<DeploymentPhase, readonly string[]> = {
  deploying: [
    'Initializing neural pathways...',
    'Spinning up the container...',
    'Loading cognitive framework...',
    'Warming up inference engine...',
  ],
  connecting: [
    'Worker online - handshaking...',
    'Verifying heartbeat signal...',
    'Runtime connected - finalizing...',
  ],
  creating: [
    'Breathing life into the agent...',
    'Writing identity matrix...',
    'Agent awakening...',
  ],
  failed: [
    'Deployment failed.',
    'Waiting for retry...',
  ],
}

function OverlayRain({ color, width, height }: { color: string; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height

    const fontSize = 10
    const columns = Math.floor(width / fontSize)
    const drops = Array.from({ length: columns }, () => Math.random() * -10)

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = OVERLAY_CHARS[Math.floor(Math.random() * OVERLAY_CHARS.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        const alpha = 0.2 + Math.random() * 0.6
        ctx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
        ctx.fillText(char, x, y)

        if (y > height && Math.random() > 0.96) drops[i] = 0
        drops[i]++
      }
    }

    const interval = setInterval(draw, 45)
    return () => clearInterval(interval)
  }, [color, width, height])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 rounded-xl pointer-events-none"
      style={{ width, height }}
    />
  )
}

function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    const pixelRatio = window.devicePixelRatio || 1

    canvas.width = Math.floor(width * pixelRatio)
    canvas.height = Math.floor(height * pixelRatio)
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    const fontSize = 10
    const columns = Math.floor(width / fontSize)
    const drops = Array.from({ length: columns }, () => Math.random() * -20)
    let lastFrame = 0
    let rafId: number

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw)
      if (now - lastFrame < 50) return
      lastFrame = now

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        ctx.fillStyle = `rgba(0, 255, 65, ${0.3 + Math.random() * 0.7})`
        ctx.fillText(char, x, y)
        if (y > height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
      }
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full rounded-xl opacity-20 pointer-events-none"
    />
  )
}

function useElapsed(startedAt?: number) {
  const [elapsed, setElapsed] = useState(() => startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0)

  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  return elapsed
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m${remainder.toString().padStart(2, '0')}s`
}

function useRotatingDeployText(phase: DeploymentPhase, intervalMs = 3000) {
  const [index, setIndex] = useState(0)
  const messagesRef = useRef(DEPLOY_FLAVOR[phase])

  useEffect(() => {
    messagesRef.current = DEPLOY_FLAVOR[phase]
    setIndex(0)
  }, [phase])

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messagesRef.current.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return messagesRef.current[index]
}

function deriveDeployMilestones(phase: DeploymentPhase, l2Status: L2DeployStatus | null | undefined): DeploymentMilestone[] {
  const l2 = l2Status?.status ?? null

  if (l2 === 'failed' || phase === 'failed') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: typeof l2Status?.error === 'string' ? `Build failed: ${l2Status.error}` : 'Deploy failed', state: 'error' },
      { label: 'Creating agent', state: 'pending' },
    ]
  }

  if (phase === 'creating' || phase === 'connecting' || l2 === 'running') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (l2 === 'deploying') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'active' },
      { label: 'Creating agent', state: 'pending' },
    ]
  }

  return [
    { label: 'Queued for deploy', state: 'active' },
    { label: 'Building container', state: 'pending' },
    { label: 'Creating agent', state: 'pending' },
  ]
}

function DeployMilestoneIcon({ state }: { state: MilestoneState }) {
  if (state === 'done') return <Check className="h-3 w-3 text-emerald-400" />
  if (state === 'error') return <AlertTriangle className="h-3 w-3 text-destructive" />
  if (state === 'active') return <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
  return <div className="ml-0.5 h-2 w-2 rounded-full bg-muted-foreground/40" />
}

function DeploymentStatePanel({ deployment }: { deployment: NonNullable<AssistantNodeData['deployment']> }) {
  const milestones = deriveDeployMilestones(deployment.phase, deployment.l2Status)
  const flavor = useRotatingDeployText(deployment.phase)
  const hasError = deployment.phase === 'failed' || deployment.l2Status?.status === 'failed'

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {milestones.map((milestone, index) => (
          <div key={`${milestone.label}-${index}`} className="flex items-center gap-2">
            <DeployMilestoneIcon state={milestone.state} />
            <span className={cn(
              'truncate text-[10px] font-mono leading-tight',
              milestone.state === 'done' && 'text-emerald-400/70',
              milestone.state === 'active' && 'text-emerald-300',
              milestone.state === 'error' && 'text-destructive/90',
              milestone.state === 'pending' && 'text-zinc-500',
            )}>
              {milestone.label}
            </span>
          </div>
        ))}
      </div>
      <p className={cn(
        'truncate text-[9px] font-mono italic leading-tight',
        hasError ? 'text-destructive/70' : 'text-emerald-400/50',
      )}>
        {flavor}
      </p>
      {hasError && (deployment.onRetry || deployment.onCancel) ? (
        <div className="flex gap-2 pt-1">
          {deployment.onRetry ? (
            <button type="button" className="rounded-md border border-border px-2 py-1 text-[10px]" onClick={deployment.onRetry}>
              Retry
            </button>
          ) : null}
          {deployment.onCancel ? (
            <button type="button" className="rounded-md px-2 py-1 text-[10px] text-muted-foreground" onClick={deployment.onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}


function ActionOverlay({
  mode,
  width,
  height,
}: {
  mode: 'deleting' | 'shutting-down' | 'resuming'
  width: number
  height: number
}) {
  const isDelete = mode === 'deleting'
  const isResume = mode === 'resuming'
  const rainColor = isDelete ? '#ef4444' : isResume ? '#34d399' : '#eab308'
  const textColor = isDelete ? '#fca5a5' : isResume ? '#a7f3d0' : '#fde68a'
  const borderColor = isDelete ? 'border-red-500/50' : isResume ? 'border-emerald-500/50' : 'border-amber-500/50'
  const bgColor = isDelete ? 'bg-red-950/90' : isResume ? 'bg-emerald-950/90' : 'bg-amber-950/90'
  const messages = isDelete ? DELETE_MESSAGES : isResume ? RESUME_MESSAGES : SHUTDOWN_MESSAGES
  const label = isDelete ? 'terminating' : isResume ? 'waking up' : 'shutting down'

  return (
    <div className={cn(
      'absolute inset-0 z-10 rounded-xl overflow-hidden',
      borderColor, 'border',
      bgColor, 'backdrop-blur-sm',
    )}>
      <OverlayRain color={rainColor} width={width} height={height} />
      {isResume ? <ResumeWakeEffect color={rainColor} /> : !isDelete ? <ShutdownPowerDownEffect color={rainColor} /> : null}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-2 px-3">
        {isDelete ? (
          <div
            className="h-3 w-3 rounded-full animate-pulse"
            style={{ backgroundColor: rainColor }}
          />
        ) : isResume ? (
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div className="absolute inset-0 rounded-full border animate-[resume-ring_1.5s_ease-out_infinite]" style={{ borderColor: rainColor }} />
            <Power className="h-4 w-4 animate-[resume-icon_1.5s_ease-out_infinite]" style={{ color: textColor }} />
          </div>
        ) : (
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div className="absolute inset-0 rounded-full border animate-[shutdown-ring_1.8s_ease-in-out_infinite]" style={{ borderColor: rainColor }} />
            <PowerOff className="h-4 w-4 animate-[shutdown-icon_1.8s_ease-in-out_infinite]" style={{ color: textColor }} />
          </div>
        )}
        <TypingText messages={messages} intervalMs={2000} className="font-medium" style={{ color: textColor }} />
        <span
          className="font-mono text-[8px] uppercase tracking-[0.2em] opacity-60"
          style={{ color: textColor }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

function ResumeWakeEffect({ color }: { color: string }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 animate-[resume-scan_1.8s_ease-out_infinite] bg-gradient-to-t from-transparent via-white/20 to-transparent"
        style={{ boxShadow: `0 0 28px ${color}66` }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-px w-4/5 animate-[resume-heartbeat_1.8s_ease-out_infinite]"
          style={{ backgroundColor: color, boxShadow: `0 0 18px ${color}` }}
        />
      </div>
      <style>{`
        @keyframes resume-scan {
          0% { transform: translateY(48px); opacity: 0; }
          20% { opacity: 0.9; }
          100% { transform: translateY(-220px); opacity: 0; }
        }
        @keyframes resume-heartbeat {
          0% { clip-path: inset(0 100% 0 0); opacity: 0; transform: translateY(0); }
          32% { clip-path: inset(0 0 0 0); opacity: 0.55; transform: translateY(0); }
          46% { opacity: 0.9; transform: translateY(-5px); }
          56% { opacity: 0.85; transform: translateY(4px); }
          68% { opacity: 0.9; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes resume-ring {
          0% { transform: scale(0.45); opacity: 0; }
          45% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes resume-icon {
          0% { transform: scale(0.75); opacity: 0.35; }
          45% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 0.7; }
        }
      `}</style>
    </>
  )
}

function ShutdownPowerDownEffect({ color }: { color: string }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-12 animate-[shutdown-scan_2.2s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-white/20 to-transparent"
        style={{ boxShadow: `0 0 28px ${color}66` }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-px w-4/5 animate-[shutdown-flatline_2.2s_ease-in-out_infinite]"
          style={{ backgroundColor: color, boxShadow: `0 0 18px ${color}` }}
        />
      </div>
      <style>{`
        @keyframes shutdown-scan {
          0% { transform: translateY(-48px); opacity: 0; }
          18% { opacity: 0.9; }
          72% { opacity: 0.55; }
          100% { transform: translateY(220px); opacity: 0; }
        }
        @keyframes shutdown-flatline {
          0%, 18% { transform: scaleX(0.15); opacity: 0; }
          45% { transform: scaleX(1); opacity: 0.85; }
          72% { transform: scaleX(0.34); opacity: 0.65; }
          100% { transform: scaleX(0.02); opacity: 0; }
        }
        @keyframes shutdown-ring {
          0% { transform: scale(1.35); opacity: 0; }
          35% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(0.45); opacity: 0; }
        }
        @keyframes shutdown-icon {
          0%, 20% { transform: scale(1); opacity: 1; }
          70% { transform: scale(0.82); opacity: 0.7; }
          100% { transform: scale(0.5); opacity: 0.25; }
        }
      `}</style>
    </>
  )
}

function NodeSparkline({
  agentId,
  events,
  suspended = false,
}: {
  agentId: string
  events: FeedEvent[]
  suspended?: boolean
}) {
  const agentEvents = useMemo(
    () => events.filter((e) => e.agent_id === agentId),
    [events, agentId],
  )
  const presence = useAgentPresence(agentEvents)
  const color = suspended
    ? PRESENCE_SPARKLINE_COLORS.idle
    : PRESENCE_SPARKLINE_COLORS[presence.state] ?? PRESENCE_SPARKLINE_COLORS.idle
  return (
    <MiniSparkline
      data={suspended ? [] : presence.sparklineData}
      width={252}
      height={28}
      color={color}
      strokeScale={1.5}
      idleMode={suspended ? 'flat' : 'heartbeat'}
    />
  )
}

export function AssistantNodeCard({
  id,
  data,
  selected = false,
}: {
  id: string
  data: AssistantNodeData
  selected?: boolean
}) {
  const vibeLabel = getVibeStatusLabel(data.status, id)
  const activeChannels = getChannelUiStats(data.channels).connectedChannels
  const skillIconItems = useMemo(
    () => resolveCapabilityIconItems((data.skills ?? []).map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      label: skill.slug,
      item_type: 'skill',
    }))),
    [data.skills],
  )

  // Inline name editing
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.label)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentLabel = data.label
  const onNameChange = data.onNameChange

  useEffect(() => { setDraft(currentLabel) }, [currentLabel])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commitEdit = useCallback(() => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== currentLabel) onNameChange?.(id, trimmed)
    else setDraft(currentLabel)
  }, [currentLabel, draft, id, onNameChange])

  const hasOverlay = data.isDeleting || data.isShuttingDown || data.isResuming
  const isDeploying = Boolean(data.deployment)
  const deploymentHasError = data.deployment?.phase === 'failed' || data.deployment?.l2Status?.status === 'failed'
  const isSuspended = data.status === 'paused' && !hasOverlay && !isDeploying
  const hasErrors = (data.recentErrorCount ?? 0) > 0
  const presenceState = data.presenceState ?? 'idle'
  const presenceCfg = PRESENCE_STATE_CONFIG[presenceState as keyof typeof PRESENCE_STATE_CONFIG]

  // Breathing dot: errors → red, else presence-based, else fallback to status
  const dotColor = deploymentHasError
    ? 'bg-red-500'
    : isDeploying
      ? 'bg-emerald-400'
      : hasErrors
        ? 'bg-red-500'
        : presenceCfg?.dotColor ?? (STATUS_DOT_COLORS[data.status] ?? STATUS_DOT_COLORS.idle).color
  const dotAnimate = isDeploying || hasErrors || presenceState !== 'idle'
    ? true
    : (STATUS_DOT_COLORS[data.status] ?? STATUS_DOT_COLORS.idle).animate

  // Health color helpers
  const healthColor = data.healthScore != null
    ? data.healthScore >= HEALTH_SCORE_THRESHOLDS.green ? 'emerald'
      : data.healthScore >= HEALTH_SCORE_THRESHOLDS.yellow ? 'yellow'
        : data.healthScore >= HEALTH_SCORE_THRESHOLDS.orange ? 'orange'
          : 'red'
    : null

  const isElevated = selected || data.isFocused

  return (
    <div
      className={cn(
        'group relative rounded-xl border cursor-pointer',
        'w-[280px]',
        'transition-[transform,box-shadow,border-color,opacity,filter] duration-200',
        // Base: dark glass
        'bg-card/95 backdrop-blur-md',
        // Border: status-aware, subtle
        STATUS_BORDER[data.status] ?? STATUS_BORDER.idle,
        // Breathing animation — active nodes only
        !hasOverlay && !isSuspended && (data.status === 'active' || isDeploying) && 'animate-agent-node-breathe-active',
        // Elevated: strong scale + wide ambient glow + brighter surface
        isElevated && [
          'scale-[1.04] z-10',
          '!bg-card/98',
          'shadow-[0_0_40px_8px_rgba(255,255,255,0.03),_0_0_0_1px_rgba(255,255,255,0.1),_0_20px_60px_rgba(0,0,0,0.7)]',
        ],
        // Overlays
        hasOverlay && 'pointer-events-none',
        isDeploying && !deploymentHasError && '!border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.12)]',
        deploymentHasError && '!border-destructive/40',
        data.isDeleting && '!border-red-500/40',
        data.isShuttingDown && '!border-amber-500/40',
      )}
      onClick={(event) => {
        event.stopPropagation()
        if (!hasOverlay) {
          data.onSelect?.(id)
        }
      }}
    >
      {/* Inner glow gradient — living surface */}
      <div className={cn(
        'absolute inset-0 rounded-xl bg-gradient-to-b to-transparent pointer-events-none',
        isElevated ? 'from-white/[0.03]' : (STATUS_GLOW[data.status] ?? STATUS_GLOW.idle),
      )} />

      {/* Event badge (top-right outside) */}
      {hasErrors ? (
        <span className="absolute -top-2 -right-2 z-20 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white animate-in zoom-in-50">
          {data.recentErrorCount! > 99 ? '99+' : data.recentErrorCount}
        </span>
      ) : (data.recentEventCount ?? 0) > 0 ? (
        <span className="absolute -top-2 -right-2 z-20 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground animate-in zoom-in-50">
          {data.recentEventCount! > 99 ? '99+' : data.recentEventCount}
        </span>
      ) : null}

      {/* Matrix action overlays */}
      {data.isDeleting && <ActionOverlay mode="deleting" width={280} height={200} />}
      {data.isShuttingDown && <ActionOverlay mode="shutting-down" width={280} height={200} />}
      {data.isResuming && <ActionOverlay mode="resuming" width={280} height={200} />}
      {isDeploying && !deploymentHasError ? <MatrixRain /> : null}
      {isDeploying ? <div className="absolute inset-0 rounded-xl border border-emerald-400/20 blur-[2px] pointer-events-none" /> : null}

      <div className="relative p-3.5 space-y-3">
        {/* ── Identity row ── */}
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div className={cn(
              'rounded-lg flex items-center justify-center w-9 h-9 transition-colors duration-200',
              engineHasLogo(data.engine)
                ? 'bg-transparent'
                : data.status === 'active' ? 'bg-emerald-500/10' : 'bg-muted/80',
            )}>
              <EngineIcon engine={data.engine ?? 'openclaw'} size={28} />
            </div>
            <span className="absolute -bottom-2 -right-0.5" title={vibeLabel}>
              <BreathingDot
                color={dotColor}
                animate={dotAnimate}
                size="sm"
              />
            </span>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            {/* Agent name — editable on double-click */}
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                  if (e.key === 'Escape') { setEditing(false); setDraft(data.label) }
                }}
                className="nodrag nopan block w-full text-[16px] font-semibold tracking-[-0.02em] bg-transparent border-b border-border outline-none text-foreground"
              />
            ) : (
              <span
                className={cn(
                  'block text-[16px] font-semibold tracking-[-0.02em] truncate',
                  isElevated ? 'text-white' : 'text-foreground',
                  data.onNameChange && 'cursor-text hover:opacity-80 transition-opacity duration-120',
                )}
                onDoubleClick={(e) => {
                  if (data.onNameChange) {
                    e.stopPropagation()
                    setEditing(true)
                  }
                }}
                title={data.onNameChange ? 'Double-click to rename' : undefined}
              >
                {data.label}
                {data.isCoordinator && (
                  <Crown className="inline h-3.5 w-3.5 text-amber-400 ml-1 -mt-0.5" />
                )}
              </span>
            )}
            {/* Model chip — secondary, quiet */}
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground font-mono">
              <span className="flex shrink-0 translate-y-[1px]"><ModelIcon model={data.model} size={13} /></span>
              <span className="leading-none">{isDeploying ? 'deploying' : getModelShortLabel(data.model)}</span>
            </div>
          </div>
          {/* Health score — bold state */}
          {!isDeploying && data.healthScore != null && (
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 pt-1 text-[12px] font-mono font-bold tabular-nums [backface-visibility:hidden]',
                healthColor === 'emerald' ? 'text-emerald-400'
                  : healthColor === 'yellow' ? 'text-yellow-400'
                    : healthColor === 'orange' ? 'text-orange-400'
                      : 'text-red-400',
              )}
              title="Health score"
            >
              <span className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                healthColor === 'emerald' ? 'bg-emerald-400'
                  : healthColor === 'yellow' ? 'bg-yellow-400'
                    : healthColor === 'orange' ? 'bg-orange-400'
                      : 'bg-red-400',
              )} />
              {Math.round(data.healthScore)}
            </span>
          )}
        </div>

        {/* ── Presence state ── */}
        {isDeploying && data.deployment ? (
          <DeploymentStatePanel deployment={data.deployment} />
        ) : ((presenceState !== 'idle' && PRESENCE_LABELS[presenceState]) || hasErrors) && (
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {presenceState !== 'idle' && PRESENCE_LABELS[presenceState] && (
                <span className={cn(
                  'text-[10px] font-medium',
                  presenceCfg?.textColor ?? 'text-muted-foreground',
                )}>
                  {PRESENCE_LABELS[presenceState]}
                </span>
              )}
              {hasErrors && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {data.recentErrorCount}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Errors in last hour</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}

        {/* ── Capabilities ── */}
        {!isDeploying ? <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <AvatarStack
              items={activeChannels.map((ch, index) => ({
                id: ch.id ?? `${ch.channel_type}-${index}`,
                label: ch.channel_type,
                _type: ch.channel_type,
              }))}
              renderIcon={(item, size) => <LogoIcon slug={item._type} size={size} className="w-full h-full object-contain" />}
              avatarClassName="!size-5"
              iconSize={12}
              max={4}
            />
            <CapabilityAvatarStack
              items={skillIconItems}
              avatarClassName="!size-5"
              iconSize={12}
              max={4}
            />
            {data.walletEnabled && (
              <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                <Wallet className="h-2.5 w-2.5" />
                Wallet
              </span>
            )}
            {data.runtimeProvider && PROVIDER_BADGE[data.runtimeProvider] && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    'inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border font-medium',
                    PROVIDER_BADGE[data.runtimeProvider].color,
                  )}>
                    <Server className="h-2.5 w-2.5" />
                    {PROVIDER_BADGE[data.runtimeProvider].label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Lucid Cloud (Dedicated)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider> : null}

        {/* ── Heartbeat sparkline ── */}
        {!isDeploying ? <div className="space-y-1.5">
          <div className="animate-sparkline-signal">
            <NodeSparkline agentId={id} events={data.feedEvents} suspended={isSuspended} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {isSuspended ? 'SUSPENDED' : vibeLabel}
            </span>
            <span className="text-[9px] font-mono text-foreground">
              {formatRelativeTime(data.updatedAt)}
            </span>
          </div>
        </div> : null}
      </div>

    </div>
  )
}

const AssistantNodeComponent = ({ id, data, selected }: NodeProps<AssistantNodeData>) => (
  <AssistantNodeCard id={id} data={data} selected={selected} />
)

export const AssistantCanvasNode = memo(AssistantNodeComponent)
AssistantCanvasNode.displayName = 'AssistantCanvasNode'
