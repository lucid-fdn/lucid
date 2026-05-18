'use client'

import { AlertCircle } from 'lucide-react'
import { AgentTestChat } from '@/components/ai-chat/agent-test-chat'
import { cn } from '@/lib/utils'
import type { ChatStatus } from '@/lib/mission-control/types'

interface InlineChatPanelProps {
  assistantId: string
  assistantName: string
  lucidModel?: string
  orgId?: string
  isActive?: boolean
  onChatStatusChange?: (status: ChatStatus) => void
  className?: string
}

export function InlineChatPanel({
  assistantId,
  assistantName,
  lucidModel,
  orgId,
  isActive = true,
  onChatStatusChange,
  className,
}: InlineChatPanelProps) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Inactive warning */}
      {!isActive && (
        <div className="bg-amber-950/20 border-b border-amber-800 px-3 py-1.5 flex items-center gap-2 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 text-amber-300" />
          <span className="text-[11px] text-amber-300">
            Inactive — channel messages paused, but you can test here
          </span>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AgentTestChat
          assistantId={assistantId}
          assistantName={assistantName}
          lucidModel={lucidModel}
          orgId={orgId}
          onStatusChange={onChatStatusChange}
        />
      </div>
    </div>
  )
}
