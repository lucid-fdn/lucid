import { z } from 'zod'

/**
 * Multi-Step Form Types
 * Reusable types for any multi-step form flow
 */

export interface MultiStepFormStep<TData = unknown> {
  id: string
  path: string
  title: string
  description: string
  schema: z.ZodSchema
  optional?: boolean
  component: React.ComponentType<StepComponentProps<TData>>
  /**
   * Conditional step - only shown if condition returns true
   * Receives current form data to make decision
   */
  showIf?: (data: Partial<TData>) => boolean
  /**
   * Mark this step as the final actionable step
   * When completed, triggers onComplete server action
   */
  isFinalStep?: boolean
}

export interface StepComponentProps<TData = unknown> {
  data: Partial<TData>
  onComplete: (data: Partial<TData>) => void
  onBack: () => void
  isLoading: boolean
  serverError?: {
    field?: string
    message: string
  } | null
  clearServerError?: () => void
}

export interface MultiStepWizardProps<TData = unknown> {
  steps: readonly MultiStepFormStep<TData>[]
  onComplete: (data: TData) => Promise<unknown> | unknown
  storageKey: string
  basePath?: string
  showProgress?: boolean
  allowBack?: boolean
  className?: string
}

export interface UseMultiStepFormOptions<TData = unknown> {
  steps: readonly MultiStepFormStep<TData>[]
  storageKey: string
  onComplete: (data: TData) => Promise<unknown> | unknown
}

export interface UseMultiStepFormReturn<TData = unknown> {
  currentStep: number
  formData: Partial<TData>
  isLoading: boolean
  isHydrated: boolean
  totalSteps: number
  goToStep: (step: number) => void
  handleStepComplete: (stepData: Partial<TData>) => Promise<void>
  handleBack: () => void
  handleComplete: () => void
  canGoBack: boolean
  canGoForward: boolean
  visibleSteps: MultiStepFormStep<TData>[]
  serverError: {
    field?: string
    message: string
  } | null
  clearServerError: () => void
}
