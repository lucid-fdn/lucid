'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { workPreferenceSchema, type WorkPreferenceData, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepComponentProps } from '@/types/multi-step'

export function StepWorkPreference({ data, onComplete, onBack, isLoading }: StepComponentProps<UserOnboardingData>) {
  const {
    watch,
    setValue,
    reset,
  } = useForm<WorkPreferenceData>({
    resolver: zodResolver(workPreferenceSchema),
    defaultValues: {
      work_preference: data.work_preference,
    },
  })

  // Update form when data changes (e.g., after localStorage loads)
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      reset({
        work_preference: data.work_preference,
      })
    }
  }, [data, reset])

  const selectedPreference = watch('work_preference')

  const handleSelect = (value: 'solo' | 'team') => {
    setValue('work_preference', value, { shouldValidate: true })
    onComplete({ work_preference: value })
  }

  const preferences = [
    {
      value: 'solo' as const,
      title: 'Working Solo',
      description: "I'm working alone for now",
      icon: User,
    },
    {
      value: 'team' as const,
      title: 'Working with Team',
      description: 'I want to collaborate with others',
      icon: Users,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Are you building alone or with a team?
        </h1>
        <p className="text-muted-foreground text-lg">
          You can always change this later
        </p>
      </div>

      {/* Preference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {preferences.map((pref) => {
          const Icon = pref.icon
          const isSelected = selectedPreference === pref.value

          return (
            <Card
              key={pref.value}
              className={cn(
                'cursor-pointer transition-colors hover:border-muted-foreground/25',
                isSelected && 'border-primary bg-primary/5'
              )}
              onClick={() => handleSelect(pref.value)}
            >
              <CardContent className="p-5 space-y-3">
                <Icon className={cn(
                  'h-5 w-5',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )} />
                <div>
                  <h3 className="text-sm font-medium">{pref.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {pref.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={isLoading}
        >
          Back
        </Button>
      </div>
    </div>
  )
}
