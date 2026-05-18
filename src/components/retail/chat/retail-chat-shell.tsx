'use client'

import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'

import { AgentTestChat } from '@/components/ai-chat/agent-test-chat'
import { Button } from '@/components/ui/button'

interface RetailChatShellProps {
  assistant: {
    id: string
    name: string
    lucidModel?: string
  }
  /**
   * The user's retail personal org. Passed through to `AgentTestChat`
   * so entitlement checks + Realtime scoping work the same way they do
   * in Studio. Retail users always have an org (auto-provisioned by
   * `ensureRetailOrg`), so this is never undefined in practice.
   */
  orgId: string
}

/**
 * Phase 5 — retail chat surface.
 *
 * Minimal chat shell for retail users. Reuses `AgentTestChat` (the same
 * component Studio uses on the assistant detail page) because the backend
 * is identical — `/api/assistants/[id]/chat` proxies to the worker's
 * streaming endpoint and runs the full agent loop with tools + memory.
 *
 * What's different from Studio: no sidebar, no workspace context, no
 * model selector, no BYOK toggle, no run inspector. Just a back link
 * and the chat itself. The retail funnel exists to prove "your agent
 * is live" in under 3 seconds — every extra chrome element costs us
 * first-message conversion.
 */
export function RetailChatShell({ assistant, orgId }: RetailChatShellProps) {
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href={`/agents-preview/created/${assistant.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="h-6 w-px bg-border" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {assistant.name}
            </div>
            <div className="text-xs text-muted-foreground">Live</div>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href={`/agents-preview/personality/${assistant.id}`}>
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Personality</span>
          </Link>
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <AgentTestChat
          assistantId={assistant.id}
          assistantName={assistant.name}
          lucidModel={assistant.lucidModel}
          orgId={orgId}
        />
      </div>
    </div>
  )
}
