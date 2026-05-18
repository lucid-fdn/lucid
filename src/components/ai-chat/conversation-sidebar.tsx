'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { summarizeError } from '@/lib/logging/safe-log'

interface ConversationItem {
  id: string
  title: string | null
  model: string
  updated_at: string
  total_input_tokens: number
  total_output_tokens: number
}

interface ConversationSidebarProps {
  orgId: string
  projectId: string
  activeConversationId?: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  /** Increment to trigger a refetch of conversations */
  refreshKey?: number
  className?: string
}

export function ConversationSidebar({
  orgId,
  projectId,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  refreshKey,
  className,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(
        `/api/ai/conversations?orgId=${orgId}&projectId=${projectId}`,
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (err) {
      console.error('[ConversationSidebar] Error:', summarizeError(err))
    } finally {
      setIsLoading(false)
    }
  }, [orgId, projectId])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations, refreshKey])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingId) return

    setDeletingId(id)
    try {
      const res = await fetch('/api/ai/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id }),
      })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeConversationId === id) {
          onNewConversation()
        }
      }
    } catch (err) {
      console.error('[ConversationSidebar] Delete error:', summarizeError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={cn('flex flex-col h-full border-r bg-muted/30', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-semibold">Conversations</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNewConversation}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={cn(
                  'w-full text-left rounded-md px-3 py-2 text-sm transition-colors group',
                  'hover:bg-muted',
                  activeConversationId === conv.id &&
                    'bg-primary/10 text-primary font-medium',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate flex-1">
                    {conv.title || 'Untitled Chat'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => handleDelete(conv.id, e)}
                    disabled={deletingId === conv.id}
                  >
                    {deletingId === conv.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground truncate">
                    {conv.model.split('/').pop()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.updated_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
