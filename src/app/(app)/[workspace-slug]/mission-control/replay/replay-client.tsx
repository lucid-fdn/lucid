'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ConversationListItem } from '@/components/mission-control/replay/conversation-list-item'
import { EmptyState } from '@/components/mission-control/empty-state'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import type { MCAgent } from '@/lib/mission-control/types'

interface Conversation {
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

interface ReplayClientProps {
  orgId: string
  workspaceSlug: string
  agents: MCAgent[]
}

const PAGE_SIZE = 20

export function ReplayClient({ orgId, workspaceSlug, agents }: ReplayClientProps) {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const fetchConversations = useCallback(async (newOffset: number, agentId: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        org_id: orgId,
        limit: String(PAGE_SIZE),
        offset: String(newOffset),
      })
      if (agentId) params.set('agent_id', agentId)

      const res = await fetch(`/api/mission-control/replay/conversations?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')

      const data = await res.json()
      const items: Conversation[] = data.conversations ?? []
      setConversations(items)
      setHasMore(items.length === PAGE_SIZE)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchConversations(offset, selectedAgentId)
  }, [offset, selectedAgentId, fetchConversations])

  const handleConversationClick = (conversationId: string) => {
    router.push(`/${workspaceSlug}/mission-control/replay/${conversationId}?org_id=${orgId}`)
  }

  const handleAgentFilter = (agentId: string) => {
    setOffset(0)
    setSelectedAgentId(agentId === 'all' ? null : agentId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          className={cn(
            'text-sm bg-transparent border rounded px-2 py-1',
            'focus:outline-none focus:ring-1 focus:ring-ring'
          )}
          value={selectedAgentId ?? 'all'}
          onChange={(e) => handleAgentFilter(e.target.value)}
        >
          <option value="all">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.projectName ? `${agent.name} - ${agent.projectName}` : agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            title="No conversations found"
            description="Conversation receipts will appear here after agents handle messages or runs produce chat history."
          />
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <ConversationListItem
                key={conv.conversation_id}
                conversation={conv}
                onClick={handleConversationClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {Math.floor(offset / PAGE_SIZE) + 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasMore}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
