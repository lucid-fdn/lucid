'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AvatarUploadV2 } from '@/components/forms/avatar-upload-v2'
import { FormField } from '@/components/forms/form-field'
import { FormSection } from '@/components/forms/form-section'
import { FormActions } from '@/components/forms/form-actions'
import { TagInput } from '@/components/forms/tag-input'
import { profileSchema, type ProfileData } from '@/lib/forms/schemas'
import { updateProfileAction } from '@/lib/forms/actions'
import { useToast } from '@/hooks/use-toast'
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

interface ProfileFormProps {
  defaultValues: Partial<ProfileData>
  userName?: string
  onSaveSuccess?: () => void
}

export function ProfileForm({ defaultValues, userName, onSaveSuccess }: ProfileFormProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: defaultValues.name || '',
      avatar_url: defaultValues.avatar_url || '',
      bio: defaultValues.bio || '',
      homepage: defaultValues.homepage || '',
      interests: defaultValues.interests || [],
      github_username: defaultValues.github_username || '',
      twitter_username: defaultValues.twitter_username || '',
      linkedin_url: defaultValues.linkedin_url || '',
      profile_public: defaultValues.profile_public ?? false, // Default to private
    },
  })

  const avatarUrl = watch('avatar_url')
  const interests = watch('interests')
  const profilePublic = watch('profile_public')

  // Reset form when defaultValues change (profile loads)
  React.useEffect(() => {
    reset({
      name: defaultValues.name || '',
      avatar_url: defaultValues.avatar_url || '',
      bio: defaultValues.bio || '',
      homepage: defaultValues.homepage || '',
      interests: defaultValues.interests || [],
      github_username: defaultValues.github_username || '',
      twitter_username: defaultValues.twitter_username || '',
      linkedin_url: defaultValues.linkedin_url || '',
      profile_public: false, // Always force to private (disabled)
    })
  }, [defaultValues, reset])

  const onSubmit = async (data: ProfileData) => {
    setLoading(true)

    try {
      const result = await updateProfileAction(data)

      if (result.success) {
        toast.success(notificationCopy.profile.updatedSuccessfully)
        // Refetch profile data from context
        if (onSaveSuccess) {
          onSaveSuccess()
        }
      } else {
        toast.error(result.error || 'Failed to update profile')
      }
    } catch (error) {
      console.error('[profile-form] Submit error:', summarizeError(error))
      toast.error(notificationCopy.common.unexpectedError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <FormSection
        title="Basic Information"
        description="Your name and avatar visible to other users"
      >
        <AvatarUploadV2
          currentUrl={avatarUrl ?? undefined}
          userName={userName || defaultValues.name || 'User' || undefined}
          showGenerateButton
        />

        <FormField
          label="Display Name"
          name="name"
          placeholder={(defaultValues.name || userName || "Your name") as string}
          help="Your full name as displayed on your profile"
          error={errors.name?.message}
          required
          register={register('name')}
        />
      </FormSection>

      {/* About */}
      <FormSection
        title="About"
        description="Tell others about yourself"
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

      {/* Privacy */}
      <FormSection
        title="Privacy"
        description="Control who can see your profile"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="profile_public" className="text-base font-medium">
              Public Profile
            </Label>
            <p className="text-sm text-muted-foreground">
              {profilePublic 
                ? 'Your profile is visible to anyone at /u/' + (userName?.toLowerCase().replace(/\s+/g, '_') || 'username')
                : 'Your profile is private and only you can see it'
              }
            </p>
          </div>
          <Switch
            id="profile_public"
            checked={false}
            onCheckedChange={(checked) => setValue('profile_public', checked)}
            disabled={true}
          />
        </div>
      </FormSection>

      {/* Social Links */}
      <FormSection
        title="Social Links"
        description="Connect your social media profiles"
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

      {/* Submit Actions */}
      <FormActions loading={loading} />
    </form>
  )
}
