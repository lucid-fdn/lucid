import React from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ArrowLeft } from 'lucide-react'

import { getBoardMemories, findUserOrgByMetadataFlag } from '@/lib/db'
import { getUserId } from '@/lib/auth/server-utils'
import { FEATURES } from '@/lib/features'
import { RETAIL_ORG_FLAG } from '@/lib/retail/constants'

import { KnowledgeEditor } from '@/components/retail/knowledge/knowledge-editor'
import { Button } from '@/components/ui/button'

/**
 * Phase 6 — retail knowledge (board memory) page.
 *
 * Calls the existing org board-memory layer directly:
 *   - SSR fetches the first 100 entries via `getBoardMemories`
 *   - Client component POSTs/DELETEs against the shared
 *     `/api/orgs/[id]/board-memory` endpoint with CSRF
 *
 * Retail users own their personal org as the `owner` role (set by
 * `createOrganization` when `ensureRetailOrg` provisions it), so they
 * pass the shared endpoint's admin/owner gate without any retail-specific
 * wrapper.
 *
 * No retail org → empty fleet pattern: render the editor with zero
 * entries against a placeholder org id is misleading, so we send the
 * user back to the templates page instead. Half-funneled signups should
 * land on the gallery, not on a knowledge editor for an org that doesn't
 * exist.
 */
export default async function RetailKnowledgePage() {
  if (!FEATURES.retailFunnel) {
    notFound()
  }

  const userId = await getUserId()
  if (!userId) {
    redirect('/login')
  }

  const orgId = await findUserOrgByMetadataFlag(userId, RETAIL_ORG_FLAG)
  if (!orgId) {
    redirect('/agents-preview')
  }

  const memories = await getBoardMemories(orgId, { limit: 100 })

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
          <Link href="/agents-preview/mine">
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </Link>
        </Button>
      </div>

      <KnowledgeEditor
        orgId={orgId}
        initialEntries={memories.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.created_at,
        }))}
      />
    </main>
  )
}
