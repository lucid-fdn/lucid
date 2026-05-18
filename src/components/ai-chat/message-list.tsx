'use client'

import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/ui/components/chat-container'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/ui/components/reasoning'
import { Tool, type ToolPart, getToolVerb } from '@/ui/components/tool'
import { TextDotsLoader } from '@/ui/components/loader'
import { Image as PromptImage } from '@/ui/components/image'
import { Source, SourceTrigger, SourceContent } from '@/ui/components/source'
import { Steps, StepsTrigger, StepsContent, StepsItem } from '@/ui/components/steps'
import { ThinkingBar } from '@/ui/components/thinking-bar'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
} from '@/ui/components/message'
import { ScrollButton } from '@/ui/components/scroll-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'
import {
  AlertTriangle,
  Check,
  Copy,
  Paperclip,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { useThemeLogo } from '@/hooks/use-theme-logo'

interface MessageListProps {
  messages: UIMessage[]
  status?: 'submitted' | 'streaming' | 'ready' | 'error'
  error?: Error | null
  onStop?: () => void
  showSubmittedIndicator?: boolean
  afterMessages?: React.ReactNode
  afterLastAssistantMessage?: React.ReactNode
  afterAssistantMessageId?: string | null
  streamStatusLabel?: string | null
}

type MessageComponentProps = {
  message: UIMessage
  isLastMessage: boolean
  isStreaming: boolean
  onStop?: () => void
  afterContent?: React.ReactNode
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('')
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <MessageAction tooltip={copied ? 'Copied!' : 'Copy'} delayDuration={100}>
      <Button variant="ghost" size="icon" className="rounded-full" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </MessageAction>
  )
}

/* ── Part type helpers ────────────────────────────────── */

type ReasoningStep = { kind: 'reasoning'; text: string }
type ToolStep = {
  kind: 'tool'
  toolName: string
  toolCallId?: string
  state: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorText?: string
}
type SourceStep = { kind: 'source'; href: string; title: string; description: string }
type StatusStep = { kind: 'status'; label: string }

type ChainStep = ReasoningStep | ToolStep | SourceStep | StatusStep

function readStatusLabel(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const label = (data as Record<string, unknown>).label
  return typeof label === 'string' && label.trim().length > 0 ? label.trim() : null
}

function getChainSteps(message: UIMessage): ChainStep[] {
  const steps: ChainStep[] = []
  for (const part of message.parts) {
    if (part.type === 'reasoning') {
      const p = part as { type: 'reasoning'; text: string }
      const last = steps[steps.length - 1]
      if (last?.kind === 'reasoning') {
        last.text += p.text
      } else {
        steps.push({ kind: 'reasoning', text: p.text })
      }
    } else if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
      const p = part as { type: string; state: string; toolCallId?: string; toolName?: string; input?: Record<string, unknown>; output?: Record<string, unknown>; errorText?: string }
      steps.push({
        kind: 'tool',
        toolName: p.toolName || p.type.replace('tool-', ''),
        toolCallId: p.toolCallId,
        state: p.state,
        input: p.input,
        output: p.output,
        errorText: p.errorText,
      })
    } else if (part.type === 'source-url') {
      const p = part as { type: string; url: string; title?: string; description?: string }
      steps.push({
        kind: 'source',
        href: p.url,
        title: p.title || '',
        description: p.description || '',
      })
    } else if (part.type === 'data-progress-status') {
      const p = part as { type: string; data?: unknown }
      const label = readStatusLabel(p.data)
      if (label) {
        steps.push({ kind: 'status', label })
      }
    }
  }
  return steps
}

function getFileParts(message: UIMessage) {
  return message.parts.filter(
    (p) => p.type === 'file'
  ) as Array<{ type: 'file'; url: string; mediaType: string; filename?: string }>
}

function getSourceSteps(steps: ChainStep[]): SourceStep[] {
  return steps.filter((s): s is SourceStep => s.kind === 'source')
}

function getToolSteps(steps: ChainStep[]): ToolStep[] {
  return steps.filter((s): s is ToolStep => s.kind === 'tool')
}

function getReasoningSteps(steps: ChainStep[]): ReasoningStep[] {
  return steps.filter((s): s is ReasoningStep => s.kind === 'reasoning')
}

function getStatusSteps(steps: ChainStep[]): StatusStep[] {
  return steps.filter((s): s is StatusStep => s.kind === 'status')
}

/* ── Message Component ────────────────────────────────── */

const MessageComponent = memo(
  ({ message, isLastMessage, isStreaming, onStop, afterContent }: MessageComponentProps) => {
    const isAssistant = message.role === 'assistant'
    const textContent = getTextContent(message)
    const chainSteps = isAssistant ? getChainSteps(message) : []
    const reasoningSteps = getReasoningSteps(chainSteps)
    const toolSteps = getToolSteps(chainSteps)
    const sourceSteps = getSourceSteps(chainSteps)
    const statusSteps = getStatusSteps(chainSteps)
    const latestStatus = statusSteps[statusSteps.length - 1]?.label
    const fileParts = isAssistant ? getFileParts(message) : []
    const isActiveStream = isStreaming && isLastMessage
    const { logo, logoAnimated } = useThemeLogo()

    return (
      <Message
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col gap-2 px-0 md:px-6',
          isAssistant ? 'items-start' : 'items-end'
        )}
      >
        <div
          className={cn(
            'flex w-full items-end gap-3',
            isAssistant ? 'flex-row' : 'flex-row-reverse'
          )}
        >
          {isAssistant && (
            <MessageAvatar
              className="mb-0.5 h-8 w-8"
              src={isActiveStream ? logoAnimated : logo}
              alt="Agent"
              fallback="AI"
            />
          )}

          {isAssistant ? (
            <div className="group flex w-full flex-col gap-0">
              {/* Reasoning (thinking) blocks */}
              {reasoningSteps.map((step, i) => (
                <Reasoning key={`r-${i}`} isStreaming={isActiveStream} className="mb-3">
                  <ReasoningTrigger className="text-sm text-muted-foreground">
                    Thinking
                  </ReasoningTrigger>
                  <ReasoningContent markdown contentClassName="text-sm">
                    {step.text}
                  </ReasoningContent>
                </Reasoning>
              ))}

              {/* Tool calls — industry standard: collapsed, human-friendly labels */}
              {toolSteps.length > 0 && (
                <div className="mb-3">
                  {(() => {
                    const allDone = toolSteps.every(s => s.state === 'output-available' || s.state === 'output-error')
                    const hasError = toolSteps.some(s => s.state === 'output-error')
                    const activeStep = toolSteps.find(s => s.state === 'input-streaming' || s.state === 'input-available')

                    if (toolSteps.length === 1) {
                      return (
                        <Tool
                          toolPart={{
                            type: toolSteps[0].toolName,
                            state: toolSteps[0].state as ToolPart['state'],
                            input: toolSteps[0].input,
                            output: toolSteps[0].output,
                            toolCallId: toolSteps[0].toolCallId,
                            errorText: toolSteps[0].errorText,
                          }}
                          defaultOpen={toolSteps[0].state === 'output-error'}
                        />
                      )
                    }

                    return (
                      <Steps defaultOpen={false}>
                        <StepsTrigger leftIcon={
                          !allDone ? (
                            <TextDotsLoader text="" size="sm" className="h-4 w-4" />
                          ) : hasError ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )
                        }>
                          {!allDone && activeStep
                            ? getToolVerb(activeStep.toolName) + '...'
                            : hasError
                              ? `Used ${toolSteps.length} tools (${toolSteps.filter(s => s.state === 'output-error').length} failed)`
                              : `Used ${toolSteps.length} tools`
                          }
                        </StepsTrigger>
                        <StepsContent>
                          {toolSteps.map((step, i) => (
                            <StepsItem key={`t-${i}`}>
                              <Tool
                                toolPart={{
                                  type: step.toolName,
                                  state: step.state as ToolPart['state'],
                                  input: step.input,
                                  output: step.output,
                                  toolCallId: step.toolCallId,
                                  errorText: step.errorText,
                                }}
                                defaultOpen={step.state === 'output-error'}
                              />
                            </StepsItem>
                          ))}
                        </StepsContent>
                      </Steps>
                    )
                  })()}
                </div>
              )}

              {isActiveStream && latestStatus ? (
                <div className="mb-3">
                  <ThinkingBar text={latestStatus} onStop={onStop} stopLabel="Skip thinking" />
                </div>
              ) : null}

              {/* Main text content */}
              {textContent ? (
                <MessageContent
                  className="text-foreground prose w-full min-w-0 flex-1 overflow-x-auto rounded-lg bg-transparent p-0"
                  markdown
                >
                  {textContent}
                </MessageContent>
              ) : isActiveStream && !latestStatus && reasoningSteps.length === 0 && toolSteps.length === 0 ? (
                <ThinkingBar text={latestStatus ?? 'Deep reasoning in progress'} onStop={onStop} stopLabel="Skip thinking" />
              ) : null}

              {/* File parts — prompt-kit Image for base64, img for URLs */}
              {fileParts.map((part, i) =>
                part.mediaType.startsWith('image/') ? (
                  part.url.startsWith('data:') ? (
                    <PromptImage
                      key={`img-${i}`}
                      base64={part.url.split(',')[1]}
                      mediaType={part.mediaType}
                      alt={part.filename || 'image'}
                      className="my-2 max-w-sm rounded-lg"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`img-${i}`} src={part.url} alt={part.filename || 'image'} className="my-2 max-w-sm rounded-lg" />
                  )
                ) : (
                  <div key={`file-${i}`} className="my-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{part.filename || 'file'}</span>
                  </div>
                )
              )}

              {/* Source citations — using prompt-kit Source */}
              {sourceSteps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sourceSteps.map((source, i) => (
                    <Source key={`src-${i}`} href={source.href}>
                      <SourceTrigger label={i + 1} showFavicon />
                      <SourceContent title={source.title} description={source.description} />
                    </Source>
                  ))}
                </div>
              )}

              {/* Actions — only after streaming ends */}
              {!isActiveStream && (
                <MessageActions
                  className={cn(
                    '-ml-2.5 flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                    isLastMessage && 'opacity-100'
                  )}
                >
                  <CopyButton text={textContent} />
                  <MessageAction tooltip="Upvote" delayDuration={100}>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <ThumbsUp />
                    </Button>
                  </MessageAction>
                  <MessageAction tooltip="Downvote" delayDuration={100}>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <ThumbsDown />
                    </Button>
                  </MessageAction>
                </MessageActions>
              )}

              {afterContent ? <div>{afterContent}</div> : null}
            </div>
          ) : (
            <div className="group flex w-full flex-col items-end gap-1">
              {/* User file attachments */}
              {getFileParts(message).length > 0 && (
                <div className="flex flex-wrap gap-2 max-w-[85%] sm:max-w-[75%]">
                  {getFileParts(message).map((part, i) =>
                    part.mediaType.startsWith('image/') ? (
                      <img
                        key={`uimg-${i}`}
                        src={part.url}
                        alt={part.filename || 'image'}
                        className="max-w-xs rounded-lg"
                      />
                    ) : (
                      <div key={`ufile-${i}`} className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                        <Paperclip className="h-3.5 w-3.5" />
                        <span>{part.filename || 'file'}</span>
                      </div>
                    )
                  )}
                </div>
              )}
              <MessageContent className="rounded-lg p-2 prose break-words whitespace-normal bg-secondary text-primary max-w-[85%] sm:max-w-[75%]">
                {getTextContent(message)}
              </MessageContent>
              <MessageActions
                className="flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              >
                <CopyButton text={textContent} />
              </MessageActions>
            </div>
          )}
        </div>
      </Message>
    )
  }
)

MessageComponent.displayName = 'MessageComponent'

const ErrorMessage = memo(({ error }: { error: Error }) => {
  const { logo } = useThemeLogo()
  return (
    <Message className="not-prose mx-auto flex w-full max-w-3xl flex-col items-start gap-2 px-0 md:px-6">
      <div className="flex w-full items-end gap-3">
        <MessageAvatar
          className="mb-0.5 h-8 w-8"
          src={logo}
          alt="Agent"
          fallback="AI"
        />
        <div className="text-primary flex min-w-0 flex-1 flex-row items-center gap-2 rounded-lg border-2 border-red-300 dark:border-red-800 bg-red-300/20 dark:bg-red-950/30 px-2 py-1">
          <AlertTriangle size={16} className="text-red-500 dark:text-red-400" />
          <p className="text-red-500 dark:text-red-400">{error.message}</p>
        </div>
      </div>
    </Message>
  )
})

ErrorMessage.displayName = 'ErrorMessage'

export function MessageList({
  messages,
  status = 'ready',
  error,
  onStop,
  showSubmittedIndicator = true,
  afterMessages,
  afterLastAssistantMessage,
  afterAssistantMessageId,
  streamStatusLabel,
}: MessageListProps) {
  const isStreaming = status === 'streaming'
  const isWaiting = showSubmittedIndicator && status === 'submitted'
  const { logoAnimated } = useThemeLogo()
  const lastAssistantIndex = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') return index
    }
    return -1
  })()

  return (
    <ChatContainerRoot className="relative h-full flex-1 min-h-0 space-y-0">
      <ChatContainerContent className="space-y-12 px-4 py-12">
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1
          const isAnchoredAssistantMessage = afterAssistantMessageId
            ? message.role === 'assistant' && message.id === afterAssistantMessageId
            : message.role === 'assistant' && index === lastAssistantIndex

          return (
            <MessageComponent
              key={message.id}
              message={message}
              isLastMessage={isLastMessage}
              isStreaming={isLastMessage && isStreaming}
              onStop={onStop}
              afterContent={isAnchoredAssistantMessage ? afterLastAssistantMessage : undefined}
            />
          )
        })}

        {isWaiting && (
          <Message className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-0 md:px-6 items-start">
            <div className="flex w-full items-end gap-3 flex-row">
              <MessageAvatar className="mb-0.5 h-8 w-8" src={logoAnimated} alt="Agent" fallback="AI" />
              <div className="flex w-full flex-col gap-0">
                <ThinkingBar text={streamStatusLabel ?? 'Deep reasoning in progress'} onStop={onStop} stopLabel="Skip thinking" />
              </div>
            </div>
          </Message>
        )}

        {error && <ErrorMessage error={error} />}
        {afterMessages ? (
          <div className="mx-auto w-full max-w-3xl px-0 md:px-6">
            {afterMessages}
          </div>
        ) : null}
        <ChatContainerScrollAnchor />
      </ChatContainerContent>

      <ScrollButton className="absolute bottom-4 right-4" />
    </ChatContainerRoot>
  )
}
