'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCasesSchema, type UseCasesData, type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Bot, FileCode, Database, Plug, Activity, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepUseCasesProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: (data: Partial<WorkspaceOnboardingData>) => void
  onBack: () => void
  isLoading: boolean
}

const useCases = [
  {
    value: 'agent_development' as const,
    label: 'Agent Development',
    description: 'Build and deploy AI agents',
    icon: Bot,
  },
  {
    value: 'smart_contracts' as const,
    label: 'Smart Contracts',
    description: 'Blockchain development',
    icon: FileCode,
  },
  {
    value: 'data_pipelines' as const,
    label: 'Data Pipelines',
    description: 'ETL and data processing',
    icon: Database,
  },
  {
    value: 'api_integration' as const,
    label: 'API Integration',
    description: 'Connect external services',
    icon: Plug,
  },
  {
    value: 'monitoring' as const,
    label: 'Monitoring',
    description: 'System observability',
    icon: Activity,
  },
  {
    value: 'collaboration' as const,
    label: 'Team Collaboration',
    description: 'Work together efficiently',
    icon: Users,
  },
]

export function StepUseCases({ data, onComplete, onBack }: StepUseCasesProps) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UseCasesData>({
    resolver: zodResolver(useCasesSchema),
    defaultValues: {
      use_cases: data.use_cases || [],
    },
  })

  const selectedUseCases = watch('use_cases') || []

  const toggleUseCase = (value: string) => {
    const current = selectedUseCases.includes(value as UseCasesData['use_cases'][number])
    if (current) {
      setValue('use_cases', selectedUseCases.filter(v => v !== value) as UseCasesData['use_cases'], { shouldValidate: true })
    } else {
      setValue('use_cases', [...selectedUseCases, value] as UseCasesData['use_cases'], { shouldValidate: true })
    }
  }

  const onSubmit = (formData: UseCasesData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          What will you build?
        </h1>
        <p className="text-muted-foreground text-lg">
          Select all that apply
        </p>
      </div>

      {/* Use Case Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {useCases.map((useCase) => {
          const Icon = useCase.icon
          const isSelected = selectedUseCases.includes(useCase.value)

          return (
            <Card
              key={useCase.value}
              className={cn(
                'cursor-pointer transition-colors hover:border-muted-foreground/25',
                isSelected && 'border-primary bg-primary/5'
              )}
              onClick={() => toggleUseCase(useCase.value)}
            >
              <CardContent className="p-5 space-y-3">
                <Icon className={cn(
                  'h-5 w-5',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div>
                  <h3 className="text-sm font-medium">{useCase.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {useCase.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Error Message */}
      {errors.use_cases && (
        <p className="text-sm text-destructive text-center">
          {errors.use_cases.message}
        </p>
      )}

      {/* Selected Count */}
      <div className="text-center text-sm text-muted-foreground">
        {selectedUseCases.length} selected
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={selectedUseCases.length === 0}
          className="min-w-[200px]"
        >
          Continue
        </Button>
      </div>
    </form>
  )
}
