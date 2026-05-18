'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { z } from 'zod'
import type { UseMultiStepFormOptions, UseMultiStepFormReturn } from '@/types/multi-step'

/**
 * Reusable Multi-Step Form Hook
 * 
 * Handles:
 * - Step navigation
 * - Form data persistence (localStorage)
 * - URL-based routing
 * - Loading states
 * - Back/forward navigation
 * 
 * @example
 * const wizard = useMultiStepForm({
 *   steps: ONBOARDING_STEPS,
 *   storageKey: 'workspace-onboarding',
 *   onComplete: async (data) => await createWorkspace(data)
 * })
 */
export function useMultiStepForm<TData = unknown>(
  options: UseMultiStepFormOptions<TData>
): UseMultiStepFormReturn<TData> {
  const { steps, storageKey, onComplete } = options
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Track if we've hydrated (client-side only)
  const [isHydrated, setIsHydrated] = useState(false)
  
  // Form data state - persisted to localStorage
  // Start empty to match server render, load from localStorage after hydration
  const [formData, setFormData] = useState<Partial<TData>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<{ field?: string; message: string } | null>(null)
  
  // Load from localStorage after hydration to prevent mismatch
  useEffect(() => {
    setIsHydrated(true)
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        console.log(`[useMultiStepForm] Loaded saved data from '${storageKey}'`, parsed)
        setFormData(parsed)
      } catch (error) {
        console.error(`[useMultiStepForm] Failed to load saved progress:`, error)
      }
    }
  }, [storageKey])
  
  // Filter visible steps based on conditional logic
  const visibleSteps = steps.filter(step => {
    if (!step.showIf) return true // Always show if no condition
    return step.showIf(formData)
  })
  
  // Get current step from URL or default to 1
  const stepParam = searchParams?.get('step')
  let currentStep = stepParam ? parseInt(stepParam, 10) : 1
  
  // ✅ FIX: Correct invalid step numbers (moved to useEffect to avoid render error)
  useEffect(() => {
    if (isHydrated && currentStep > visibleSteps.length && visibleSteps.length > 0) {
      console.warn(`[useMultiStepForm] Step ${currentStep} is beyond visible steps (${visibleSteps.length}), resetting to last valid step`)
      const correctedStep = visibleSteps.length
      const currentPath = window.location.pathname
      router.replace(`${currentPath}?step=${correctedStep}`)
    }
  }, [isHydrated, currentStep, visibleSteps.length, router])
  
  // Save progress to localStorage whenever formData changes (but only after hydration)
  useEffect(() => {
    if (isHydrated && Object.keys(formData).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(formData))
      console.log(`[useMultiStepForm] Saved data to '${storageKey}'`, formData)
    }
  }, [formData, storageKey, isHydrated])
  
  // Navigate to a specific step
  const goToStep = useCallback((step: number) => {
    // Validate step number against visible steps
    if (step < 1 || step > visibleSteps.length) {
      console.warn(`[useMultiStepForm] Invalid step: ${step} (visible steps: ${visibleSteps.length})`)
      return
    }

    setServerError(null)
    const currentPath = window.location.pathname
    router.push(`${currentPath}?step=${step}`)
  }, [router, visibleSteps.length])

  const findStepIndexForField = useCallback((field: string): number | null => {
    for (let index = 0; index < visibleSteps.length; index += 1) {
      const schema = visibleSteps[index]?.schema
      if (!(schema instanceof z.ZodObject)) continue
      const shape = schema.shape
      if (field in shape) return index + 1
    }
    return null
  }, [visibleSteps])
  
  // Handle step completion
  const handleStepComplete = useCallback(async (stepData: Partial<TData>) => {
    const updatedData = { ...formData, ...stepData }
    setServerError(null)
    setFormData(updatedData)
    
    // Check if current step is marked as the final actionable step
    const currentStepConfig = visibleSteps[currentStep - 1]
    const isFinalActionableStep = currentStepConfig?.isFinalStep === true
    
    if (isFinalActionableStep) {
      // This is the last actionable step - call onComplete
      setIsLoading(true)
      
      console.log(`[useMultiStepForm] Final step (${currentStep}) completed, calling onComplete`)
      console.log(`[useMultiStepForm] Data being sent:`, updatedData)
      
      try {
        console.log(`[useMultiStepForm] Calling onComplete function...`)
        const result = await onComplete(updatedData as TData) as unknown
        console.log(`[useMultiStepForm] onComplete returned:`, result)

        // Check if server action returned an error
        const actionResult = result as Record<string, unknown> | undefined
        if (actionResult && typeof actionResult === 'object' && 'success' in actionResult && !actionResult.success) {
          const errorMsg = String(actionResult.error || 'An error occurred')
          const errorField = typeof actionResult.field === 'string' ? actionResult.field : undefined
          console.error(`[useMultiStepForm] Server action failed:`, errorMsg)
          setServerError({ field: errorField, message: errorMsg })

          if (errorField) {
            const targetStep = findStepIndexForField(errorField)
            if (targetStep && targetStep !== currentStep) {
              setIsLoading(false)
              goToStep(targetStep)
              return
            }
          }

          // Try to parse Zod validation errors
          try {
            const errors = JSON.parse(errorMsg)
            if (Array.isArray(errors) && errors.length > 0) {
              const firstError = errors[0]
              const field = firstError.path?.join('.') || 'unknown field'
              const message = firstError.message || 'Validation failed'
              toast.error(`${field}: ${message}`)
              console.error(`[useMultiStepForm] Validation error on field "${field}":`, message)
            } else {
              toast.error(errorMsg)
            }
          } catch {
            toast.error(errorMsg)
          }
          
          setIsLoading(false)
          return
        }
        
        // ✅ Success
        console.log(`[useMultiStepForm] Success! Result:`, actionResult)

        // Clear localStorage after success
        localStorage.removeItem(storageKey)

        // If server returned a redirect URL, navigate and refresh server data
        if (actionResult && typeof actionResult === 'object' && 'redirectTo' in actionResult && typeof actionResult.redirectTo === 'string') {
          console.log(`[useMultiStepForm] Redirecting to:`, actionResult.redirectTo)
          router.push(actionResult.redirectTo)
          router.refresh() // Re-fetches server components (profile, workspace, sidebar)
          return
        }

        setIsLoading(false)

        // Advance to next step
        if (currentStep < visibleSteps.length) {
          goToStep(currentStep + 1)
        }
      } catch (error: unknown) {
        console.error(`[useMultiStepForm] Exception in onComplete:`, error)
        // Check if this is a Next.js redirect (not an actual error)
        const err = error as Record<string, string | undefined>
        if (err?.message === 'NEXT_REDIRECT' || err?.digest?.startsWith('NEXT_REDIRECT')) {
          console.log(`[useMultiStepForm] ✅ Redirect triggered (success)`)
          // ✅ Clear localStorage immediately since redirect = success
          // Do this synchronously before redirect happens
          try {
            localStorage.removeItem(storageKey)
            console.log(`[useMultiStepForm] ✅ Cleared localStorage: ${storageKey}`)
          } catch (e) {
            console.warn(`[useMultiStepForm] Failed to clear localStorage:`, e)
          }
          return
        }
        
        console.error(`[useMultiStepForm] Error in onComplete:`, error)
        toast.error(err?.message || 'An error occurred')
        setIsLoading(false)
      }
      return
    }
    
    // For all other steps, just auto-advance
    if (currentStep < visibleSteps.length) {
      goToStep(currentStep + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- storageKey and visibleSteps are static
  }, [formData, currentStep, visibleSteps, onComplete, goToStep, findStepIndexForField])

  // Handle going back
  const handleBack = useCallback(() => {
    setServerError(null)
    if (currentStep > 1) {
      goToStep(currentStep - 1)
    }
  }, [currentStep, goToStep])
  
  // Clear form data after completion
  const handleComplete = useCallback(() => {
    console.log(`[useMultiStepForm] Clearing storage key: ${storageKey}`)
    localStorage.removeItem(storageKey)
    setFormData({})
  }, [storageKey])
  
  return {
    currentStep,
    formData,
    isLoading,
    isHydrated, // Expose hydration state for SSR safety
    totalSteps: visibleSteps.length,
    goToStep,
    handleStepComplete,
    handleBack,
    handleComplete,
    canGoBack: currentStep > 1,
    canGoForward: currentStep < visibleSteps.length,
    visibleSteps, // Expose for use in MultiStepWizard
    serverError,
    clearServerError: () => setServerError(null),
  }
}
