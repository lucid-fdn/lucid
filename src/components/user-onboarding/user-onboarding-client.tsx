'use client'

import { MultiStepWizard } from '@/components/shared/multi-step-wizard'
import { USER_ONBOARDING_STEPS, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { completeOnboardingAction } from '@/lib/forms/actions'

/**
 * Client-side wrapper for User Onboarding MultiStepWizard
 * Required because Zod schemas cannot be passed from Server Components
 */
export function UserOnboardingClient() {
  return (
    <MultiStepWizard<UserOnboardingData>
      steps={USER_ONBOARDING_STEPS}
      onComplete={completeOnboardingAction}
      storageKey="lucid_user_onboarding"
      showProgress={false}
      allowBack={true}
    />
  )
}
