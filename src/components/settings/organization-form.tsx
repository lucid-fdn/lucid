'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AvatarUpload } from '@/components/forms/avatar-upload'
import { UsernameField } from '@/components/forms/username-field'
import { FormField } from '@/components/forms/form-field'
import { FormSection } from '@/components/forms/form-section'
import { FormActions } from '@/components/forms/form-actions'
import { FormMessage } from '@/components/forms/form-message'
import { organizationSchema, type OrganizationData } from '@/lib/forms/schemas'
import { createOrganizationAction } from '@/lib/forms/actions'

export function OrganizationForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrganizationData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      logo_url: '',
      bio: '',
      homepage: '',
    },
  })

  const slug = watch('slug')
  const logoUrl = watch('logo_url')
  const name = watch('name')

  const onSubmit = async (data: OrganizationData) => {
    setLoading(true)
    setError(undefined)

    try {
      const result = await createOrganizationAction(data)

      if (result && !result.success) {
        setError(result.error || 'Failed to create organization')
        setLoading(false)
      }
      // If successful, action redirects to /company/[slug]
    } catch (err) {
      console.error('[organization-form] Submit error:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Error Message */}
      {error && <FormMessage type="error" message={error} />}

      {/* Basic Info */}
      <FormSection
        title="Organization Details"
        description="Basic information about your organization"
      >
        <FormField
          label="Organization Name"
          name="name"
          placeholder="Acme Corporation"
          help="The official name of your organization"
          error={errors.name?.message}
          required
          register={register('name')}
        />

        <UsernameField
          value={slug}
          onChange={(value) => setValue('slug', value)}
          error={errors.slug?.message}
          label="Organization URL"
          placeholder="acme"
          help="This will be your organization's URL (e.g., /company/acme)"
          required
        />

        <AvatarUpload
          currentUrl={logoUrl}
          onUpload={(url) => setValue('logo_url', url)}
          userName={name || 'Organization'}
          showGenerateButton={false}
        />
      </FormSection>

      {/* Description */}
      <FormSection
        title="About Your Organization"
        description="Help others learn about your organization"
      >
        <FormField
          label="Description"
          name="bio"
          type="textarea"
          placeholder="Tell us about your organization..."
          help="A brief description of what your organization does"
          error={errors.bio?.message}
          rows={4}
          register={register('bio')}
        />

        <FormField
          label="Website"
          name="homepage"
          type="url"
          placeholder="https://example.com"
          help="Your organization's website"
          error={errors.homepage?.message}
          register={register('homepage')}
        />
      </FormSection>

      {/* Submit Actions */}
      <FormActions
        loading={loading}
        onCancel={() => window.history.back()}
        submitLabel="Create Organization"
      />
    </form>
  )
}
