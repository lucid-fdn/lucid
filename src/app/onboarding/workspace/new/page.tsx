import { WorkspaceOnboardingClient } from '@/components/workspace-onboarding/workspace-onboarding-client'
import { getUserId } from '@/lib/auth/server-utils'
import { getUserWorkspaces } from '@/lib/workspace'
import { redirect } from 'next/navigation'

export default async function WorkspaceCreationPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>
}) {
  const { create } = await searchParams
  const isExplicitCreate = create === '1' || create === 'true'
  const userId = await getUserId()

  if (userId && !isExplicitCreate) {
    let redirectSlug: string | null = null
    try {
      const workspaces = await getUserWorkspaces(userId)
      const firstWorkspace = workspaces[0]
      if (firstWorkspace?.slug) {
        redirectSlug = firstWorkspace.slug
      }
    } catch (error) {
      console.warn('[workspace-onboarding] Workspace lookup failed; rendering workspace creation fallback', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    if (redirectSlug) redirect(`/${redirectSlug}/dashboard`)
  }

  return <WorkspaceOnboardingClient />
}
