'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ChatInput } from './chat-input'
import { EmptyState } from '@/components/ai-common/empty-state'
import { Button } from '@/components/ui/button'
import { RotateCcw, AlertCircle, Bot, Loader2 } from 'lucide-react'
import { AgentThinkingBanner } from './agent-thinking-banner'
import type { FileUIPart } from '@/lib/ai/attachments'
import { isVisionCapable, IMAGE_INPUT_ACCEPT } from '@/lib/ai/attachments'
import { useChatRealtime } from '@/hooks/use-chat-realtime'
import type { EntitlementDeny } from '@/lib/entitlements/types'
import { parseEntitlementError } from '@/components/entitlements/entitlement-error'
import { ChatLimitCard } from '@/components/entitlements/chat-limit-card'
import { UsageHint } from '@/components/entitlements/usage-hint'
import { useEntitlementStatus } from '@/hooks/use-entitlement-status'
import type { ChatStatus } from '@/lib/mission-control/types'
import { summarizeError } from '@/lib/logging/safe-log'

const MessageList = dynamic(() => import('./message-list').then((mod) => mod.MessageList), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading conversation...
    </div>
  ),
})

interface AgentTestChatProps {
  assistantId: string
  assistantName: string
  /** The assistant's configured model — used to gate file uploads */
  lucidModel?: string
  /** Org ID for proactive usage warnings */
  orgId?: string
  /** Callback when chat status changes (for presence indicator) */
  onStatusChange?: (status: ChatStatus) => void
}

export function AgentTestChat({ assistantId, assistantName, lucidModel, orgId, onStatusChange }: AgentTestChatProps) {
  const [isInitializing, setIsInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<FileUIPart[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [entitlementDeny, setEntitlementDeny] = useState<EntitlementDeny | null>(null)
  const [streamStatusLabel, setStreamStatusLabel] = useState<string | null>(null)
  const entitlementDenyRef = useRef<EntitlementDeny | null>(null)

  // Proactive usage warnings (server-computed thresholds)
  const { data: entitlementData } = useEntitlementStatus({ orgId })
  const aiQueryItem = entitlementData?.items.find(i => i.metric === 'ai_queries_monthly') ?? null

  // Only allow file uploads when the agent's model supports vision
  // OpenClaw only supports image attachments (not PDFs), so restrict to images only
  const supportsFiles = lucidModel ? isVisionCapable(lucidModel) : false

  // AI SDK v6: same pattern as ai-chat-interface.tsx
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/assistants/${assistantId}/chat`,
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetch(input, init)

          // Intercept entitlement errors
          if (!response.ok && (response.status === 429 || response.status === 403)) {
            try {
              const cloned = response.clone()
              const body = await cloned.json()
              const deny = parseEntitlementError(body)
              if (deny) {
                entitlementDenyRef.current = deny
                setEntitlementDeny(deny)
              }
            } catch {
              // Not an entitlement error
            }
          }

          return response
        }) as typeof globalThis.fetch,
      }),
    [assistantId],
  )

  const { messages, sendMessage, setMessages, status, stop, error: chatError } = useChat({
    transport,
    onError: (err: Error) => {
      // Don't show raw error banner if we have a structured entitlement error
      // Use ref (sync) not state (async) to avoid race with React batching
      if (!entitlementDenyRef.current) {
        const safeError = summarizeError(err)
        console.error('[AgentTestChat] onError:', safeError)
        setError(safeError.message || 'Agent processing failed')
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Inject server-side messages (scheduled tasks, cross-agent) via Realtime
  useChatRealtime({
    conversationId,
    orgId: orgId || '',
    messages,
    setMessages,
    isStreaming: status === 'streaming',
    onStatus: setStreamStatusLabel,
  })

  // Propagate chat status for presence indicator
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // Load existing conversation on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res = await fetch(`/api/assistants/${assistantId}/chat`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return

        if (data.conversationId) {
          setConversationId(data.conversationId)
        }
        if (data.messages?.length > 0) {
          // Convert DB messages to UIMessage format for useChat
          const uiMessages = data.messages
            .filter((m: { role: string }) => m.role !== 'system')
            .map((m: { id: string; role: string; content: string; created_at?: string }) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              parts: [{ type: 'text' as const, text: m.content || '' }],
              createdAt: m.created_at ? new Date(m.created_at) : new Date(),
            }))
          setMessages(uiMessages)
        }
      } catch {
        // Init failure is non-fatal
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [assistantId, setMessages])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if ((!trimmed && files.length === 0) || isLoading) return

    setError(null)
    setEntitlementDeny(null)
    setStreamStatusLabel(null)
    entitlementDenyRef.current = null
    setInput('')
    if (files.length > 0) {
      sendMessage({ text: trimmed || '', files })
      setFiles([])
    } else {
      sendMessage({ text: trimmed })
    }
  }, [input, files, isLoading, sendMessage])

  const handleClearChat = useCallback(() => {
    setMessages([])
    setInput('')
    setFiles([])
    setError(null)
    setEntitlementDeny(null)
    setStreamStatusLabel(null)
    entitlementDenyRef.current = null

    // Reset conversation server-side so the agent starts fresh
    if (conversationId) {
      fetch(`/api/assistants/${assistantId}/chat/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      }).catch(() => {})
    }
    setConversationId(null)
  }, [setMessages, conversationId, assistantId])

  const hasMessages = messages.length > 0

  const suggestions = [
    { label: 'Say hello', prompt: 'Hello! What can you help me with?' },
    { label: 'Test tools', prompt: 'What tools do you have available?' },
    { label: 'Check memory', prompt: 'What do you remember about our conversations?' },
    {
      label: 'Test a task',
      prompt: 'Can you help me with a simple task to test your capabilities?',
    },
  ]

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground" style={{ minHeight: '100%' }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading conversation...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {!hasMessages ? (
        <div className="flex-1 relative">
          <EmptyState
            title={assistantName}
            subtitle="Uses tools, memory, and channels — same as production"
            placeholder="Send a test message..."
            suggestions={suggestions}
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={isLoading}
            modelSelector={
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                <span>Agent mode</span>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearChat}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Clear Chat
              </Button>

            </div>

            {isLoading && <AgentThinkingBanner status={status} label={streamStatusLabel ?? undefined} />}
          </div>

          <MessageList
            messages={messages}
            status={entitlementDeny ? 'ready' : status}
            error={chatError}
            onStop={stop}
            streamStatusLabel={streamStatusLabel}
          />

          {/* Entitlement error card — inline upgrade prompt */}
          {entitlementDeny && (
            <div className="px-4 pb-4">
              <ChatLimitCard deny={entitlementDeny} />
            </div>
          )}

          <UsageHint item={aiQueryItem} />

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={stop}
            isLoading={isLoading}
            placeholder={supportsFiles ? 'Send a test message... (images supported)' : 'Send a test message...'}
            files={supportsFiles ? files : undefined}
            onFilesChange={supportsFiles ? setFiles : undefined}
            accept={supportsFiles ? IMAGE_INPUT_ACCEPT : undefined}
          />
        </div>
      )}
    </div>
  )
}
