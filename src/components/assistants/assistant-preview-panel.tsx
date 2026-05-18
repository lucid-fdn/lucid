'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, type Variants } from 'motion/react'
import {
  X,
  Maximize2,
  AlertTriangle,
  Shield,
  BookOpen,
  ExternalLink,
  LayoutDashboard,
  Sliders,
  ChevronRight,
  Pause,
  Play,
  Brain,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/animate-ui/primitives/radix/tooltip'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { ModelIcon } from '@/components/icons/model-icon'
import { EngineIcon } from '@/components/icons/engine-icon'
import { LogoIcon } from '@/components/ui/logo-icon'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { AvatarStack } from '@/components/ui/avatar-stack'
import { useAgentPresence } from '@/hooks/use-agent-presence'
import { getVibeStatusLabel } from '@/lib/expressions'
import { formatRelativeTime } from '@/lib/mission-control/constants'
import { transitions } from '@/lib/design/motion'
import { getChannelUiStats, type UiChannelLike } from '@/lib/channels/types'
import { buildProjectAgentDetailPath, buildProjectRunsPath } from '@/lib/projects/urls'
import { getRuntimeModePresentation } from '@/lib/engines/presentation'
import { toast } from '@/hooks/use-toast'
import type { Agent as Assistant } from '@/types/agent'
import type { FeedEvent, MCAgentContext, ControlAction } from '@/lib/mission-control/types'
import { notificationCopy } from '@/lib/notifications/copy'

// ── Constants ──

const STATUS_DOT: Record<string, { color: string; animate: boolean }> = {
  active: { color: 'bg-emerald-400', animate: true },
  idle: { color: 'bg-muted-foreground', animate: true },
  paused: { color: 'bg-yellow-500', animate: false },
}

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  fact: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  preference: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
  instruction: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  context: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
}

const DEFAULT_CATEGORY_STYLE = { bg: 'bg-muted', text: 'text-muted-foreground' }

type PanelTab = 'overview' | 'memory' | 'controls'

const TABS: { id: PanelTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'memory', label: 'Memory', icon: BookOpen },
  { id: 'controls', label: 'Controls', icon: Sliders },
]

// ── Helpers ──

function getAgentStatus(a: Assistant): 'active' | 'paused' | 'idle' {
  if (!a.is_active) return 'paused'
  if (a.mc_status === 'paused') return 'paused'
  return 'idle'
}

function getCsrfToken(): string | null {
  return document.cookie.match(/(^| )csrf-token=([^;]+)/)?.[2] ?? null
}

// ── Sub-components ──

function PanelSparkline({ agentId, events }: { agentId: string; events: FeedEvent[] }) {
  const agentEvents = useMemo(
    () => events.filter((e) => e.agent_id === agentId),
    [events, agentId],
  )
  const presence = useAgentPresence(agentEvents)
  const color = presence.state === 'idle' ? '#3b82f6' : '#10b981'
  return (
    <MiniSparkline
      data={presence.sparklineData}
      width={280}
      height={32}
      color={color}
      idleOpacity={0.4}
    />
  )
}

/** Shimmer skeleton with gradient sweep */
function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md bg-[length:400%_100%] animate-[shimmer_2s_ease-in-out_infinite]',
        'bg-gradient-to-r from-muted/60 via-muted/30 to-muted/60',
        className,
      )}
    />
  )
}

function ShimmerLines({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerBlock key={i} className={cn('h-3', i % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
      ))}
    </div>
  )
}

/** Importance bar — thin horizontal fill */
function ImportanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-muted-foreground/40 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{pct}% importance</TooltipContent>
    </Tooltip>
  )
}

// ── Stagger animation ──

const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04 } },
}

const staggerChild: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
  },
}

// ── Tab content components ──

function OverviewTab({
  assistant,
  mcContext,
  contextLoading,
  activeChannels,
  recentEvents,
  feedEvents,
  pendingCount,
  mcUrl,
  detailUrl,
}: {
  assistant: Assistant
  mcContext: MCAgentContext | null
  contextLoading: boolean
  activeChannels: UiChannelLike[]
  recentEvents: FeedEvent[]
  feedEvents: FeedEvent[]
  pendingCount: number
  mcUrl: string
  detailUrl: string
}) {
  const healthScore = mcContext?.agent?.health_score ?? null
  const errorsLastHour = mcContext?.agent?.errors_last_hour ?? 0
  const costToday = mcContext?.agent?.cost_today_usd ?? 0
  const visibleChannels = getChannelUiStats(activeChannels ?? []).connectedChannels
  const channelCount = visibleChannels.length

  // Decision labels
  const healthLabel = healthScore == null ? 'Healthy' :
    healthScore > 75 ? 'Healthy' :
    healthScore > 40 ? 'Degraded' : 'Critical'
  const healthColor = healthScore == null ? 'text-emerald-400' :
    healthScore > 75 ? 'text-emerald-400' :
    healthScore > 40 ? 'text-amber-400' : 'text-red-400'

  // State — Apple pattern: small state label → big identity below
  const stateLabel = !assistant.is_active
    ? 'Paused'
    : errorsLastHour > 5
      ? 'Needs attention'
      : pendingCount > 0
        ? 'Awaiting approval'
        : channelCount > 0
          ? 'Monitoring'
          : 'Ready to start'

  const modelShort = assistant.lucid_model?.split('/').pop()
  const modelProvider = assistant.lucid_model?.split('/')[0]
  const inferredRuntimeFlavor =
    assistant.runtime_flavor ?? (mcContext?.agent.runtime?.runtimeId ? 'c1_managed' : 'shared')
  const runtimeMode = getRuntimeModePresentation({
    runtimeFlavor: inferredRuntimeFlavor,
    runtimeTier:
      inferredRuntimeFlavor === 'c2a_autonomous'
        ? 'byo'
        : inferredRuntimeFlavor === 'c1_managed'
          ? 'dedicated'
          : null,
    runtimeProvider: mcContext?.agent.runtime?.runtimeProvider ?? null,
  })
  const runtimeStatus = mcContext?.agent.runtime?.runtimeStatus
    ? mcContext.agent.runtime.runtimeStatus.replace(/_/g, ' ')
    : null
  const runtimeName = mcContext?.agent.runtime?.runtimeName ?? runtimeMode.providerLabel

  return (
    <motion.div
      className="p-5 space-y-4"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* ── Hero block: state label → dominant identity → inline metrics ── */}
      <motion.div variants={staggerChild}>
        <div className="space-y-1.5">
          <p className={cn(
            'text-[11px] font-medium uppercase tracking-wide',
            errorsLastHour > 0 || pendingCount > 0 ? 'text-amber-400' :
            !assistant.is_active ? 'text-muted-foreground' :
            'text-muted-foreground',
          )}>
            {stateLabel}
          </p>
          {contextLoading ? (
            <ShimmerBlock className="h-8 w-2/3" />
          ) : (
            <p className={cn('text-[26px] font-semibold tracking-[-0.03em] leading-none', healthColor)}>
              {healthLabel}
              {healthScore != null && (
                <span className="text-[14px] font-normal text-muted-foreground font-mono tabular-nums ml-2">{healthScore}</span>
              )}
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Issue banners ── */}
      <AnimatePresence>
        {!contextLoading && mcContext?.last_error && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transitions.reveal}
          >
            <div className="rounded-lg bg-red-500/5 border border-red-500/15 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[11px] font-medium text-red-400 uppercase tracking-wider">Last error</span>
              </div>
              <p className="text-[12px] font-mono text-red-300/80 leading-relaxed line-clamp-2">
                {mcContext.last_error}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!contextLoading && pendingCount > 0 && (
          <motion.div
            key="approvals"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transitions.reveal}
          >
            <Link href={mcUrl} className="block group">
              <div className="flex items-center gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-4 py-3 group-hover:bg-amber-500/12 transition-all duration-150">
                <Shield className="h-4 w-4 text-amber-400" />
                <span className="text-[13px] font-medium text-amber-300 flex-1">
                  {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-amber-500/50 group-hover:text-amber-400 transition-all duration-150" />
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Metrics strip — dense ── */}
      <motion.div variants={staggerChild}>
        <div className="rounded-lg bg-card/80 border border-border/50">
          <div className="flex items-stretch divide-x divide-border">
            <div className="flex-1 p-4">
              <p className="text-[20px] font-semibold font-mono tabular-nums text-foreground">
                ${costToday.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">today</p>
            </div>
            <div className="flex-1 p-4 text-center">
              <p className="text-[20px] font-semibold font-mono tabular-nums text-foreground">
                {channelCount}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">channels</p>
            </div>
            <div className="flex-1 p-4 text-right">
              <p className={cn(
                'text-[20px] font-semibold font-mono tabular-nums',
                errorsLastHour > 0 ? 'text-red-400' : 'text-foreground',
              )}>
                {errorsLastHour}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">errors</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Runtime story — operator packaging, not infra jargon ── */}
      <motion.div variants={staggerChild}>
        <div className="rounded-lg bg-card/80 border border-border/50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">{runtimeMode.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                {runtimeMode.description}
              </p>
            </div>
            {runtimeStatus && (
              <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground">
                {runtimeStatus}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{runtimeMode.operator}</span>
            <span>{runtimeMode.channelPath}</span>
            {runtimeName && <span>{runtimeName}</span>}
          </div>
        </div>
      </motion.div>

      {/* ── Model identity — system component feel ── */}
      <motion.div variants={staggerChild}>
        <div className="flex items-center gap-3 rounded-lg bg-gradient-to-b from-card to-card/60 border border-border/50 hover:border-border px-4 py-3 transition-all duration-150 hover:-translate-y-px">
          <div className="rounded-lg bg-muted/80 flex items-center justify-center w-8 h-8">
            <ModelIcon model={assistant.lucid_model} size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground truncate">{modelShort}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {modelProvider ? `${modelProvider} · ` : ''}Primary model
            </p>
          </div>
          {visibleChannels.length > 0 && (
            <AvatarStack
              items={visibleChannels.map((ch, index) => ({
                id: ch.id ?? `${ch.channel_type}-${index}`,
                label: ch.channel_type,
                _type: ch.channel_type,
              }))}
              renderIcon={(item, size) => (
                <LogoIcon slug={item._type} size={size} className="w-full h-full object-contain" />
              )}
              avatarClassName="!size-5"
              iconSize={12}
              max={3}
            />
          )}
        </div>
      </motion.div>

      {/* ── Activity — always-visible sparkline + events ── */}
      <motion.div variants={staggerChild}>
        <div className="space-y-2">
          <span className="text-[12px] font-medium text-muted-foreground">Activity</span>
          <div className="rounded-lg bg-card/60 border border-border/50 overflow-hidden">
            {/* Sparkline — always visible, shows system presence */}
            <div className="px-4 pt-3 pb-1">
              <PanelSparkline agentId={assistant.id} events={feedEvents} />
            </div>
            <div className="px-4 pb-3">
              {recentEvents.length > 0 ? (
                <div className="space-y-0 border-t border-border/30 pt-2 mt-1">
                  {recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2.5 text-[12px] py-1.5 rounded-md hover:bg-accent px-2 -mx-2 transition-all duration-150"
                    >
                      <span className="text-muted-foreground shrink-0 w-11 text-right font-mono text-[11px] pt-0.5">
                        {formatRelativeTime(event.created_at)}
                      </span>
                      <span className="text-muted-foreground line-clamp-1">
                        {event.event_type === 'tool_call'
                          ? `Tool: ${(event.payload as Record<string, unknown>)?.tool_name ?? 'unknown'}`
                          : event.event_type === 'message_received'
                            ? 'Message received'
                            : event.event_type === 'message_sent'
                              ? 'Response sent'
                              : event.event_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-t border-border/30 pt-3 mt-1 text-center pb-1">
                  <p className="text-[13px] text-muted-foreground">Waiting for first interaction</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {channelCount === 0 ? 'Connect a channel to get started' : 'Activity will appear as your agent runs'}
                  </p>
                  {channelCount === 0 && (
                    <Link
                      href={detailUrl}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground mt-3 transition-colors duration-150"
                    >
                      Connect channel <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function MemoryTab({
  mcContext,
  contextLoading,
  gatedTools,
}: {
  mcContext: MCAgentContext | null
  contextLoading: boolean
  gatedTools: string[]
}) {
  const recentMemories = mcContext?.recent_memories ?? []

  return (
    <motion.div
      className="p-5 space-y-6"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* ── Approval Policy ── */}
      <motion.div variants={staggerChild}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            <span className="text-[13px] font-medium text-foreground">
              Approval policy
            </span>
            {gatedTools.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">
                {gatedTools.length}
              </span>
            )}
          </div>
          {contextLoading ? (
            <ShimmerLines count={2} />
          ) : gatedTools.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {gatedTools.map((tool) => (
                <code
                  key={tool}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-amber-500/8 text-amber-400/90 font-mono ring-1 ring-amber-500/10"
                >
                  {tool}
                </code>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">All tools run automatically — no gating configured</p>
          )}
        </div>
      </motion.div>

      {/* ── Recent Memories ── */}
      <motion.div variants={staggerChild}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-medium text-foreground">
              Recent memories
            </span>
            {recentMemories.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {recentMemories.length}
              </span>
            )}
          </div>
          {contextLoading ? (
            <div className="space-y-3">
              <ShimmerBlock className="h-16 w-full" />
              <ShimmerBlock className="h-16 w-full" />
              <ShimmerBlock className="h-16 w-full" />
            </div>
          ) : recentMemories.length > 0 ? (
            <div className="space-y-2">
              {recentMemories.map((mem) => {
                const cat = CATEGORY_STYLE[mem.category] ?? DEFAULT_CATEGORY_STYLE
                return (
                  <div
                    key={mem.id}
                    className="rounded-lg bg-card/60 ring-1 ring-border/50 px-3.5 py-3 space-y-2 hover:ring-border hover:-translate-y-px transition-all duration-150"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide',
                          cat.bg,
                          cat.text,
                        )}
                      >
                        {mem.category}
                      </span>
                      <ImportanceBar value={mem.importance} />
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
                      {mem.content}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-card/40 px-5 py-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/5 ring-1 ring-emerald-500/10 mb-3">
                <Brain className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-[14px] font-medium text-muted-foreground">Latent intelligence</p>
              <p className="text-[12px] text-muted-foreground mt-1 max-w-[220px] mx-auto leading-relaxed">
                Knowledge will accumulate here as the agent converses
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ControlsTab({
  assistant,
  mcContext,
  toggling,
  loadingAction,
  onToggle,
  onControl,
}: {
  assistant: Assistant
  mcContext: MCAgentContext | null
  toggling: boolean
  loadingAction: ControlAction | null
  onToggle: () => void
  onControl: (action: ControlAction) => void
}) {
  return (
    <motion.div
      className="p-5 space-y-6"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* ── 1. Agent State — hero action ── */}
      <motion.div variants={staggerChild}>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3">
            <span className={cn(
              'h-2.5 w-2.5 rounded-full',
              assistant.is_active ? 'bg-emerald-400' : 'bg-muted-foreground/40',
            )} />
            <span className="text-[16px] font-semibold text-foreground">
              {assistant.is_active ? 'Active' : 'Paused'}
            </span>
          </div>
          <button
            onClick={onToggle}
            disabled={toggling}
            className={cn(
              'flex items-center gap-1.5 text-[13px] font-medium px-4 py-1.5 rounded-md border transition-colors duration-150',
              toggling && 'opacity-50 cursor-not-allowed',
              assistant.is_active
                ? 'text-amber-400 border-amber-500/20 hover:bg-amber-500/10'
                : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10',
            )}
          >
            {assistant.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {toggling ? 'Updating...' : assistant.is_active ? 'Pause' : 'Resume'}
          </button>
        </div>
      </motion.div>

      {/* ── 2. Guardrails strip ── */}
      {mcContext?.agent && (
        <motion.div variants={staggerChild}>
          <div className="rounded-lg bg-card border border-border hover:border-primary/50 p-4 transition-all duration-150">
            <div className="grid grid-cols-3 gap-x-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Health</p>
                <p className="text-[18px] text-foreground font-mono tabular-nums mt-1">
                  {mcContext.agent.health_score != null ? mcContext.agent.health_score : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Risk</p>
                <p className={cn(
                  'text-[18px] font-medium capitalize mt-1',
                  mcContext.agent.risk_level === 'critical' ? 'text-red-400' :
                  mcContext.agent.risk_level === 'high' ? 'text-orange-400' :
                  mcContext.agent.risk_level === 'medium' ? 'text-amber-400' :
                  'text-muted-foreground',
                )}>
                  {mcContext.agent.risk_level ?? 'low'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Gated</p>
                <p className="text-[18px] text-foreground font-mono tabular-nums mt-1">
                  {mcContext.agent.approval_required_tools?.length ?? 0}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── 3. Danger zone — boxed, visually separated ── */}
      <motion.div variants={staggerChild}>
        <div className="rounded-lg border border-red-500/10 bg-red-500/[0.02] hover:border-red-500/20 p-4 space-y-3 transition-all duration-150">
          <span className="text-[11px] font-medium text-red-400/60 uppercase tracking-wider">Danger zone</span>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-foreground">Kill active run</p>
              <p className="text-[11px] text-muted-foreground">Abort and deny pending approvals</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={loadingAction === 'kill'}
                  className={cn(
                    'text-[12px] font-medium text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-md border border-red-500/20 hover:bg-red-500/10 transition-colors duration-150',
                    loadingAction === 'kill' && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {loadingAction === 'kill' ? 'Killing...' : 'Kill run'}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Kill active run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will abort the current run for <strong>{assistant.name}</strong> and
                    auto-deny any pending approvals. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onControl('kill')}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Kill Run
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main component ──

interface AssistantPreviewPanelProps {
  assistant: Assistant
  workspaceSlug: string
  workspaceId: string
  projectSlug?: string
  feedEvents: FeedEvent[]
  onClose: () => void
}

export function AssistantPreviewPanel({
  assistant,
  workspaceSlug,
  workspaceId,
  projectSlug,
  feedEvents,
  onClose,
}: AssistantPreviewPanelProps) {
  const router = useRouter()
  const status = getAgentStatus(assistant)
  const vibeLabel = getVibeStatusLabel(status, assistant.id)
  const dotConfig = STATUS_DOT[status] ?? STATUS_DOT.idle
  const activeChannels = getChannelUiStats(assistant.assistant_channels ?? []).connectedChannels
  const resolvedProjectSlug = projectSlug ?? assistant.projectSlug ?? null
  const detailUrl = projectSlug
    ? buildProjectAgentDetailPath(workspaceSlug, projectSlug, assistant.id)
    : resolvedProjectSlug
      ? buildProjectAgentDetailPath(workspaceSlug, resolvedProjectSlug, assistant.id)
      : `/${workspaceSlug}/projects`
  const mcUrl = resolvedProjectSlug
    ? buildProjectRunsPath(workspaceSlug, resolvedProjectSlug)
    : `/${workspaceSlug}/projects`
  const [toggling, setToggling] = useState(false)
  const [loadingAction, setLoadingAction] = useState<ControlAction | null>(null)
  const [activeTab, setActiveTab] = useState<PanelTab>('overview')

  // ── MC Context fetch ──
  const [mcContext, setMcContext] = useState<MCAgentContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setContextLoading(true)
    setMcContext(null)
    fetch(`/api/mission-control/agents/${assistant.id}?org_id=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMcContext(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setContextLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [assistant.id, workspaceId])

  // ── Pause/Resume ──
  const handleToggle = useCallback(async () => {
    setToggling(true)
    try {
      const csrf = getCsrfToken()
      const res = await fetch(`/api/assistants/${assistant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({ is_active: !assistant.is_active }),
      })
      if (res.ok) {
        toast.success(assistant.is_active ? 'Agent paused' : 'Agent activated')
        router.refresh()
      } else {
        toast.error(notificationCopy.common.failedToUpdate)
      }
    } catch {
      toast.error(notificationCopy.common.networkError)
    }
    setToggling(false)
  }, [assistant, router])

  // ── MC Control actions ──
  const handleControl = useCallback(
    async (action: ControlAction) => {
      setLoadingAction(action)
      try {
        const csrf = getCsrfToken()
        const res = await fetch(`/api/mission-control/agents/${assistant.id}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf && { 'x-csrf-token': csrf }),
          },
          body: JSON.stringify({ action }),
        })
        if (res.ok) {
          toast.success(
            action === 'kill'
              ? 'Run killed'
              : action === 'escalate'
                ? 'Model escalated'
                : `Agent ${action}d`,
          )
          router.refresh()
        } else {
          toast.error('Action failed')
        }
      } catch {
        toast.error(notificationCopy.common.networkError)
      } finally {
        setLoadingAction(null)
      }
    },
    [assistant.id, router],
  )

  // ── Derived data ──
  const recentEvents = useMemo(
    () => feedEvents.filter((e) => e.agent_id === assistant.id).slice(0, 5),
    [feedEvents, assistant.id],
  )
  const gatedTools = mcContext?.agent?.approval_required_tools ?? []
  const pendingCount = mcContext?.pending_approvals_count ?? 0

  // State-aware header accent
  const headerAccent = status === 'active'
    ? 'from-emerald-500/[0.03]'
    : status === 'paused'
      ? 'from-yellow-500/[0.03]'
      : 'from-muted/20'

  return (
    <div className="h-full flex flex-col bg-card/98 backdrop-blur-md border-l border-border shadow-xl">
      {/* ── Header — gradient depth + identity ── */}
      <div className={cn(
        'px-5 pt-5 pb-4 border-b border-border',
        `bg-gradient-to-b ${headerAccent} to-transparent`,
      )}>
        <div className="flex items-start gap-3.5">
          <div className="relative flex-shrink-0">
            <div className="rounded-xl bg-card flex items-center justify-center w-12 h-12 ring-1 ring-border shadow-sm overflow-hidden">
              <EngineIcon engine={assistant.engine ?? 'openclaw'} size={32} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5">
              <BreathingDot color={dotConfig.color} animate={dotConfig.animate} size="sm" />
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3
              className="text-[20px] font-semibold truncate leading-tight text-foreground tracking-[-0.02em]"
            >
              {assistant.name}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">{vibeLabel}</p>
            {resolvedProjectSlug ? (
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Project observability · {resolvedProjectSlug}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5 pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={detailUrl} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors duration-150">
                  <Maximize2 className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Open in project</TooltipContent>
            </Tooltip>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar — stronger active state ── */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-border bg-muted/40">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-foreground' : 'text-muted-foreground')} />
              {t.label}
              {t.id === 'controls' && pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse ring-2 ring-card" />
              )}
              {t.id === 'memory' && !contextLoading && (mcContext?.recent_memories?.length ?? 0) > 0 && (
                <span className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground font-mono ml-0.5">
                  {mcContext!.recent_memories.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                assistant={assistant}
                mcContext={mcContext}
                contextLoading={contextLoading}
                activeChannels={activeChannels}
                recentEvents={recentEvents}
                feedEvents={feedEvents}
                pendingCount={pendingCount}
                mcUrl={mcUrl}
                detailUrl={detailUrl}
              />
            )}
            {activeTab === 'memory' && (
              <MemoryTab
                mcContext={mcContext}
                contextLoading={contextLoading}
                gatedTools={gatedTools}
              />
            )}
            {activeTab === 'controls' && (
              <ControlsTab
                assistant={assistant}
                mcContext={mcContext}
                toggling={toggling}
                loadingAction={loadingAction}
                onToggle={handleToggle}
                onControl={handleControl}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </ScrollArea>

      {/* ── Footer — clean: pause toggle + open config ── */}
      <div className="px-5 py-3 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {assistant.is_active ? (
              <button
                onClick={handleToggle}
                disabled={toggling}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-amber-400 transition-colors duration-150"
              >
                <Pause className="h-3.5 w-3.5" />
                {toggling ? 'Updating...' : 'Pause'}
              </button>
            ) : (
              <button
                onClick={handleToggle}
                disabled={toggling}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-emerald-400 transition-colors duration-150"
              >
                <Play className="h-3.5 w-3.5" />
                {toggling ? 'Updating...' : 'Resume'}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatRelativeTime(assistant.updated_at)}
            </span>
          </div>
          <Link
            href={detailUrl}
            className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Open in project
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
