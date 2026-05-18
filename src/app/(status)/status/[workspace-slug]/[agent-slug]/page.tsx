/**
 * Public Status Page
 * Pattern: /status/[workspace-slug]/[agent-slug]
 *
 * No auth required. Shows uptime, current status, and incident timeline.
 */

import { supabase } from '@/lib/db/client'
import { StatusPageClient } from './status-page-client'

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; 'agent-slug': string }>
}) {
  const { 'workspace-slug': orgSlug, 'agent-slug': agentSlug } = await params
  const publicSlug = `${orgSlug}/${agentSlug}`

  const { data } = await supabase.rpc('mc_public_status', {
    p_public_slug: publicSlug,
  })

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Status page not found</p>
      </div>
    )
  }

  return <StatusPageClient data={data} />
}
