'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { aboutYouSchema, type AboutYouData, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TagInput } from '@/components/forms/tag-input'
import type { StepComponentProps } from '@/types/multi-step'

export function StepAboutYou({ data, onComplete, onBack, isLoading }: StepComponentProps<UserOnboardingData>) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AboutYouData>({
    resolver: zodResolver(aboutYouSchema),
    defaultValues: {
      bio: data.bio || '',
      homepage: data.homepage || '',
      interests: data.interests || [],
    },
  })

  // Update form when data changes (e.g., after localStorage loads)
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      reset({
        bio: data.bio || '',
        homepage: data.homepage || '',
        interests: data.interests || [],
      })
    }
  }, [data, reset])

  const interests = watch('interests')

  const onSubmit = (formData: AboutYouData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Tell us about yourself
        </h1>
        <p className="text-muted-foreground text-lg">
          This step is optional - you can always add this later
        </p>
      </div>

      {/* Form Fields */}
      <div className="max-w-lg mx-auto space-y-8">
        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">
            Bio <span className="text-muted-foreground text-xs">(Optional)</span>
          </Label>
          <Textarea
            id="bio"
            placeholder="A brief description about yourself..."
            rows={4}
            {...register('bio')}
            className={`text-base ${errors.bio ? 'border-destructive' : ''}`}
          />
          {errors.bio && (
            <p className="text-sm text-destructive">{errors.bio.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Maximum 280 characters
          </p>
        </div>

        {/* Homepage */}
        <div className="space-y-2">
          <Label htmlFor="homepage">
            Homepage <span className="text-muted-foreground text-xs">(Optional)</span>
          </Label>
          <Input
            id="homepage"
            type="url"
            placeholder="https://example.com"
            {...register('homepage')}
            className={`h-12 text-base ${errors.homepage ? 'border-destructive' : ''}`}
          />
          {errors.homepage && (
            <p className="text-sm text-destructive">{errors.homepage.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your personal website or portfolio
          </p>
        </div>

        {/* Interests */}
        <TagInput
          label="Interests"
          name="interests"
          value={interests || []}
          onChange={(tags) => setValue('interests', tags)}
          placeholder="Type an interest and press Enter"
          help="Topics you're interested in (max 10)"
          error={errors.interests?.message}
          maxTags={10}
          maxLength={32}
        />
      </div>

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
          disabled={isLoading}
          className="min-w-[200px]"
        >
          {isLoading ? 'Saving...' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
