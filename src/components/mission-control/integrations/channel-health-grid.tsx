'use client'
import { EmptyState } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { CheckCircle2, Radio, XCircle } from 'lucide-react'

interface ChannelHealth {
  id: string
  channel_type: string
  assistant_name: string
  is_active: boolean
  last_event_at: string | null
  error_count_24h: number
}

interface ChannelHealthGridProps {
  channels: ChannelHealth[]
}

export function ChannelHealthGrid({ channels }: ChannelHealthGridProps) {
  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels configured"
        description="Connected channels will appear here with activity and error health."
        className="min-h-24 py-6"
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {channels.map((ch) => (
        <WorkspaceActionRow
          key={ch.id}
          title={ch.channel_type}
          description={ch.assistant_name}
          icon={Radio}
          tone={
            ch.error_count_24h > 0
              ? 'danger'
              : ch.is_active
                ? 'success'
                : 'default'
          }
          meta={
            <>
              {ch.is_active ? (
                <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <XCircle className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div>
                {ch.last_event_at
                  ? `Last: ${new Date(ch.last_event_at).toLocaleTimeString()}`
                  : 'No events'}
              </div>
              {ch.error_count_24h > 0 && (
                <div className="text-red-400">{ch.error_count_24h} errors</div>
              )}
            </>
          }
        />
      ))}
    </div>
  )
}
