'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { workspaceDetailsSchema, type WorkspaceDetailsData, type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Camera, Loader2 } from 'lucide-react'
import { uploadFile } from '@/lib/uploads/storage'
import { useToast } from '@/hooks/use-toast'
import { WorkspaceSlugField } from '@/components/forms/workspace-slug-field'
import { useState, useEffect } from 'react'
import { notificationCopy } from '@/lib/notifications/copy'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'

interface StepDetailsProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: (data: Partial<WorkspaceOnboardingData>) => void
  onBack: () => void
  isLoading: boolean
}

export function StepDetails({ data, onComplete, onBack, isLoading, serverError, clearServerError }: StepDetailsProps & { serverError?: { field?: string; message: string } | null; clearServerError?: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string>()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isValid },
  } = useForm<WorkspaceDetailsData>({
    resolver: zodResolver(workspaceDetailsSchema) as any,
    mode: 'onTouched',
    defaultValues: {
      name: (data as Record<string, unknown>).workspace_name as string || '',
      slug: (data as Record<string, unknown>).workspace_slug as string || '',
      description: (data as Record<string, unknown>).workspace_description as string || '',
      logo_url: (data as Record<string, unknown>).workspace_logo_url as string || '',
    },
  })

  const name = watch('name')
  const logoUrl = watch('logo_url')
  const displayUrl = preview || logoUrl
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  // Auto-generate slug from name
  useEffect(() => {
    if (name && !slugManuallyEdited) {
      const autoSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      setValue('slug', autoSlug, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true
      })
    }
  }, [name, slugManuallyEdited, setValue])

  useEffect(() => {
    if (serverError?.field === 'workspace_slug') {
      setError('slug', { type: 'server', message: serverError.message })
    }
  }, [serverError, setError])

  const initials = name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || ''

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return

    setUploading(true)
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    try {
      const url = await uploadFile(file, 'avatars', 'workspaces')
      setValue('logo_url', url, { shouldValidate: true })
      toast.success(notificationCopy.upload.logoUploaded)
    } catch (err) {
      console.error('[step-details] Upload error:', err)
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setPreview(undefined)
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = (formData: WorkspaceDetailsData) => {
    onComplete({
      workspace_name: formData.name,
      workspace_slug: formData.slug,
      workspace_description: formData.description,
      workspace_logo_url: formData.logo_url,
    } as unknown as Partial<WorkspaceOnboardingData>)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Give your team a home
        </h1>
        <p className="text-muted-foreground text-lg">
          This is where your agents and teammates will live
        </p>
      </div>

      {/* Form Fields */}
      <div className="max-w-lg mx-auto space-y-8">
        {/* Workspace Logo — centered, minimal */}
        <FileUpload
          onFilesAdded={(files) => {
            void handleFileChange(files[0])
          }}
          multiple={false}
          accept="image/png,image/jpeg,image/jpg,image/webp"
          disabled={uploading}
        >
          <FileUploadContent>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-background/95 p-8 shadow-xl">
              <Camera className="h-10 w-10 text-primary/60" />
              <p className="text-base font-medium text-foreground">Drop workspace logo here</p>
              <p className="max-w-xs text-center text-sm text-muted-foreground">PNG, JPEG, or WebP.</p>
            </div>
          </FileUploadContent>
          <div className="flex justify-center">
            <FileUploadTrigger
              asChild
              disabled={uploading}
              className="relative group cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <button type="button" disabled={uploading}>
                <Avatar className="h-24 w-24 border-2 border-border transition-opacity group-hover:opacity-80">
                  {displayUrl && (
                    <AvatarImage src={displayUrl} alt={name || 'Workspace'} className="object-cover" />
                  )}
                  <AvatarFallback className="text-2xl font-semibold bg-primary/10">
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      initials || <Camera className="h-6 w-6 text-muted-foreground" />
                    )}
                  </AvatarFallback>
                </Avatar>
                {!uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-colors">
                    <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </button>
            </FileUploadTrigger>
          </div>
        </FileUpload>

        {/* Workspace Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Workspace Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="My Awesome Workspace"
            {...register('name')}
            className={`h-12 text-base ${errors.name ? 'border-destructive' : ''}`}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Workspace Slug */}
        <WorkspaceSlugField
          value={watch('slug')}
          onChange={(value) => {
            clearServerError?.()
            clearErrors('slug')
            setSlugManuallyEdited(true)
            setValue('slug', value, {
              shouldValidate: true,
              shouldDirty: true,
              shouldTouch: true
            })
          }}
          error={errors.slug?.message}
          required
          inputClassName="h-12 text-base"
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
          disabled={!isValid || isLoading}
          className="min-w-[200px]"
        >
          {isLoading ? 'Creating...' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
