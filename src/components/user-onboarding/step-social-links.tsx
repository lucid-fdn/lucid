'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { socialLinksSchema, type SocialLinksData, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Github, Twitter, Linkedin } from 'lucide-react'
import type { StepComponentProps } from '@/types/multi-step'

export function StepSocialLinks({ data, onComplete, onBack, isLoading }: StepComponentProps<UserOnboardingData>) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SocialLinksData>({
    resolver: zodResolver(socialLinksSchema),
    defaultValues: {
      github_username: data.github_username || '',
      twitter_username: data.twitter_username || '',
      linkedin_url: data.linkedin_url || '',
    },
  })

  // Update form when data changes (e.g., after localStorage loads)
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      reset({
        github_username: data.github_username || '',
        twitter_username: data.twitter_username || '',
        linkedin_url: data.linkedin_url || '',
      })
    }
  }, [data, reset])

  const onSubmit = (formData: SocialLinksData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Connect your social profiles
        </h1>
        <p className="text-muted-foreground text-lg">
          This step is optional - help others find you
        </p>
      </div>

      {/* Form Fields */}
      <div className="max-w-lg mx-auto space-y-8">
        {/* GitHub */}
        <div className="space-y-2">
          <Label htmlFor="github_username" className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            GitHub Username
            <span className="text-muted-foreground text-xs">(Optional)</span>
          </Label>
          <Input
            id="github_username"
            placeholder="octocat"
            {...register('github_username')}
            className={`h-12 text-base ${errors.github_username ? 'border-destructive' : ''}`}
          />
          {errors.github_username && (
            <p className="text-sm text-destructive">{errors.github_username.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your GitHub username (without @)
          </p>
        </div>

        {/* Twitter */}
        <div className="space-y-2">
          <Label htmlFor="twitter_username" className="flex items-center gap-2">
            <Twitter className="h-4 w-4" />
            Twitter/X Username
            <span className="text-muted-foreground text-xs">(Optional)</span>
          </Label>
          <Input
            id="twitter_username"
            placeholder="username"
            {...register('twitter_username')}
            className={`h-12 text-base ${errors.twitter_username ? 'border-destructive' : ''}`}
          />
          {errors.twitter_username && (
            <p className="text-sm text-destructive">{errors.twitter_username.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your Twitter/X username (without @)
          </p>
        </div>

        {/* LinkedIn */}
        <div className="space-y-2">
          <Label htmlFor="linkedin_url" className="flex items-center gap-2">
            <Linkedin className="h-4 w-4" />
            LinkedIn URL
            <span className="text-muted-foreground text-xs">(Optional)</span>
          </Label>
          <Input
            id="linkedin_url"
            type="url"
            placeholder="https://linkedin.com/in/username"
            {...register('linkedin_url')}
            className={`h-12 text-base ${errors.linkedin_url ? 'border-destructive' : ''}`}
          />
          {errors.linkedin_url && (
            <p className="text-sm text-destructive">{errors.linkedin_url.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your full LinkedIn profile URL
          </p>
        </div>
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
