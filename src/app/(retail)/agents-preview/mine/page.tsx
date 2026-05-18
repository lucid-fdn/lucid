import React from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getUserId } from '@/lib/auth/server-utils'
import { FEATURES } from '@/lib/features'
import { listRetailFleetForUser } from '@/lib/retail/ownership'
import { shouldShowPrivateRuntimeUpsell } from '@/lib/retail/upsell'

import { PrivateRuntimeUpsell } from '@/components/retail/fleet/private-runtime-upsell'
import { RetailFleetList } from '@/components/retail/fleet/retail-fleet-list'
import { Button } from '@/components/ui/button'

/**
 * Phase 5 — retail fleet page.
 *
 * Lets a returning retail user find their agents without bookmarking the
 * UUID chat URL. Mirrors the same guard stack as the created/chat pages:
 *
 *   1. Feature flag → 404 (never hint the funnel exists when disabled)
 *   2. Unauthenticated → /login (fleet is per-user, not public)
 *   3. No retail org → empty state with CTA back to the template gallery
 *
 * A missing retail org is intentionally NOT a 404 — it means the user
 * signed up but hasn't completed the wizard. Sending them to the gallery
 * is a better funnel outcome than blank 404.
 */
export default async function RetailFleetPage() {
  if (!FEATURES.retailFunnel) {
    notFound()
  }

  const userId = await getUserId()
  if (!userId) {
    redirect('/login')
  }

  const result = await listRetailFleetForUser(userId)
  const assistants = result.ok ? result.assistants : []
  const showUpsell = shouldShowPrivateRuntimeUpsell(assistants)

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Your agents
          </h1>
          <p className="text-sm text-muted-foreground">
            Everything you&apos;ve built so far. Tap one to chat.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="ghost">
            <Link href="/agents-preview/knowledge">Knowledge</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/agents-preview">New agent</Link>
          </Button>
        </div>
      </header>

      {showUpsell ? <PrivateRuntimeUpsell /> : null}

      <RetailFleetList assistants={assistants} />
    </main>
  )
}
