'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { purposeSchema, type PurposeData, type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Bot, Database, TrendingUp, BarChart3, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepPurposeProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: (data: Partial<WorkspaceOnboardingData>) => void
  onBack: () => void
  isLoading: boolean
}

const purposes = [
  {
    value: 'ai_development' as const,
    label: 'AI Development',
    description: 'Build and deploy AI agents and models',
    icon: Bot,
  },
  {
    value: 'blockchain' as const,
    label: 'Blockchain',
    description: 'Smart contracts and Web3 applications',
    icon: Database,
  },
  {
    value: 'defi' as const,
    label: 'DeFi',
    description: 'Decentralized finance and trading',
    icon: TrendingUp,
  },
  {
    value: 'data_analytics' as const,
    label: 'Data Analytics',
    description: 'Data pipelines and insights',
    icon: BarChart3,
  },
  {
    value: 'general' as const,
    label: 'General Purpose',
    description: 'Multi-purpose development workspace',
    icon: Layers,
  },
]

export function StepPurpose({ data, onComplete, onBack, isLoading }: StepPurposeProps) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PurposeData>({
    resolver: zodResolver(purposeSchema),
    defaultValues: {
      purpose: Array.isArray(data.purpose) ? data.purpose : (data.purpose ? [data.purpose] : []),
    },
  })

  const selectedPurposes = watch('purpose') || []

  const onSubmit = (formData: PurposeData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          What will your agents work on?
        </h1>
        <p className="text-muted-foreground text-lg">
          Select all that apply — we'll tailor their skills
        </p>
      </div>

      {/* Purpose Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {purposes.map((purpose) => {
          const Icon = purpose.icon
          const isSelected = selectedPurposes.includes(purpose.value)

          const togglePurpose = () => {
            const newPurposes = isSelected
              ? selectedPurposes.filter(p => p !== purpose.value)
              : [...selectedPurposes, purpose.value]
            setValue('purpose', newPurposes, { shouldValidate: true })
          }

          return (
            <Card
              key={purpose.value}
              className={cn(
                'cursor-pointer transition-colors hover:border-muted-foreground/25',
                isSelected && 'border-primary bg-primary/5'
              )}
              onClick={togglePurpose}
            >
              <CardContent className="p-5 space-y-3">
                <Icon className={cn(
                  'h-5 w-5',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div>
                  <h3 className="text-sm font-medium">{purpose.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {purpose.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Error Message */}
      {errors.purpose && (
        <p className="text-sm text-destructive text-center">
          {errors.purpose.message}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={isLoading}
        >
          Back
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={selectedPurposes.length === 0 || isLoading}
          className="min-w-[200px]"
        >
          Continue
        </Button>
      </div>
    </form>
  )
}
