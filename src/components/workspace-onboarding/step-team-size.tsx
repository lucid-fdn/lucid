'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { teamSizeSchema, type TeamSizeData, type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { User, Users, Building2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StepTeamSizeProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: (data: Partial<WorkspaceOnboardingData>) => void
  onBack: () => void
  isLoading: boolean
}

const teamSizes = [
  {
    value: 'solo' as const,
    label: 'Solo',
    description: 'Just me',
    icon: User,
  },
  {
    value: 'small_team' as const,
    label: 'Small Team',
    description: '2-10 people',
    icon: Users,
  },
  {
    value: 'medium_team' as const,
    label: 'Medium Team',
    description: '11-50 people',
    icon: Building2,
  },
  {
    value: 'enterprise' as const,
    label: 'Enterprise',
    description: '50+ people',
    icon: Globe,
  },
]

export function StepTeamSize({ data, onComplete, onBack, isLoading }: StepTeamSizeProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TeamSizeData>({
    resolver: zodResolver(teamSizeSchema),
    defaultValues: {
      team_size: data.team_size,
    },
  })

  const selectedSize = watch('team_size')

  const onSubmit = (formData: TeamSizeData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          How big is your crew?
        </h1>
        <p className="text-muted-foreground text-lg">
          Helps us set the right defaults for your workspace
        </p>
      </div>

      {/* Team Size Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {teamSizes.map((size) => {
          const Icon = size.icon
          const isSelected = selectedSize === size.value

          return (
            <Card
              key={size.value}
              className={cn(
                'cursor-pointer transition-colors hover:border-muted-foreground/25',
                isSelected && 'border-primary bg-primary/5'
              )}
              onClick={() => setValue('team_size', size.value, { shouldValidate: true })}
            >
              <CardContent className="p-5 space-y-3">
                <Icon className={cn(
                  'h-5 w-5',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div>
                  <h3 className="text-sm font-medium">{size.label}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {size.description}
                  </p>
                </div>
                <input
                  type="radio"
                  {...register('team_size')}
                  value={size.value}
                  className="sr-only"
                />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Error Message */}
      {errors.team_size && (
        <p className="text-sm text-destructive text-center">
          {errors.team_size.message}
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
          disabled={!selectedSize || isLoading}
          className="min-w-[200px]"
        >
          Continue
        </Button>
      </div>
    </form>
  )
}
