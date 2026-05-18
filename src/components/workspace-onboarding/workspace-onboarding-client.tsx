'use client'

import { MultiStepWizard } from '@/components/shared/multi-step-wizard'
import { ONBOARDING_STEPS } from '@/lib/forms/workspace-onboarding-schemas'
import { createWorkspaceOnboardingAction } from '@/lib/forms/actions'

export function WorkspaceOnboardingClient() {
  // DON'T clear localStorage on mount - users should be able to resume progress
  // localStorage is cleared AFTER successful workspace creation in the hook
  
  return (
    <div className="container max-w-2xl mx-auto py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Create Your Workspace</h1>
        <p className="text-muted-foreground">
          Set up your workspace to collaborate with your team
        </p>
      </div>
      
      <MultiStepWizard
        steps={ONBOARDING_STEPS}
        onComplete={createWorkspaceOnboardingAction}
        storageKey="workspace-onboarding"
        showProgress={true}
        allowBack={true}
      />
    </div>
  )
}
