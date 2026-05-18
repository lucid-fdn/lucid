'use client'

import React, { useMemo, useState, type FormEvent } from 'react'
import { MessageSquareText, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

const categories = [
  { value: 'generation_quality', label: 'Generation Quality' },
  { value: 'runtime_api', label: 'Runtime API' },
  { value: 'v0_vercel_launch', label: 'v0/Vercel Launch' },
  { value: 'operator_cockpit', label: 'Operator Cockpit' },
  { value: 'docs', label: 'Docs' },
  { value: 'billing', label: 'Billing' },
  { value: 'other', label: 'Other' },
] as const

const sentiments = [
  { value: 'works', label: 'Works' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'love', label: 'Love' },
] as const

async function csrfToken() {
  const existing = getCSRFTokenFromCookie()
  if (existing) return existing
  await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => undefined)
  return getCSRFTokenFromCookie()
}

export function AppBetaFeedback({ appId }: { appId: string }) {
  const [category, setCategory] = useState<(typeof categories)[number]['value']>('generation_quality')
  const [sentiment, setSentiment] = useState<(typeof sentiments)[number]['value']>('works')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')

  const statusLabel = useMemo(() => {
    if (status === 'submitting') return 'Sending'
    if (status === 'sent') return 'Recorded'
    if (status === 'error') return 'Retry'
    return 'Send'
  }, [status])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || status === 'submitting') return

    setStatus('submitting')
    const csrf = await csrfToken()
    const response = await fetch(`/api/app-services/${appId}/feedback`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({
        category,
        sentiment,
        message: trimmed,
        source: 'operator_cockpit',
      }),
    })

    if (!response.ok) {
      setStatus('error')
      return
    }

    setMessage('')
    setStatus('sent')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
          <SelectTrigger aria-label="Feedback category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex h-9 overflow-hidden rounded-md border" role="group" aria-label="Feedback sentiment">
          {sentiments.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSentiment(item.value)}
              className={`min-w-20 px-3 text-sm font-medium transition-colors ${
                sentiment === item.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        value={message}
        onChange={(event) => {
          setMessage(event.target.value)
          if (status !== 'idle') setStatus('idle')
        }}
        maxLength={2000}
        rows={4}
        placeholder="What should we fix, keep, or double down on?"
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquareText className="h-4 w-4" />
          <span>{message.trim().length}/2000</span>
        </div>
        <Button type="submit" size="sm" disabled={!message.trim() || status === 'submitting'}>
          <SendHorizontal className="h-4 w-4" />
          {statusLabel}
        </Button>
      </div>
    </form>
  )
}
