'use client'

import { useMemo } from 'react'
import { type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { OnboardingSuccess, type SummaryItem } from '@/components/shared/onboarding-success'

interface StepSuccessProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: () => void
}

export function StepSuccess({ data, onComplete: _onComplete }: StepSuccessProps) {
  // Build summary items from workspace data
  const summaryItems = useMemo(() => {
    const items: SummaryItem[] = []

    // Workspace created
    items.push({
      label: 'Workspace Created',
      description: `${data.name} is ready at lucid.app/${data.slug}`,
    })

    // Purpose
    if (data.purpose && Array.isArray(data.purpose) && data.purpose.length > 0) {
      items.push({
        label: 'Purpose Configured',
        badges: data.purpose.map(p => p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
      })
    }

    // Team size
    if (data.team_size) {
      items.push({
        label: 'Team Size',
        description: data.team_size.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      })
    }

    // Invites
    if (data.invites && data.invites.length > 0) {
      items.push({
        label: 'Team Invites Sent',
        description: `${data.invites.length} ${data.invites.length === 1 ? 'teammate' : 'teammates'} invited`,
      })
    }

    return items
  }, [data])

  const workspaceSlug = data.slug || (data as unknown as Record<string, unknown>).workspace_slug || 'my-workspace'

  return (
    <OnboardingSuccess
      type="workspace"
      title="🎉 Your workspace is ready!"
      subtitle={`Welcome to ${data.name}`}
      summaryItems={summaryItems}
      redirectUrl={`/${workspaceSlug}/dashboard`}
      redirectLabel="Go to Workspace"
      tips={[
        'Use <kbd class="px-1.5 py-0.5 text-xs bg-muted rounded">Cmd+K</kbd> to quickly navigate',
        'Create your first AI agent or blockchain project',
        'Invite more teammates from workspace settings',
      ]}
      showPlanInfo={true}
      autoRedirectSeconds={10}
    />
  )
}
