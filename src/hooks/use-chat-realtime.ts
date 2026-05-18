'use client'

/**
 * useChatRealtime — Injects server-side messages into useChat's message state.
 *
 * Problem: Vercel AI SDK's useChat() only receives messages from streaming
 * responses. Messages inserted server-side (scheduled tasks, cross-agent
 * messaging) are invisible until page refresh.
 *
 * Solution: Subscribe to Realtime INSERT events on assistant_messages,
 * filtered by conversation_id. When a new message arrives that isn't
 * already in the local state, append it.
 *
 * Industry-standard pattern: Supabase Realtime (WebSocket) for instant
 * delivery + dedup guard (no duplicates from streaming + RT race).
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime'
import type {
  RealtimeBroadcastPayload,
  RealtimeSubscription,
  RealtimePayload,
} from '@/hooks/use-supabase-realtime'
import type { UIMessage } from 'ai'

interface UseChatRealtimeOptions {
  /** Active conversation ID — null disables subscription */
  conversationId: string | null
  /** Org ID for Realtime auth */
  orgId: string
  /** Current messages from useChat state */
  messages: UIMessage[]
  /** setMessages from useChat — used to append new messages */
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
  /** Whether the chat is currently streaming (skip injection during active stream) */
  isStreaming?: boolean
  /** Called when the worker broadcasts transient status/progress for this conversation */
  onStatus?: (label: string | null) => void
}

export function useChatRealtime({
  conversationId,
  orgId,
  messages,
  setMessages,
  isStreaming = false,
  onStatus,
}: UseChatRealtimeOptions) {
  // Use refs for values accessed inside the Realtime callback
  // to avoid re-subscribing on every message change
  const messagesRef = useRef(messages)
  const isStreamingRef = useRef(isStreaming)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { isStreamingRef.current = isStreaming }, [isStreaming])

  const handleEvent = useCallback((payload: RealtimePayload) => {
    const msg = payload.new as {
      id: string
      conversation_id: string
      role: string
      content: string
      created_at: string
    }

    // Skip if streaming — the streaming response will add this message itself
    if (isStreamingRef.current) return

    // Skip if not for our conversation (safety — filter should handle this)
    if (msg.conversation_id !== conversationId) return

    // Dedup: skip if message ID already in local state
    if (messagesRef.current.some(m => m.id === msg.id)) return

    // Skip system messages
    if (msg.role === 'system') return

    // Append the new message
    const uiMessage: UIMessage = {
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content || '' }],
    }

    setMessages((prev: UIMessage[]) => {
      // Double-check dedup inside updater (race condition guard)
      if (prev.some(m => m.id === msg.id)) return prev
      return [...prev, uiMessage]
    })
  }, [conversationId, setMessages])

  const handleBroadcast = useCallback((payload: RealtimeBroadcastPayload) => {
    const type = payload.payload.type
    if (type === 'status') {
      const label = payload.payload.label
      onStatus?.(typeof label === 'string' && label.trim() ? label.trim() : null)
      return
    }
    if (type === 'delta' || type === 'done' || type === 'error') {
      onStatus?.(null)
    }
  }, [onStatus])

  // Realtime subscription — only active when we have a conversation
  const subscriptions: RealtimeSubscription[] = conversationId
    ? [{
        table: 'assistant_messages',
        events: ['INSERT'] as const,
        filter: `conversation_id=eq.${conversationId}`,
      }]
    : []

  useSupabaseRealtime({
    channelName: conversationId ? `agent-chat:${conversationId}` : '',
    subscriptions,
    broadcasts: conversationId ? [{ event: 'stream' }] : [],
    onEvent: handleEvent,
    onBroadcast: handleBroadcast,
    orgId,
    enabled: !!conversationId,
  })
}
