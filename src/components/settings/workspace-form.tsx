"use client"

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AvatarUploadV2 } from '@/components/forms/avatar-upload-v2'
import { FormField } from '@/components/forms/form-field'
import { FormSection } from '@/components/forms/form-section'
import { FormActions } from '@/components/forms/form-actions'
import { TagInput } from '@/components/forms/tag-input'
import { useToast } from '@/hooks/use-toast'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { updateWorkspaceField, useWorkspaceRefresh } from '@/lib/workspace/refresh'

// Schema
const workspaceProfileSchema = z.object({
  name: z.string().min(1, 'Name required').max(100, 'Max 100 characters'),
  logo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bio: z.string().max(280, 'Max 280 characters').optional().or(z.literal('')),
  homepage: z.string().url('Invalid URL').optional().or(z.literal('')),
  interests: z.array(z.string()).max(10, 'Max 10 tags').optional(),
  github_username: z.string().max(50).optional().or(z.literal('')),
  twitter_username: z.string().max(50).optional().or(z.literal('')),
  linkedin_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  workspace_public: z.boolean().optional(),
})

type WorkspaceProfileData = z.infer<typeof workspaceProfileSchema>

interface WorkspaceFormProps {
  defaultValues: WorkspaceProfileData
  workspaceId: string
  workspaceName: string
  isReadOnly?: boolean
}

export function WorkspaceForm({ 
  defaultValues, 
  workspaceId, 
  workspaceName,
  isReadOnly = false
}: WorkspaceFormProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const refreshWorkspace = useWorkspaceRefresh()
  
  // DEBUG LOGS - Understanding form disable issue
  console.log('[WorkspaceForm] 🔍 Form Props:', {
    workspaceId,
    workspaceName,
    isReadOnly,
    defaultValues,
  })
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WorkspaceProfileData>({
    resolver: zodResolver(workspaceProfileSchema),
    defaultValues,
  })

  const logoUrl = watch('logo_url')
  const interests = watch('interests')
  const workspacePublic = watch('workspace_public')
  
  // DEBUG LOGS - Watch form state
  console.log('[WorkspaceForm] 📝 Form State:', {
    isReadOnly,
    loading,
    formValues: {
      logoUrl,
      interests,
      workspacePublic,
    },
    errors,
  })

  const onSubmit = async (data: WorkspaceProfileData) => {
    if (isReadOnly) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update workspace')
      }

      toast.success('Workspace updated successfully')
      refreshWorkspace({ field: 'form', delay: 1000 })
    } catch (error: unknown) {
      console.error('Update error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update workspace')
    } finally {
      setLoading(false)
    }
  }

  // Auto-save logo when uploaded (using centralized system)
  const handleLogoUpload = async (url: string) => {
    setValue('logo_url', url)
    
    await updateWorkspaceField({
      workspaceId,
      field: 'logo_url',
      value: url,
      onSuccess: () => {
        console.log('[WorkspaceForm] Logo saved, refreshing UI...')
        refreshWorkspace({ field: 'logo', delay: 1000 })
      },
      onError: (_error) => {
        toast.error('Logo uploaded but failed to save.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <FormSection
        title="Basic Information"
        description="Your workspace's name and logo visible to members"
      >
        <AvatarUploadV2
          currentUrl={logoUrl}
          userName={workspaceName}
          mode="workspace"
          uploadPath="avatars/workspaces"
          onUploadComplete={handleLogoUpload}
          disabled={isReadOnly}
        />

        <FormField
          label="Workspace Name"
          name="name"
          placeholder="Acme Corp"
          help="The display name for your workspace"
          error={errors.name?.message}
          required
          register={register('name')}
          disabled={isReadOnly}
        />
      </FormSection>

      {/* About */}
      <FormSection
        title="About"
        description="Tell others about your workspace"
      >
        <FormField
          label="Description"
          name="bio"
          type="textarea"
          placeholder="Tell others about your workspace..."
          help="Maximum 280 characters"
          error={errors.bio?.message}
          rows={4}
          register={register('bio')}
          disabled={isReadOnly}
        />

        <FormField
          label="Website"
          name="homepage"
          type="url"
          placeholder="https://example.com"
          help="Your workspace's website or homepage"
          error={errors.homepage?.message}
          register={register('homepage')}
          disabled={isReadOnly}
        />

        <TagInput
          label="Tags"
          name="interests"
          value={interests || []}
          onChange={(tags) => setValue('interests', tags)}
          placeholder="Type a tag and press Enter"
          help="Topics or categories for your workspace (max 10)"
          error={errors.interests?.message}
          maxTags={10}
          maxLength={32}
        />
      </FormSection>

      {/* Privacy */}
      <FormSection
        title="Privacy"
        description="Control who can see your workspace"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="workspace_public" className="text-base font-medium">
              Public Workspace
            </Label>
            <p className="text-sm text-muted-foreground">
              {workspacePublic 
                ? 'Your workspace is visible to anyone'
                : 'Your workspace is private and only visible to members'
              }
            </p>
          </div>
          <Switch
            id="workspace_public"
            checked={workspacePublic}
            onCheckedChange={(checked) => setValue('workspace_public', checked)}
            disabled={isReadOnly}
          />
        </div>
      </FormSection>

      {/* Social Links */}
      <FormSection
        title="Social Links"
        description="Connect your workspace's social media profiles"
      >
        <FormField
          label="GitHub Username"
          name="github_username"
          placeholder="company"
          help="Your workspace's GitHub username (without @)"
          error={errors.github_username?.message}
          register={register('github_username')}
          disabled={isReadOnly}
        />

        <FormField
          label="Twitter/X Username"
          name="twitter_username"
          placeholder="company"
          help="Your workspace's Twitter/X username (without @)"
          error={errors.twitter_username?.message}
          register={register('twitter_username')}
          disabled={isReadOnly}
        />

        <FormField
          label="LinkedIn URL"
          name="linkedin_url"
          type="url"
          placeholder="https://linkedin.com/company/your-company"
          help="Your workspace's LinkedIn company page URL"
          error={errors.linkedin_url?.message}
          register={register('linkedin_url')}
          disabled={isReadOnly}
        />
      </FormSection>

      {/* Submit Actions - Only show if not read-only */}
      {!isReadOnly && <FormActions loading={loading} />}
    </form>
  )
}
