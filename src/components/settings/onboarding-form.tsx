'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { AvatarUpload } from '@/components/forms/avatar-upload'
import { UsernameField } from '@/components/forms/username-field'
import { FormField } from '@/components/forms/form-field'
import { FormSection } from '@/components/forms/form-section'
import { FormActions } from '@/components/forms/form-actions'
import { FormMessage } from '@/components/forms/form-message'
import { TagInput } from '@/components/forms/tag-input'
import { onboardingSchema, type OnboardingData } from '@/lib/forms/schemas'
import { completeOnboardingAction } from '@/lib/forms/actions'

interface OnboardingFormProps {
  defaultName?: string
  defaultEmail?: string
}

export function OnboardingForm({ defaultName, defaultEmail: _defaultEmail }: OnboardingFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      handle: '',
      name: defaultName || '',
      avatar_url: '',
      bio: '',
      homepage: '',
      interests: [],
      github_username: '',
      twitter_username: '',
      linkedin_url: '',
      agree_terms: false,
    },
  })

  const handle = watch('handle')
  const avatarUrl = watch('avatar_url')
  const interests = watch('interests')
  const agreeTerms = watch('agree_terms')
  const name = watch('name')

  const onSubmit = async (data: OnboardingData) => {
    setLoading(true)
    setError(undefined)

    try {
      const result = await completeOnboardingAction(data)

      if (result && !result.success) {
        setError(result.error || 'Failed to complete onboarding')
        setLoading(false)
      }
      // If successful, action redirects to /explore
    } catch (err) {
      console.error('[onboarding-form] Submit error:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Error Message */}
      {error && <FormMessage type="error" message={error} />}

      {/* Welcome */}
      <FormSection
        title="Welcome! Let's set up your profile"
        description="This information will be visible on your public profile"
      >
        <UsernameField
          value={handle}
          onChange={(value) => setValue('handle', value)}
          error={errors.handle?.message}
          label="Choose Your Username"
          placeholder="your_username"
          help="This will be your unique identifier (e.g., @your_username)"
          required
        />

        <FormField
          label="Display Name"
          name="name"
          placeholder="John Doe"
          help="Your full name as shown on your profile"
          error={errors.name?.message}
          required
          register={register('name')}
        />

        <AvatarUpload
          currentUrl={avatarUrl}
          onUpload={(url) => setValue('avatar_url', url)}
          userName={name || 'User'}
          showGenerateButton
        />
      </FormSection>

      {/* About You (Optional) */}
      <FormSection
        title="Tell Us About Yourself"
        description="Optional - you can always add this later"
      >
        <FormField
          label="Bio"
          name="bio"
          type="textarea"
          placeholder="A brief description about yourself..."
          help="Maximum 280 characters"
          error={errors.bio?.message}
          rows={4}
          register={register('bio')}
        />

        <FormField
          label="Homepage"
          name="homepage"
          type="url"
          placeholder="https://example.com"
          help="Your personal website or portfolio"
          error={errors.homepage?.message}
          register={register('homepage')}
        />

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
      </FormSection>

      {/* Social Links (Optional) */}
      <FormSection
        title="Connect Your Socials"
        description="Optional - help others find you"
      >
        <FormField
          label="GitHub Username"
          name="github_username"
          placeholder="octocat"
          help="Your GitHub username (without @)"
          error={errors.github_username?.message}
          register={register('github_username')}
        />

        <FormField
          label="Twitter/X Username"
          name="twitter_username"
          placeholder="username"
          help="Your Twitter/X username (without @)"
          error={errors.twitter_username?.message}
          register={register('twitter_username')}
        />

        <FormField
          label="LinkedIn URL"
          name="linkedin_url"
          type="url"
          placeholder="https://linkedin.com/in/username"
          help="Your full LinkedIn profile URL"
          error={errors.linkedin_url?.message}
          register={register('linkedin_url')}
        />
      </FormSection>

      {/* Terms & Conditions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="agree_terms"
              checked={agreeTerms}
              onCheckedChange={(checked) => setValue('agree_terms', checked as boolean)}
            />
            <div className="space-y-1 leading-none">
              <Label
                htmlFor="agree_terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I agree to the Terms of Service and Code of Conduct
              </Label>
              {errors.agree_terms && (
                <p className="text-sm text-destructive">{errors.agree_terms.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Actions */}
      <FormActions
        loading={loading}
        disabled={!agreeTerms}
        submitLabel="Complete Setup"
      />
    </form>
  )
}
