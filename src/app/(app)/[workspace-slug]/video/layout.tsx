import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspaceBySlug } from '@/lib/workspace'
import { getWorkspaceCapabilities, getCapabilityNextAction } from '@/lib/workspace/capabilities'
import { FeatureStatePanel } from '@/components/feature-state-panel'
import { isFeatureEnabled } from '@/lib/features'
import { Film } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Video Studio',
}

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ 'workspace-slug': string }>
}

export default async function VideoLayout({ children, params }: LayoutProps) {
  // Kill-switch check
  if (!isFeatureEnabled('videoStudio')) {
    redirect('/app')
  }

  const userId = await getUserId()
  if (!userId) redirect('/login')

  const { 'workspace-slug': slug } = await params
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace?.id) redirect('/app')

  const capabilities = await getWorkspaceCapabilities(userId, workspace.id)
  const nextAction = getCapabilityNextAction(capabilities, 'videoStudio')

  return (
    <FeatureStatePanel
      state={capabilities.videoStudioState}
      featureName="Video Studio"
      description="AI-powered video generation."
      nextAction={nextAction}
      icon={<Film className="h-8 w-8 text-muted-foreground" />}
    >
      {children}
    </FeatureStatePanel>
  )
}
