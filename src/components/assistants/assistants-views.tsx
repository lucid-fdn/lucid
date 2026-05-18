'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  Brain,
  MoreHorizontal,
  Power,
  PowerOff,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModelIcon } from '@/components/icons/model-icon'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { MiniSparkline } from '@/components/oracle/mini-sparkline'
import { LogoIcon } from '@/components/ui/logo-icon'
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { getVibeStatusLabel, getAgentVibe } from '@/lib/expressions'
import type { AgentVibe } from '@/lib/expressions'
import { formatRelativeTime } from '@/lib/mission-control/constants'
import { getChannelUiStats, isUserVisibleChannelType, type UiChannelLike } from '@/lib/channels/types'
import { useAgentPresence } from '@/hooks/use-agent-presence'
import { buildAgentUiProjectionMap } from '@/lib/agents/ui-projection'
import type { Agent as Assistant } from '@/types/agent'
import type { FeedEvent, PendingApproval } from '@/lib/mission-control/types'

const MAX_STAGGER_ITEMS = 12

function getActiveChannels(a: Assistant) {
  return getChannelUiStats(a.assistant_channels ?? []).connectedChannels.filter((c) => isUserVisibleChannelType(c.channel_type))
}

function getAgentStatus(a: Assistant): 'active' | 'paused' | 'idle' {
  if (!a.is_active) return 'paused'
  if (a.mc_status === 'paused') return 'paused'
  return 'idle'
}

const STATUS_DOT_COLORS: Record<string, { color: string; animate: boolean }> = {
  active: { color: 'bg-emerald-400', animate: true },
  idle: { color: 'bg-muted-foreground', animate: true },
  paused: { color: 'bg-yellow-500', animate: false },
}

const VIBE_ACCENTS: Record<AgentVibe, string> = {
  formal: 'hover:border-blue-500/30',
  playful: 'hover:border-pink-500/30',
  nerdy: 'hover:border-green-500/30',
  chill: 'hover:border-cyan-500/30',
}

const VIBE_LABEL_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  idle: 'bg-muted text-muted-foreground',
  paused: 'bg-yellow-500/10 text-yellow-400',
}

function ChannelBadges({ channels }: { channels: UiChannelLike[] }) {
  if (!channels.length) {
    return <span className="text-[10px] text-muted-foreground/50">No channels</span>
  }

  return (
    <AvatarGroup>
      {channels.map((ch) => (
        <Avatar key={ch.id} className="!size-4 bg-muted">
          <AvatarFallback className="!bg-transparent">
            <LogoIcon slug={ch.channel_type} size={10} />
          </AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  )
}

function AssistantActions({
  assistant,
  onToggle,
}: {
  assistant: Assistant
  onToggle: (assistant: Assistant, e: MouseEvent) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.preventDefault()}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent flex-shrink-0"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={(e) => onToggle(assistant, e)}>
          {assistant.is_active ? (
            <>
              <PowerOff className="mr-2 h-3.5 w-3.5" />
              Pause
            </>
          ) : (
            <>
              <Power className="mr-2 h-3.5 w-3.5" />
              Activate
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-500 focus:text-red-500"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toast.info('Delete from the agent settings page')
          }}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ModelBadge({ model }: { model: string }) {
  return (
    <div className="relative">
      <div className="rounded-lg bg-muted p-2">
        <ModelIcon model={model} size={20} />
      </div>
    </div>
  )
}

function StatusDot({ status, agentId, className }: { status: string; agentId: string; className?: string }) {
  const config = STATUS_DOT_COLORS[status] ?? STATUS_DOT_COLORS.idle
  return (
    <span title={getVibeStatusLabel(status, agentId)}>
      <BreathingDot
        color={config.color}
        animate={config.animate}
        size="xs"
        className={className}
      />
    </span>
  )
}

function AgentSparkline({ agentId, events }: { agentId: string; events: FeedEvent[] }) {
  const agentEvents = events.filter((e) => e.agent_id === agentId)
  const presence = useAgentPresence(agentEvents)
  const color = presence.state === 'idle' ? '#3b82f6' : '#10b981'
  return (
    <MiniSparkline
      data={presence.sparklineData}
      width={44}
      height={14}
      color={color}
      idleOpacity={0.55}
    />
  )
}

function VibeLabel({ agentId, status }: { agentId: string; status: string }) {
  const label = getVibeStatusLabel(status, agentId)
  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded font-medium',
        VIBE_LABEL_STYLES[status] ?? VIBE_LABEL_STYLES.idle,
      )}
    >
      {label}
    </span>
  )
}

function CapabilityPills({ assistant }: { assistant: Assistant }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {assistant.memory_enabled && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-medium">
          <Brain className="h-2.5 w-2.5" />
          Memory
        </span>
      )}
      {assistant.wallet_enabled && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-medium">
          <Wallet className="h-2.5 w-2.5" />
          Wallet
        </span>
      )}
    </div>
  )
}

export function AssistantsGridView({
  assistants,
  assistantDetailHref,
  feedEvents,
  approvals,
  onToggleActive,
}: {
  assistants: Assistant[]
  assistantDetailHref: (assistantId: string) => string
  feedEvents: FeedEvent[]
  approvals: PendingApproval[]
  onToggleActive: (assistant: Assistant, e: MouseEvent) => void
}) {
  const projectionByAgentId = buildAgentUiProjectionMap({
    agents: assistants,
    feedEvents,
    approvals,
  })

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {assistants.map((assistant, i) => {
        const channels = getActiveChannels(assistant)
        const vibe = getAgentVibe(assistant.id)
        const status = getAgentStatus(assistant)
        const projection = projectionByAgentId.get(assistant.id)
        return (
          <motion.div
            key={assistant.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, MAX_STAGGER_ITEMS) * 0.04 }}
          >
            <Link href={assistantDetailHref(assistant.id)}>
              <Card className={cn(
                'transition-all duration-200 cursor-pointer h-full group relative animate-state-enter',
                VIBE_ACCENTS[vibe],
              )}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <ModelBadge model={assistant.lucid_model} />
                        <StatusDot status={status} agentId={assistant.id} className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold truncate">{assistant.name}</h3>
                          <VibeLabel agentId={assistant.id} status={status} />
                          <AgentSparkline agentId={assistant.id} events={feedEvents} />
                          {projection?.needsAttention ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
                              Attention
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {projection?.runtimeTitle ?? 'Shared runtime'} · {assistant.lucid_model}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {projection?.teamLabel ?? 'Standalone'} · {projection?.channelCount ?? 0} channel{projection?.channelCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <AssistantActions assistant={assistant} onToggle={onToggleActive} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assistant.system_prompt && (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                      {assistant.system_prompt}
                    </p>
                  )}

                  <CapabilityPills assistant={assistant} />

                  <div className="flex flex-wrap items-center gap-1.5">
                    {projection?.pendingApprovals ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-medium">
                        {projection.pendingApprovals} approval{projection.pendingApprovals === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {projection?.teamLabel === 'Team-linked' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-medium">
                        Team-linked
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                      {projection?.runtimeOperator ?? 'Operated by Lucid'}
                    </span>
                  </div>

                  {projection?.attentionLabel ? (
                    <p className="text-[11px] text-amber-400 line-clamp-1">
                      Attention: {projection.attentionLabel}
                    </p>
                  ) : null}

                  {projection?.lastEventLabel ? (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      Latest: {projection.lastEventLabel}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1">
                      <ChannelBadges channels={channels} />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                      {formatRelativeTime(assistant.updated_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

export function AssistantsListView({
  assistants,
  assistantDetailHref,
  feedEvents,
  approvals,
  onToggleActive,
}: {
  assistants: Assistant[]
  assistantDetailHref: (assistantId: string) => string
  feedEvents: FeedEvent[]
  approvals: PendingApproval[]
  onToggleActive: (assistant: Assistant, e: MouseEvent) => void
}) {
  const projectionByAgentId = buildAgentUiProjectionMap({
    agents: assistants,
    feedEvents,
    approvals,
  })

  return (
    <div className="border rounded-lg divide-y">
      {assistants.map((assistant, i) => {
        const channels = getActiveChannels(assistant)
        const status = getAgentStatus(assistant)
        const projection = projectionByAgentId.get(assistant.id)
        return (
          <motion.div
            key={assistant.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, MAX_STAGGER_ITEMS) * 0.03 }}
          >
            <Link
              href={assistantDetailHref(assistant.id)}
              className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors group"
            >
              <div className="relative flex-shrink-0">
                <ModelBadge model={assistant.lucid_model} />
                <StatusDot status={status} agentId={assistant.id} className="absolute -bottom-0.5 -right-0.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{assistant.name}</span>
                  {assistant.memory_enabled && (
                    <Brain className="h-3 w-3 text-purple-400 flex-shrink-0" />
                  )}
                  {assistant.wallet_enabled && (
                    <Wallet className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {(projection?.runtimeTitle ?? 'Shared runtime')} · {assistant.lucid_model}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {(projection?.teamLabel ?? 'Standalone')} · {projection?.channelCount ?? 0} channel{projection?.channelCount === 1 ? '' : 's'}
                </p>
                {projection?.attentionLabel ? (
                  <p className="text-[11px] text-amber-400 truncate">
                    Attention: {projection.attentionLabel}
                  </p>
                ) : null}
                {projection?.lastEventLabel ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Latest: {projection.lastEventLabel}
                  </p>
                ) : null}
              </div>

              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                <ChannelBadges channels={channels} />
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {projection?.pendingApprovals ? (
                  <span className="hidden xl:inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                    {projection.pendingApprovals} approval{projection.pendingApprovals === 1 ? '' : 's'}
                  </span>
                ) : null}
                <VibeLabel agentId={assistant.id} status={status} />
                <AgentSparkline agentId={assistant.id} events={feedEvents} />
              </div>

              <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-16 text-right hidden lg:block">
                {formatRelativeTime(assistant.updated_at)}
              </span>

              <AssistantActions assistant={assistant} onToggle={onToggleActive} />
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
