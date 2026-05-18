'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { PublicAppConfig } from '@contracts/app-runtime'
import type { PublicShellManifest } from '@/lib/app-service/public-shell-core'
import { AlertCircle, Loader2, MessageSquareText, SendHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react'

interface PublicAppInteractionsProps {
  config: Omit<PublicAppConfig, 'visibility'> & {
    visibility: 'private' | 'unlisted' | 'public'
  }
  manifest: PublicShellManifest
  isPreview: boolean
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function endpoint(config: PublicAppInteractionsProps['config'], key: string) {
  return config.public_endpoints[key]
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message ?? 'Request failed.'
    throw new Error(message)
  }
  return payload as T
}

export function PublicAppInteractions({
  config,
  manifest,
  isPreview,
}: PublicAppInteractionsProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadMessage, setLeadMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const chatEndpoint = endpoint(config, 'chat')
  const sessionEndpoint = endpoint(config, 'sessions')
  const leadEndpoint = endpoint(config, 'lead')
  const feedbackEndpoint = endpoint(config, 'feedback')
  const canChat = manifest.capabilities.includes('chat') && Boolean(chatEndpoint)
  const canLead = manifest.capabilities.includes('lead') && Boolean(leadEndpoint)
  const canFeedback = manifest.capabilities.includes('feedback') && Boolean(feedbackEndpoint)
  const starter = useMemo(() => (
    manifest.marketplace.demo_prompts[0] ?? 'How can you help me?'
  ), [manifest.marketplace.demo_prompts])

  useEffect(() => {
    if (!sessionEndpoint || config.status !== 'active') return
    let cancelled = false
    postJson<{ data?: { session?: { id?: string } } }>(sessionEndpoint, {
      metadata: { source: 'lucid_public_shell' },
    })
      .then((payload) => {
        if (!cancelled) setSessionId(payload.data?.session?.id ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [config.status, sessionEndpoint])

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = chatInput.trim()
    if (!content || !chatEndpoint || status === 'loading') return

    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setChatInput('')
    setStatus('loading')
    setError(null)

    try {
      const payload = await postJson<{
        data?: {
          chat?: {
            message?: ChatMessage
            status?: string
          }
        }
      }>(chatEndpoint, {
        visitor_session_id: sessionId ?? undefined,
        messages: nextMessages,
      })
      const reply = payload.data?.chat?.message
      if (reply) setMessages([...nextMessages, reply])
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed.')
      setStatus('idle')
    }
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!leadEndpoint || status === 'loading') return
    setStatus('loading')
    setError(null)
    try {
      await postJson(leadEndpoint, {
        visitor_session_id: sessionId ?? undefined,
        email: leadEmail || undefined,
        message: leadMessage || undefined,
      })
      setLeadEmail('')
      setLeadMessage('')
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lead submission failed.')
      setStatus('idle')
    }
  }

  async function submitFeedback(rating: 'up' | 'down') {
    if (!feedbackEndpoint || status === 'loading') return
    setStatus('loading')
    setError(null)
    try {
      await postJson(feedbackEndpoint, {
        visitor_session_id: sessionId ?? undefined,
        rating,
      })
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback failed.')
      setStatus('idle')
    }
  }

  return (
    <div className="flex min-h-[620px] flex-col rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{config.name}</h2>
            <p className="text-sm text-muted-foreground capitalize">{config.status.replace(/_/g, ' ')}</p>
          </div>
          {isPreview ? (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700">
              Preview
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {config.status !== 'active' ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800">
            This app is not accepting public requests yet.
          </div>
        ) : null}

        {canChat ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border">
            <div className="flex items-center gap-2 border-b p-3 text-sm font-medium">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              Chat
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-3">
              {messages.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setChatInput(starter)}
                  className="rounded-lg border p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50"
                >
                  {starter}
                </button>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-lg p-3 text-sm ${
                    message.role === 'user'
                      ? 'ml-8 bg-primary text-primary-foreground'
                      : 'mr-8 bg-muted text-foreground'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2 border-t p-3">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                disabled={config.status !== 'active' || status === 'loading'}
                placeholder="Ask a question"
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || config.status !== 'active' || status === 'loading'}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Send
              </button>
            </form>
          </div>
        ) : null}

        {canLead ? (
          <form onSubmit={submitLead} className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Follow up</p>
            <input
              value={leadEmail}
              onChange={(event) => setLeadEmail(event.target.value)}
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={leadMessage}
              onChange={(event) => setLeadMessage(event.target.value)}
              placeholder="What should the operator know?"
              rows={3}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={config.status !== 'active' || status === 'loading'}
              className="rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send follow-up
            </button>
          </form>
        ) : null}

        {canFeedback ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">Was this useful?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submitFeedback('up')}
                className="rounded-md border p-2"
                aria-label="Positive feedback"
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void submitFeedback('down')}
                className="rounded-md border p-2"
                aria-label="Negative feedback"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
