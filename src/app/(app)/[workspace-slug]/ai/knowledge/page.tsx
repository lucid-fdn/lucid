import { redirect } from 'next/navigation'

interface KnowledgePageProps {
  params: Promise<{ 'workspace-slug': string }>
}

/**
 * Compatibility-only RAG document route.
 *
 * Keep this as a redirect for old links, bookmarks, and release-window docs.
 * Do not add UI here. The primary self-serve surface is:
 *   /[workspace-slug]/knowledge?tab=knowledge&section=documents
 */
export default async function KnowledgeBasePage({ params }: KnowledgePageProps) {
  const { 'workspace-slug': workspaceSlug } = await params
  redirect(`/${workspaceSlug}/knowledge?tab=knowledge&section=documents`)
}

export const metadata = {
  title: 'Knowledge | Lucid',
  description: 'Create, govern, and test the knowledge your agents use.',
}
