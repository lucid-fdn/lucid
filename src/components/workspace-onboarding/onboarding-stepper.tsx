'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface Step {
  id: string
  title: string
  description: string
  optional?: boolean
}

interface OnboardingStepperProps {
  steps: readonly Step[]
  currentStep: number
  className?: string
}

export function OnboardingStepper({ steps, currentStep, className }: OnboardingStepperProps) {
  const progress = ((currentStep - 1) / (steps.length - 1)) * 100
  
  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Clean progress bar like Notion */}
      <Progress value={progress} className="h-1" />
      
      {/* Step counter */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{steps[currentStep - 1]?.title}</span>
        <span>Step {currentStep} of {steps.length}</span>
      </div>
    </div>
  )
}
