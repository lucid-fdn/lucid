import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspaceBySlug } from '@/lib/workspace'
import { getWorkspaceCapabilities, getCapabilityNextAction } from '@/lib/workspace/capabilities'
import { FeatureStatePanel } from '@/components/feature-state-panel'
import { isFeatureEnabled } from '@/lib/features'
import { PenLine } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Content Studio',
}

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ 'workspace-slug': string }>
}

export default async function ContentStudioLayout({ children, params }: LayoutProps) {
  if (!isFeatureEnabled('contentStudio')) {
    redirect('/app')
  }

  const userId = await getUserId()
  if (!userId) redirect('/login')

  const { 'workspace-slug': slug } = await params
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace?.id) redirect('/app')

  const capabilities = await getWorkspaceCapabilities(userId, workspace.id)
  const nextAction = getCapabilityNextAction(capabilities, 'contentStudio')

  return (
    <FeatureStatePanel
      state={capabilities.contentStudioState}
      featureName="Content Studio"
      description="AI-powered content creation and publishing."
      nextAction={nextAction}
      icon={<PenLine className="h-8 w-8 text-muted-foreground" />}
    >
      {children}
    </FeatureStatePanel>
  )
}
