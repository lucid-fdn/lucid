'use client'

import { EmptyState } from '@/components/page'
import { Button } from '@/components/ui/button'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { formatRelativeTime } from '@/lib/mission-control/constants'
import type { NativeChannelStatus } from '@/lib/mission-control/types'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Square,
} from 'lucide-react'
import { useCallback, useState } from 'react'

// ─── Constants ───

const CHANNEL_STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  reconnecting: 'bg-amber-500',
  error: 'bg-red-500',
  stopped: 'bg-zinc-400',
}

const CHANNEL_STATUS_TEXT: Record<string, string> = {
  connected: 'text-green-400',
  reconnecting: 'text-amber-400',
  error: 'text-red-400',
  stopped: 'text-zinc-400',
}

const CHANNEL_ICONS: Record<string, string> = {
  telegram: 'TG',
  discord: 'DC',
  slack: 'SL',
  whatsapp: 'WA',
  web: 'WB',
}

// ─── Component ───

interface NativeChannelsSectionProps {
  runtimeId: string
  orgId: string
  channels: NativeChannelStatus[]
}

export function NativeChannelsSection({
  runtimeId,
  orgId,
  channels,
}: NativeChannelsSectionProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const sendAction = useCallback(
    async (
      type: 'pause_channel' | 'resume_channel' | 'stop_all_channels',
      channelType?: string,
      accountId?: string,
    ) => {
      const key = `${type}:${channelType ?? 'all'}`
      setActionLoading(key)
      setActionMessage(null)
      try {
        const res = await fetch(
          `/api/runtimes/${runtimeId}/governance?org_id=${orgId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, channelType, accountId }),
            signal: AbortSignal.timeout(15_000),
          },
        )
        if (res.ok) {
          const data = await res.json()
          setActionMessage(
            `Queued: ${type.replace(/_/g, ' ')} (${data.pendingCount ?? '?'} pending)`,
          )
        } else {
          const data = await res.json().catch(() => ({}))
          setActionMessage(`Failed: ${data.error || res.statusText}`)
        }
      } catch (err) {
        const msg =
          err instanceof Error && err.name === 'TimeoutError'
            ? 'Request timed out'
            : err instanceof Error
              ? err.message
              : 'Unknown error'
        setActionMessage(`Failed: ${msg}`)
      } finally {
        setActionLoading(null)
      }
    },
    [runtimeId, orgId],
  )

  const connectedCount = channels.filter((c) => c.status === 'connected').length
  const errorCount = channels.filter((c) => c.status === 'error').length

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Radio className="h-3 w-3" />
          Native Channels ({connectedCount}/{channels.length} connected)
        </h3>
        {channels.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-red-400 hover:text-red-300"
            onClick={() => sendAction('stop_all_channels')}
            disabled={actionLoading === 'stop_all_channels:all'}
          >
            <Square className="mr-1 h-3 w-3" />
            Stop all
          </Button>
        )}
      </div>

      {channels.length === 0 ? (
        <EmptyState
          title="No native channels connected"
          description="The runtime will report channels via heartbeat when configured."
          className="min-h-24 py-6"
        />
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <ChannelCard
              key={`${ch.channelType}:${ch.accountId}`}
              channel={ch}
              actionLoading={actionLoading}
              onAction={sendAction}
            />
          ))}
        </div>
      )}

      {errorCount > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-400">
          <AlertTriangle className="h-3 w-3" />
          {errorCount} channel{errorCount !== 1 ? 's' : ''} in error state
        </div>
      )}

      {actionMessage && (
        <p
          className={cn(
            'mt-2 text-[10px]',
            actionMessage.includes('Failed')
              ? 'text-red-400'
              : 'text-emerald-400',
          )}
        >
          {actionMessage}
        </p>
      )}
    </section>
  )
}

// ─── Channel Card ───

function ChannelCard({
  channel: ch,
  actionLoading,
  onAction,
}: {
  channel: NativeChannelStatus
  actionLoading: string | null
  onAction: (
    type: 'pause_channel' | 'resume_channel',
    channelType: string,
    accountId: string,
  ) => void
}) {
  const statusColor = CHANNEL_STATUS_COLORS[ch.status] || 'bg-zinc-400'
  const textColor = CHANNEL_STATUS_TEXT[ch.status] || 'text-zinc-400'
  const icon =
    CHANNEL_ICONS[ch.channelType] || ch.channelType.slice(0, 2).toUpperCase()
  const isPaused = ch.status === 'stopped'
  const actionKey = `${isPaused ? 'resume' : 'pause'}_channel:${ch.channelType}`

  return (
    <WorkspaceActionRow
      title={ch.channelType}
      eyebrow={icon}
      description={
        <>
          {ch.accountId}
          {ch.lastMessageAt && (
            <span className="ml-2">
              <MessageSquare className="mr-0.5 inline h-2.5 w-2.5" />
              {formatRelativeTime(ch.lastMessageAt)}
            </span>
          )}
        </>
      }
      tone={
        ch.status === 'error'
          ? 'danger'
          : ch.status === 'connected'
            ? 'success'
            : ch.status === 'reconnecting'
              ? 'warning'
              : 'default'
      }
      className={cn(ch.status === 'stopped' && 'opacity-60')}
      meta={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() =>
            onAction(
              isPaused ? 'resume_channel' : 'pause_channel',
              ch.channelType,
              ch.accountId,
            )
          }
          disabled={actionLoading === actionKey}
          title={isPaused ? 'Resume channel' : 'Pause channel'}
        >
          {isPaused ? (
            <Play className="h-3 w-3 text-emerald-400" />
          ) : (
            <Pause className="h-3 w-3 text-amber-400" />
          )}
        </Button>
      }
    >
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className={cn('h-1.5 w-1.5 rounded-full', statusColor)} />
        <span className={textColor}>{ch.status}</span>
      </div>
      {ch.status === 'error' && ch.errorMessage && (
        <div className="mt-2 rounded bg-red-500/5 px-2 py-1 text-[10px] text-red-400">
          {ch.errorMessage}
        </div>
      )}
    </WorkspaceActionRow>
  )
}
