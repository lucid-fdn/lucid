'use client'

import { memo, useState, useEffect, useRef } from 'react'
import { type NodeProps } from 'reactflow'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { L2DeployStatus } from '@/lib/mission-control/types'

export interface DeployingNodeData {
  label: string
  phase: 'deploying' | 'connecting' | 'creating' | 'failed'
  l2Status?: L2DeployStatus | null
  startedAt?: number
  onRetry?: () => void
  onCancel?: () => void
}

// ─── Storytelling flavor text (rotates below real milestones) ───

const DEPLOY_FLAVOR = [
  'Initializing neural pathways...',
  'Spinning up the container...',
  'Loading cognitive framework...',
  'Establishing synaptic links...',
  'Calibrating response matrix...',
  'Injecting runtime parameters...',
  'Warming up inference engine...',
  'Activating consciousness layer...',
  'Running self-diagnostics...',
  'Synchronizing memory banks...',
  'Preparing knowledge base...',
  'Booting agent core...',
]

const CONNECTING_FLAVOR = [
  'Worker online — handshaking...',
  'Verifying heartbeat signal...',
  'Establishing secure channel...',
  'Runtime connected — finalizing...',
]

const CREATING_FLAVOR = [
  'Breathing life into the agent...',
  'Writing identity matrix...',
  'Agent awakening...',
]

const FLAVOR_BY_PHASE: Record<DeployingNodeData['phase'], readonly string[]> = {
  deploying: DEPLOY_FLAVOR,
  connecting: CONNECTING_FLAVOR,
  creating: CREATING_FLAVOR,
  failed: DEPLOY_FLAVOR,
}

function useRotatingText(phase: DeployingNodeData['phase'], intervalMs = 3000) {
  const [index, setIndex] = useState(0)
  const messagesRef = useRef(FLAVOR_BY_PHASE[phase])

  // Update ref on phase change, reset index
  useEffect(() => {
    messagesRef.current = FLAVOR_BY_PHASE[phase]
    setIndex(0)
  }, [phase])

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % messagesRef.current.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return messagesRef.current[index]
}

function useElapsed(startedAt?: number) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  )

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
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${s.toString().padStart(2, '0')}s`
}

// ─── Matrix Rain (requestAnimationFrame, throttled to ~20fps) ───

const MATRIX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'
const MATRIX_FRAME_MS = 50 // ~20fps target

function MatrixRain({ width, height }: { width: number; height: number }) {
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
    const drops = Array.from({ length: columns }, () => Math.random() * -20)

    let lastFrame = 0
    let rafId: number

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw)
      if (now - lastFrame < MATRIX_FRAME_MS) return
      lastFrame = now

      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, width, height)
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        const alpha = 0.3 + Math.random() * 0.7
        ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`
        ctx.fillText(char, x, y)

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [width, height])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 rounded-xl opacity-20 pointer-events-none"
      style={{ width, height }}
    />
  )
}

function PulsingBorder() {
  return (
    <div className="absolute inset-0 rounded-xl pointer-events-none">
      <div className="absolute inset-0 rounded-xl border border-emerald-500/40 animate-pulse" />
      <div className="absolute inset-[-1px] rounded-xl border border-emerald-400/20 blur-[2px]" />
    </div>
  )
}

// ─── Milestone Derivation ───

type MilestoneState = 'pending' | 'active' | 'done' | 'error'

interface Milestone {
  label: string
  state: MilestoneState
}

function deriveMilestones(phase: DeployingNodeData['phase'], l2Status: L2DeployStatus | null | undefined): Milestone[] {
  const l2 = l2Status?.status ?? null

  if (l2 === 'failed' || phase === 'failed') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: typeof l2Status?.error === 'string' ? `Build failed: ${l2Status.error}` : 'Deploy failed', state: 'error' },
      { label: 'Creating agent', state: 'pending' },
    ]
  }

  if (phase === 'creating') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (phase === 'connecting') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (l2 === 'running') {
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

const MILESTONE_WEIGHTS = [20, 45, 30] as const // queued, building, creating = 95 max

function deriveProgress(milestones: Milestone[]): number {
  let progress = 0
  for (let i = 0; i < milestones.length; i++) {
    if (milestones[i].state === 'done') progress += MILESTONE_WEIGHTS[i]
    else if (milestones[i].state === 'active') progress += MILESTONE_WEIGHTS[i] * 0.5
  }
  return Math.min(progress, 95)
}

// ─── Milestone UI ───

function MilestoneIcon({ state }: { state: MilestoneState }) {
  if (state === 'done') return <Check className="h-3 w-3 text-emerald-400" />
  if (state === 'error') return <AlertTriangle className="h-3 w-3 text-destructive" />
  if (state === 'active') return <Loader2 className="h-3 w-3 text-emerald-400 animate-spin" />
  return <div className="h-2 w-2 rounded-full bg-muted-foreground/40 ml-0.5" />
}

const MILESTONE_COLORS: Record<MilestoneState, string> = {
  done: 'text-emerald-400/70',
  active: 'text-emerald-300',
  error: 'text-destructive/90',
  pending: 'text-zinc-500',
}

function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-1">
      {milestones.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <MilestoneIcon state={m.state} />
          <span className={`text-[10px] font-mono leading-tight ${MILESTONE_COLORS[m.state]}`}>
            {m.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Progress Bar ───

function ProgressBar({ progress }: { progress: number }) {
  const [displayProgress, setDisplayProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setDisplayProgress((p) => {
        if (p >= progress) {
          if (timerRef.current) clearInterval(timerRef.current)
          return progress
        }
        return Math.min(p + 1, progress)
      })
    }, 30)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [progress])

  return (
    <div className="w-full h-0.5 bg-border rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-200 ease-out"
        style={{ width: `${displayProgress}%` }}
      />
    </div>
  )
}

// ─── Dev Footer ───

function DevFooter({ l2Status, elapsed }: { l2Status?: L2DeployStatus | null; elapsed: number }) {
  const showStatus = typeof l2Status?.status === 'string'

  return (
    <div className="flex items-center justify-between pt-0.5">
      <span className="text-[9px] text-zinc-500 font-mono">
        {showStatus ? `L2: ${l2Status?.status}` : ''}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-zinc-500 font-mono">{formatElapsed(elapsed)}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>
    </div>
  )
}

// ─── Main Component ───

export function DeployingNodeCard({ data }: { data: DeployingNodeData }) {
  const milestones = deriveMilestones(data.phase, data.l2Status)
  const progress = deriveProgress(milestones)
  const hasError = data.phase === 'failed' || data.l2Status?.status === 'failed'
  const flavor = useRotatingText(data.phase)
  const elapsed = useElapsed(data.startedAt)

  if (hasError) {
    return (
      <div className="relative w-[260px] rounded-xl border border-destructive/40 bg-background/95 backdrop-blur-sm p-3 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-destructive/10">
            <AlertTriangle className="h-[18px] w-[18px] text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold truncate block">{data.label}</span>
            <span className="text-[10px] text-destructive/80">
              {typeof data.l2Status?.error === 'string' ? data.l2Status.error : 'Deployment failed'}
            </span>
          </div>
        </div>
        <MilestoneList milestones={milestones} />
        <DevFooter l2Status={data.l2Status} elapsed={elapsed} />
        <div className="flex gap-2 pt-1">
          {data.onRetry && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={data.onRetry}>
              Retry
            </Button>
          )}
          {data.onCancel && (
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={data.onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-[260px] rounded-xl border border-emerald-500/30 bg-background/95 backdrop-blur-sm overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.12)]">
      <MatrixRain width={260} height={200} />
      <PulsingBorder />

      <div className="relative z-10 p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-emerald-500/10">
            <div className="h-[18px] w-[18px] rounded-full bg-emerald-500/60 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold truncate block text-emerald-50">{data.label}</span>
          </div>
        </div>

        {/* Milestone checklist */}
        <MilestoneList milestones={milestones} />

        {/* Progress bar */}
        <ProgressBar progress={progress} />

        {/* Storytelling flavor text */}
        <p className="text-[9px] text-emerald-400/50 font-mono italic truncate leading-tight">
          {flavor}
        </p>

        {/* Dev footer: raw L2 status + elapsed time */}
        <DevFooter l2Status={data.l2Status} elapsed={elapsed} />
      </div>
    </div>
  )
}

const DeployingNodeComponent = ({ data }: NodeProps<DeployingNodeData>) => (
  <DeployingNodeCard data={data} />
)

export const DeployingCanvasNode = memo(DeployingNodeComponent)
DeployingCanvasNode.displayName = 'DeployingCanvasNode'
