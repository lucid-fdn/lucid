/**
 * Channel List Component
 * 
 * Displays a list of channels with status, actions, and management controls.
 * Supports deletion, viewing webhook URLs, and status monitoring.
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Copy, MoreVertical, Trash2, RefreshCw } from 'lucide-react'
import { ChannelBadge } from './channel-badge'
import { getChannelStatusForUi, type ChannelType, type ChannelStatus } from '@/lib/channels/types'
import { cn } from '@/lib/utils'

export interface Channel {
  id: string
  channel_type: ChannelType
  is_active: boolean
  created_at: string
  external_channel_id?: string
  metadata?: Record<string, unknown>
}

interface ChannelListProps {
  channels: Channel[]
  onDelete?: (channelId: string) => Promise<void>
  onRefresh?: () => Promise<void>
  webhookBaseUrl?: string
  className?: string
}

export function ChannelList({
  channels,
  onDelete,
  onRefresh,
  webhookBaseUrl,
  className,
}: ChannelListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const getChannelStatus = (channel: Channel): ChannelStatus => {
    const uiStatus = getChannelStatusForUi(channel)
    if (uiStatus === 'pending') return 'pending'
    if (!channel.is_active) return 'inactive'
    if (channel.metadata?.error) return 'error'
    return 'active'
  }

  const copyToClipboard = (text: string, channelId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(channelId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async (channelId: string) => {
    if (!onDelete) return
    if (!confirm('Are you sure you want to delete this channel?')) return

    setDeletingId(channelId)
    try {
      await onDelete(channelId)
    } finally {
      setDeletingId(null)
    }
  }

  const getWebhookUrl = (channel: Channel) => {
    if (!webhookBaseUrl) return null
    if (!['telegram', 'whatsapp'].includes(channel.channel_type)) return null
    return `${webhookBaseUrl}/api/webhooks/${channel.channel_type}/${channel.id}`
  }

  if (channels.length === 0) {
    return (
      <div className={cn('text-center py-12 border border-dashed rounded-lg', className)}>
        <p className="text-muted-foreground">No channels configured yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Click "Add Channel" to get started.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {channels.map((channel) => {
        const status = getChannelStatus(channel)
        const webhookUrl = getWebhookUrl(channel)

        return (
          <Card key={channel.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                {/* Channel Badge + Status */}
                <div className="flex items-center gap-2">
                  <ChannelBadge type={channel.channel_type} status={status} />
                  {channel.external_channel_id && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {channel.external_channel_id}
                    </Badge>
                  )}
                </div>

                {/* Error Message */}
                {status === 'error' && !!channel.metadata?.error && (
                  <p className="text-xs text-destructive">
                    {String(channel.metadata.error)}
                  </p>
                )}

                {/* Webhook URL */}
                {webhookUrl && (
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {webhookUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(webhookUrl, channel.id)}
                    >
                      {copiedId === channel.id ? (
                        <span className="text-xs">Copied!</span>
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}

                {/* Created Date */}
                <p className="text-xs text-muted-foreground">
                  Created {new Date(channel.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {webhookUrl && (
                    <DropdownMenuItem onClick={() => copyToClipboard(webhookUrl, channel.id)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Webhook URL
                    </DropdownMenuItem>
                  )}
                  {onRefresh && (
                    <DropdownMenuItem onClick={onRefresh}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Status
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => handleDelete(channel.id)}
                      disabled={deletingId === channel.id}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deletingId === channel.id ? 'Deleting...' : 'Delete Channel'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
