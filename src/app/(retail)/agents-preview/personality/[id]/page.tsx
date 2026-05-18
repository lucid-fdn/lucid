import React from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ArrowLeft } from 'lucide-react'

import { getUserId } from '@/lib/auth/server-utils'
import { FEATURES } from '@/lib/features'
import { resolveRetailAssistantForUser } from '@/lib/retail/ownership'

import { PersonalityEditor } from '@/components/retail/personality/personality-editor'
import { Button } from '@/components/ui/button'

interface PersonalityPageProps {
  params: Promise<{ id: string }>
}

/**
 * Phase 6 — retail personality editor page.
 *
 * Auth + ownership mirror the created/chat pages. We deliberately pass
 * `initialContent={null}` instead of threading the stored `soul_content`
 * through — the shared `getAssistant` DB helper does not currently return
 * that column, and widening its SELECT list is out of retail scope. The
 * editor starts blank on each visit; presets fill the textbox after
 * applying, and free-text saves reflect the stored value in the response.
 * When there's product signal for "I want to see my current personality
 * text when I open the page", we'll add a retail-scoped DB helper for it.
 */
export default async function RetailPersonalityPage({
  params,
}: PersonalityPageProps) {
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
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
          <Link href={`/agents-preview/chat/${resolved.assistant.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </Link>
        </Button>
      </div>

      <PersonalityEditor
        assistant={{
          id: resolved.assistant.id,
          name: resolved.assistant.name,
        }}
        initialContent={null}
      />
    </main>
  )
}
