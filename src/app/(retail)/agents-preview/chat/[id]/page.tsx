import React from 'react'
import { notFound, redirect } from 'next/navigation'

import { getUserId } from '@/lib/auth/server-utils'
import { FEATURES } from '@/lib/features'
import { resolveRetailAssistantForUser } from '@/lib/retail/ownership'

import { RetailChatShell } from '@/components/retail/chat/retail-chat-shell'

interface ChatPageProps {
  params: Promise<{ id: string }>
}

/**
 * Phase 5 — retail chat page.
 *
 * The first place a retail user can actually talk to their agent. Sits
 * one click away from the activation tutorial and uses the exact same
 * `/api/assistants/[id]/chat` backend Studio uses — the agent loop,
 * tools, memory, and streaming are identical. What's stripped is the
 * Studio chrome (sidebar, workspace context, plan toggles, BYOK, model
 * selector, run inspector).
 *
 * Authorization mirrors the created page: UUID guard → auth → ownership
 * check via the retail personal org. Every failure returns 404 so a
 * leaked or guessed id never reveals another user's agent.
 */
export default async function RetailChatPage({ params }: ChatPageProps) {
  if (!FEATURES.retailFunnel) {
    notFound()
  }

  const { id } = await params

  const userId = await getUserId()
  if (!userId) {
    redirect('/login')
  }

  const resolved = await resolveRetailAssistantForUser(userId, id)
  if (!resolved.ok) {
    notFound()
  }

  return (
    <RetailChatShell
      assistant={{
        id: resolved.assistant.id,
        name: resolved.assistant.name,
        lucidModel: resolved.assistant.lucid_model,
      }}
      orgId={resolved.orgId}
    />
  )
}
