import { ExploreCategory } from '@/components/explore'
import {
  CURATED_AGENTS,
  SECTION_METADATA,
} from '@/lib/marketplace/curated-content'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Marketing Agents Page — Public (no auth required)
 */
export default async function MarketingAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  return (
    <ExploreCategory
      isAuthenticated={false}
      basePath="/explore-v2"
      params={params}
      title="Agents"
      subtitle="Pre-built AI agents for customer support, coding, research & more"
      kind="AGENT"
      sections={[
        {
          title: SECTION_METADATA.featuredAgents?.title ?? 'Featured Agents',
          description: SECTION_METADATA.featuredAgents?.description ?? 'Top-rated AI agents',
          assets: CURATED_AGENTS ?? [],
          viewAllHref: SECTION_METADATA.featuredAgents?.viewAllHref,
        },
      ]}
    />
  )
}