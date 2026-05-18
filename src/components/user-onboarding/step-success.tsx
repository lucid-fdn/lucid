'use client'

import { useMemo } from 'react'
import { type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { OnboardingSuccess, type SummaryItem } from '@/components/shared/onboarding-success'

interface StepSuccessProps {
  data: Partial<UserOnboardingData>
  onComplete: () => void
}

export function StepSuccess({ data, onComplete: _onComplete }: StepSuccessProps) {
  // Build summary items from user data
  const summaryItems = useMemo(() => {
    const items: SummaryItem[] = []

    // Profile created
    items.push({
      label: 'Profile Created',
      description: `@${data.handle} - Your Lucid identity is ready`,
    })

    // Social links
    const socialLinks = []
    if (data.github_username) socialLinks.push('GitHub')
    if (data.twitter_username) socialLinks.push('Twitter')
    if (data.linkedin_url) socialLinks.push('LinkedIn')
    
    if (socialLinks.length > 0) {
      items.push({
        label: 'Social Links Connected',
        description: `${socialLinks.join(', ')}`,
      })
    }

    // Interests
    if (data.interests && data.interests.length > 0) {
      items.push({
        label: 'Interests Added',
        badges: data.interests,
      })
    }

    // Workspace (if created during onboarding)
    if ((data as unknown as { workspace_name?: string }).workspace_name) {
      items.push({
        label: 'Workspace Created',
        description: `${(data as unknown as { workspace_name?: string }).workspace_name} is ready`,
      })
    }

    return items
  }, [data])

  // Determine redirect URL based on workspace preference
  const redirectUrl = useMemo(() => {
    if (data.work_preference === 'team' && (data as unknown as { workspace_slug?: string }).workspace_slug) {
      return `/${(data as unknown as { workspace_slug?: string }).workspace_slug}/dashboard`
    }
    return '/dashboard'
  }, [data])

  return (
    <OnboardingSuccess
      type="profile"
      title="🎉 Welcome to Lucid!"
      subtitle={`Your profile is complete, ${data.name}`}
      summaryItems={summaryItems}
      redirectUrl={redirectUrl}
      redirectLabel={data.work_preference === 'team' ? 'Go to Workspace' : 'Go to Dashboard'}
      tips={[
        'Use <kbd class="px-1.5 py-0.5 text-xs bg-muted rounded">Cmd+K</kbd> to quickly navigate',
        'Start your first project or workflow',
        'Explore the community and discover templates',
        'Connect with other builders on Discord',
      ]}
      showPlanInfo={false}
      autoRedirectSeconds={10}
    />
  )
}
