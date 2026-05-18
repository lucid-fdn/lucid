'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { RetailTemplate } from '@/lib/retail'

const CHANNEL_LABEL: Record<RetailTemplate['defaultChannel'], string> = {
  telegram: 'Telegram',
  web: 'Web widget',
  slack: 'Slack',
  discord: 'Discord',
}

interface ActivationTutorialProps {
  /** The freshly-created agent. */
  assistant: {
    id: string
    name: string
  }
  /**
   * The template the user picked, if we could resolve it from `?from=<slug>`.
   * May be `null` — the page falls back to a generic tutorial in that case
   * (e.g. user bookmarks/reshares the URL without the query param).
   */
  template: RetailTemplate | null
}

/**
 * Phase 4 — post-create activation tutorial.
 *
 * Goal: the user sees "your agent is live" within 3 seconds of Create, and
 * has a copy-pasteable first message to test it with. No Studio handoff —
 * retail is intentionally isolated, and Phase 5 will bridge into the real
 * chat surface.
 */
export function ActivationTutorial({ assistant, template }: ActivationTutorialProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  async function copyPrompt(prompt: string, idx: number) {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((curr) => (curr === idx ? null : curr)), 1500)
    } catch {
      // Clipboard can fail silently in some browsers / permission setups.
      // Surfacing a toast would require pulling in the toast stack, which
      // is out of scope for the minimal retail surface. The prompt is
      // still visible on screen for manual copy.
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Badge variant="secondary" className="uppercase tracking-wide">
          Live
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {assistant.name} is ready.
        </h1>
        <p className="text-base text-muted-foreground">
          Your agent is running. Here&apos;s how to send it a first message.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Try it out</CardTitle>
          <CardDescription>
            {template
              ? 'Copy one of these prompts and paste it into your chosen channel.'
              : 'Send any message to your agent — it will reply in seconds.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {template ? (
            <ul className="space-y-3">
              {template.samplePrompts.map((prompt, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">{prompt}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copyPrompt(prompt, idx)}
                    aria-label={`Copy prompt ${idx + 1}`}
                  >
                    {copiedIdx === idx ? 'Copied' : 'Copy'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open your agent in the dashboard to send a message.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Give it a personality</CardTitle>
          <CardDescription>
            Pick a vibe — friendly, professional, witty, expert, or concise.
            You can always change it later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href={`/agents-preview/personality/${assistant.id}`}>
              Customize personality
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Next: connect a channel</CardTitle>
          <CardDescription>
            {template
              ? `We suggested ${CHANNEL_LABEL[template.defaultChannel]} — you can change it any time.`
              : 'Pick where your users should talk to this agent: Telegram, web widget, Slack, or Discord.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Channel connection lives in the dashboard. Every channel is a
            webhook + a bot token — we walk you through it there.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <Button asChild variant="outline">
          <Link href="/agents-preview">Back to templates</Link>
        </Button>
        <Button asChild>
          <Link href={`/agents-preview/chat/${assistant.id}`}>
            Chat with {assistant.name}
          </Link>
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Agent ID: <code className="font-mono">{assistant.id}</code>
      </p>
    </div>
  )
}
