'use client'

import { cn } from '@/lib/utils'
import { MessageSquare, AlertTriangle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react'

interface ConversationListItemProps {
  conversation: {
    conversation_id: string
    agent_name: string
    project_slug?: string | null
    project_name?: string | null
    channel_type: string
    external_user_id: string
    status: string
    started_at: string
    finished_at: string | null
    preview: string
  }
  onClick: (id: string) => void
}

const STATUS_ICONS: Record<string, LucideIcon> = {
  done: CheckCircle2,
  failed: AlertTriangle,
  processing: Clock,
  pending: Clock,
}

export function ConversationListItem({ conversation, onClick }: ConversationListItemProps) {
  const Icon = STATUS_ICONS[conversation.status] || MessageSquare
  const isError = conversation.status === 'failed'

  return (
    <button
      onClick={() => onClick(conversation.conversation_id)}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-colors border',
        'hover:bg-accent/50 border-transparent hover:border-border',
        isError && 'border-red-500/20 bg-red-500/5'
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn(
          'h-4 w-4 mt-0.5 flex-shrink-0',
          isError ? 'text-red-400' : 'text-muted-foreground'
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{conversation.agent_name}</span>
            <span className="text-[10px] text-muted-foreground/60 capitalize">
              {conversation.channel_type}
            </span>
          </div>
          {conversation.project_name || conversation.project_slug ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
              Project {conversation.project_name ?? conversation.project_slug}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {conversation.preview || 'No preview'}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/50">
            <span>{formatTime(conversation.started_at)}</span>
            <span>user:{conversation.external_user_id?.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
