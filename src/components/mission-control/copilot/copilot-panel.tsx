'use client'

/**
 * CopilotPanel — AI Copilot chat panel for Mission Control.
 *
 * Uses the industry-standard Vercel AI SDK v6 pattern:
 *   useChat() from @ai-sdk/react + DefaultChatTransport → /api/mission-control/copilot/chat
 *
 * Reuses the codebase's prompt-kit UI primitives:
 *   ChatContainer, Message, MessageContent, Tool, PromptInput, Loaders
 *
 * Features:
 *   - Persists messages per workspace via LocalStorageService
 *   - Passes workspace name to API for user context in system prompt
 *   - Suggestion pills on empty state
 *   - Copy button on assistant messages
 *   - Typing indicator during streaming
 *
 * Same pattern as AIChatInterface and AgentTestChat — no custom hooks.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from '@/ui/components/chat-container'
import { Message, MessageContent } from '@/ui/components/message'
import { Tool, type ToolPart } from '@/ui/components/tool'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/ui/components/prompt-input'
import { TypingLoader } from '@/ui/components/loader'
import { Button } from '@/components/ui/button'
import { localStorageService } from '@/lib/storage/LocalStorageService'
import { cn } from '@/lib/utils'
import {
  ArrowUp,
  Square,
  Sparkles,
  Trash2,
  Copy,
  Check,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────

interface CopilotPanelProps {
  orgId: string
  workspaceName: string
  onClose: () => void
}

/** Minimal serializable message for localStorage */
interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'copilot-messages'
const MAX_PERSISTED_MESSAGES = 50

const SUGGESTIONS = [
  'How do I create an agent?',
  'Show fleet health',
  'How to add plugins?',
  'Any pending approvals?',
]

// ── Helpers ───────────────────────────────────────────────────────

function getStorageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}:${orgId}`
}

/** Extract text content from a UIMessage (v6 parts-based format) */
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('')
}

/** Extract tool invocation parts from a UIMessage */
function getToolParts(message: UIMessage): ToolPart[] {
  return message.parts
    .filter(
      (part) =>
        part.type === 'tool-invocation' || part.type.startsWith('tool-'),
    )
    .map((part) => {
      const p = part as {
        type: string
        state: string
        toolCallId?: string
        toolName?: string
        input?: Record<string, unknown>
        output?: Record<string, unknown>
        errorText?: string
      }
      return {
        type: p.toolName || p.type.replace('tool-', ''),
        state: p.state as ToolPart['state'],
        input: p.input,
        output: p.output,
        toolCallId: p.toolCallId,
        errorText: p.errorText,
      }
    })
}

/** Serialize UIMessages to localStorage-safe format */
function serializeMessages(messages: UIMessage[]): PersistedMessage[] {
  return messages
    .map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      text: getTextContent(msg),
      createdAt: new Date().toISOString(),
    }))
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_PERSISTED_MESSAGES)
}

/** Deserialize localStorage messages to UIMessage format */
function deserializeMessages(persisted: PersistedMessage[]): UIMessage[] {
  return persisted.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text' as const, text: m.text }],
  }))
}

// ── Copy Button ───────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
      title="Copy"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────

export function CopilotPanel({
  orgId,
  workspaceName,
  onClose: _onClose,
}: CopilotPanelProps) {
  const [input, setInput] = useState('')
  const initializedRef = useRef(false)

  // Vercel AI SDK v6: useChat + DefaultChatTransport
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/mission-control/copilot/chat',
        body: { orgId, workspaceName },
      }),
    [orgId, workspaceName],
  )

  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  // ── Load persisted messages on mount ──────────────────────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const persisted = localStorageService.get<PersistedMessage[]>(
      getStorageKey(orgId),
    )
    if (persisted && persisted.length > 0) {
      setMessages(deserializeMessages(persisted))
    }
  }, [orgId, setMessages])

  // ── Persist messages on change ────────────────────────────────
  useEffect(() => {
    // Don't persist during streaming (partial messages)
    if (isStreaming) return
    // Don't persist empty state (would clear saved messages on mount)
    if (messages.length === 0 && !initializedRef.current) return

    localStorageService.set(getStorageKey(orgId), serializeMessages(messages))
  }, [messages, orgId, isStreaming])

  // ── Handlers ──────────────────────────────────────────────────

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || input).trim()
      if (!msg || isStreaming) return
      sendMessage({ text: msg })
      setInput('')
    },
    [input, isStreaming, sendMessage],
  )

  const handleClear = useCallback(() => {
    setMessages([])
    localStorageService.remove(getStorageKey(orgId))
  }, [setMessages, orgId])

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-medium">Copilot</span>
        <span className="flex-1" />
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleClear}
            title="Clear conversation"
          >
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Messages — ChatContainer for auto-scroll */}
      <ChatContainerRoot className="flex-1 min-h-0">
        <ChatContainerContent className="space-y-4 p-3">
          {/* Empty state with suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400/60" />
                <span className="text-sm text-muted-foreground">
                  Ask me anything about Lucid
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px]">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className={cn(
                      'text-[11px] px-2.5 py-1.5 rounded-full',
                      'border border-border/50 bg-muted/50',
                      'text-muted-foreground hover:text-foreground',
                      'hover:border-border hover:bg-accent/50',
                      'transition-colors cursor-pointer',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const text = getTextContent(msg)
            const toolParts =
              msg.role === 'assistant' ? getToolParts(msg) : []
            const isLastMessage = msg === messages[messages.length - 1]
            const isActiveStream = isStreaming && isLastMessage

            return (
              <Message
                key={msg.id}
                className={cn(
                  msg.role === 'user'
                    ? 'justify-end'
                    : 'flex-col gap-1.5',
                  'group/msg',
                )}
              >
                {msg.role === 'user' ? (
                  <MessageContent className="text-xs rounded-2xl px-3 py-2 max-w-[85%] bg-primary text-primary-foreground">
                    {text}
                  </MessageContent>
                ) : (
                  <>
                    {/* Tool calls */}
                    {toolParts.length > 0 && (
                      <div className="max-w-[90%]">
                        {toolParts.map((tp, i) => (
                          <Tool
                            key={`tool-${i}`}
                            toolPart={tp}
                            className="text-xs"
                            defaultOpen={tp.state === 'output-error'}
                          />
                        ))}
                      </div>
                    )}

                    {/* Text content with markdown */}
                    {text ? (
                      <div className="max-w-[90%] relative group/msg">
                        <MessageContent
                          markdown
                          className={cn(
                            'text-xs bg-muted/50 rounded-2xl px-3 py-2',
                            'prose prose-sm prose-zinc dark:prose-invert',
                            'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
                            'prose-headings:text-xs prose-headings:mt-2 prose-headings:mb-1',
                            'prose-code:text-[10px] prose-pre:text-[10px]',
                            'prose-table:text-[10px]',
                          )}
                        >
                          {text}
                        </MessageContent>
                        <div className="absolute -bottom-1 right-1">
                          <CopyButton text={text} />
                        </div>
                      </div>
                    ) : isActiveStream && toolParts.length === 0 ? (
                      <div className="max-w-[85%] px-2 py-1">
                        <TypingLoader
                          size="sm"
                          className="text-muted-foreground"
                        />
                      </div>
                    ) : null}

                    {/* Streaming indicator after text starts */}
                    {isActiveStream && text && (
                      <div className="px-2">
                        <TypingLoader
                          size="sm"
                          className="text-muted-foreground/50"
                        />
                      </div>
                    )}
                  </>
                )}
              </Message>
            )
          })}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Input */}
      <div className="p-2 border-t border-border/50">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={() => handleSend()}
          isLoading={isStreaming}
          disabled={isStreaming}
          className="rounded-xl"
        >
          <PromptInputTextarea
            placeholder="Ask about your agents or how to use Lucid..."
            className="text-xs min-h-[32px]"
          />
          <PromptInputActions className="justify-end px-2 pb-2">
            {isStreaming ? (
              <PromptInputAction tooltip="Stop" side="top">
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7 rounded-full"
                  aria-label="Stop copilot response"
                  onClick={() => stop()}
                >
                  <Square className="h-3 w-3" />
                </Button>
              </PromptInputAction>
            ) : (
              <PromptInputAction tooltip="Send" side="top">
                <Button
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Send copilot message"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              </PromptInputAction>
            )}
          </PromptInputActions>
        </PromptInput>
      </div>
    </>
  )
}
