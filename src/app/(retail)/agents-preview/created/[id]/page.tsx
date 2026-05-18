import React from 'react'
import { notFound, redirect } from 'next/navigation'

import { getUserId } from '@/lib/auth/server-utils'
import { FEATURES } from '@/lib/features'
import { getTemplateBySlug } from '@/lib/retail'
import { resolveRetailAssistantForUser } from '@/lib/retail/ownership'

import { ActivationTutorial } from '@/components/retail/created/activation-tutorial'

interface CreatedPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}

/**
 * Phase 4 — activation tutorial page.
 *
 * Shown immediately after the wizard creates an agent. Renders the sample
 * prompts from the template so the user has something concrete to paste.
 *
 * Authorization: the route id is a UUID we just handed the user back from
 * `POST /api/retail/agents`, but we still verify (a) the assistant exists,
 * (b) the current user owns the retail personal org that owns the
 * assistant. A leaked/guessed UUID never reveals another user's agent.
 */
export default async function RetailCreatedPage({
  params,
  searchParams,
}: CreatedPageProps) {
  if (!FEATURES.retailFunnel) {
    notFound()
  }

  const { id } = await params
  const { from } = await searchParams

  const userId = await getUserId()
  if (!userId) {
    redirect('/login')
  }

  const resolved = await resolveRetailAssistantForUser(userId, id)
  if (!resolved.ok) {
    notFound()
  }

  // Template is a nice-to-have — the tutorial renders a generic fallback
  // when the slug is missing or unknown (bookmark, reshare, etc.).
  const template = from ? getTemplateBySlug(from) ?? null : null

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <ActivationTutorial
        assistant={{
          id: resolved.assistant.id,
          name: resolved.assistant.name,
        }}
        template={template}
      />
    </main>
  )
}
