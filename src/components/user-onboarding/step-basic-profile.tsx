'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { basicProfileSchema, type BasicProfileData, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Camera, Loader2 } from 'lucide-react'
import { uploadFile } from '@/lib/uploads/storage'
import { useToast } from '@/hooks/use-toast'
import type { StepComponentProps } from '@/types/multi-step'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'
import { summarizeError } from '@/lib/logging/safe-log'

function nameToHandle(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32)
}

export function StepBasicProfile({
  data,
  onComplete,
  onBack: _onBack,
  isLoading,
  serverError,
  clearServerError,
}: StepComponentProps<UserOnboardingData>) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string>()
  const toast = useToast()

  const form = useForm<BasicProfileData>({
    resolver: zodResolver(basicProfileSchema),
    mode: 'onChange',
    defaultValues: {
      handle: data.handle || '',
      name: data.name || '',
      avatar_url: data.avatar_url || '',
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    reset,
    formState: { errors, isValid },
  } = form

  // Update form when data changes (e.g., after localStorage loads)
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      reset({
        handle: data.handle || '',
        name: data.name || '',
        avatar_url: data.avatar_url || '',
      })
    }
  }, [data, reset])

  const name = watch('name')
  const avatarUrl = watch('avatar_url')
  const displayUrl = preview || avatarUrl

  // Keep the onboarding handle hidden, but prefill a deterministic base value.
  useEffect(() => {
    if (name) {
      const generated = nameToHandle(name)
      setValue('handle', generated, { shouldValidate: true })
    }
  }, [name, setValue])

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
      const url = await uploadFile(file, 'avatars', 'users')
      setValue('avatar_url', url)
      toast.success('Photo uploaded')
    } catch (err) {
      console.error('[step-basic-profile] Upload error:', summarizeError(err))
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setPreview(undefined)
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = (formData: BasicProfileData) => {
    onComplete(formData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Your agents are waiting to meet you
        </h1>
        <p className="text-muted-foreground text-lg">
          Tell them who you are
        </p>
      </div>

      {/* Form Fields */}
      <div className="max-w-lg mx-auto space-y-8">
        {/* Avatar Upload — centered, minimal */}
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
              <p className="text-base font-medium text-foreground">Drop profile photo here</p>
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
                    <AvatarImage src={displayUrl} alt={name || 'Avatar'} className="object-cover" />
                  )}
                  <AvatarFallback className="text-2xl font-semibold bg-primary/10">
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      initials || <Camera className="h-6 w-6 text-muted-foreground" />
                    )}
                  </AvatarFallback>
                </Avatar>
                {/* Overlay icon */}
                {!uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-colors">
                    <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </button>
            </FileUploadTrigger>
          </div>
        </FileUpload>

        {serverError && serverError.field !== 'handle' && (
          <p className="text-sm text-destructive">{serverError.message}</p>
        )}

        {/* Your Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Your Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="John Doe"
            {...register('name', {
              onChange: () => {
                clearServerError?.()
                clearErrors('handle')
              },
            })}
            className={`h-12 text-base ${errors.name ? 'border-destructive' : ''}`}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <input type="hidden" {...register('handle')} />
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-4">
        <Button
          type="submit"
          size="lg"
          disabled={!isValid || isLoading}
          className="min-w-[200px]"
        >
          {isLoading ? 'Saving...' : 'Continue'}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          By joining, you agree to our{' '}
          <a href="/legal/terms-of-service" target="_blank" className="underline hover:text-foreground transition-colors">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/legal/privacy-policy" target="_blank" className="underline hover:text-foreground transition-colors">
            Privacy Policy
          </a>
        </p>
      </div>
    </form>
  )
}
