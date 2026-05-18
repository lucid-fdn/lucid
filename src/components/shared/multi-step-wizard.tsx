'use client'

import { Suspense, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useMultiStepForm } from '@/hooks/use-multi-step-form'
import { OnboardingStepper } from '@/components/workspace-onboarding/onboarding-stepper'
import { LoadingScreen } from '@/components/shared/loading-screen'
import type { MultiStepWizardProps } from '@/types/multi-step'

/**
 * Reusable Multi-Step Wizard Component
 * 
 * A generic component for any multi-step form flow. Handles:
 * - Step rendering
 * - Navigation
 * - Progress indicator
 * - State management
 * - Data persistence
 * 
 * @example
 * // Workspace Onboarding
 * <MultiStepWizard
 *   steps={WORKSPACE_ONBOARDING_STEPS}
 *   onComplete={createWorkspaceAction}
 *   storageKey="workspace-onboarding"
 * />
 * 
 * @example
 * // User Profile Onboarding
 * <MultiStepWizard
 *   steps={USER_ONBOARDING_STEPS}
 *   onComplete={completeUserOnboarding}
 *   storageKey="user-onboarding"
 *   showProgress={false}
 * />
 */
export function MultiStepWizard<TData = unknown>({
  steps,
  onComplete,
  storageKey,
  showProgress = true,
  allowBack = true,
  className = '',
}: MultiStepWizardProps<TData>) {
  const {
    currentStep,
    formData,
    isLoading,
    isHydrated,
    handleStepComplete,
    handleBack,
    handleComplete: _handleComplete,
    visibleSteps,
    serverError,
    clearServerError,
  } = useMultiStepForm<TData>({
    steps,
    storageKey,
    onComplete,
  })

  // Track direction for slide transitions (must be before early returns)
  const prevStepRef = useRef(currentStep)
  const direction = currentStep >= prevStepRef.current ? 1 : -1
  prevStepRef.current = currentStep

  // Show loading until client-side hydration completes
  if (!isHydrated) {
    return <LoadingScreen />
  }

  // Get current step configuration from visible steps (after conditional filtering)
  const currentStepConfig = visibleSteps[currentStep - 1]

  if (!currentStepConfig) {
    console.error(`[MultiStepWizard] Invalid step: ${currentStep}`, {
      currentStep,
      visibleStepsLength: visibleSteps.length,
      totalSteps: steps.length
    })
    return null
  }

  // Get the step component
  const StepComponent = currentStepConfig.component

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Progress Indicator */}
      {showProgress && (
        <OnboardingStepper
          steps={visibleSteps}
          currentStep={currentStep}
          className="mb-12"
        />
      )}

      {/* Current Step Content */}
      <Suspense fallback={<div className="text-center">Loading step...</div>}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <StepComponent
              data={formData}
              onComplete={handleStepComplete}
              onBack={allowBack ? handleBack : () => {}}
              isLoading={isLoading}
              serverError={serverError}
              clearServerError={clearServerError}
            />
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </div>
  )
}
