'use client'

import { useState, useCallback } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip'
import { Upload, Loader2, Sparkles, X } from 'lucide-react'
import { uploadFile } from '@/lib/uploads/storage'
import { updateProfileAction } from '@/lib/forms/actions'
import { useToast } from '@/hooks/use-toast'
import { useProfile } from '@/contexts/profile-context'
import { useRouter } from 'next/navigation'
import { cn } from "@/lib/utils"
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'
import { ImageCropModal } from './image-crop-modal'
import { blobToFile } from '@/lib/image-utils'
import { notificationCopy } from '@/lib/notifications/copy'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'

interface AvatarUploadV2Props {
  currentUrl?: string
  userName?: string
  className?: string
  showGenerateButton?: boolean
  // Workspace mode props
  mode?: 'profile' | 'workspace'
  uploadPath?: string // e.g., 'avatars/users' or 'avatars/workspaces'
  onUploadComplete?: (url: string) => void
  disabled?: boolean
}

/**
 * Avatar upload component with drag-and-drop
 * Supports two modes:
 * - profile: Auto-saves to user profile (default)
 * - workspace: Calls onUploadComplete callback (for form integration)
 */
export function AvatarUploadV2({
  currentUrl,
  userName = 'User',
  className,
  showGenerateButton = false,
  mode = 'profile',
  uploadPath = 'avatars/users',
  onUploadComplete,
  disabled = false,
}: AvatarUploadV2Props) {
  const { imageCropping, aiAvatarGeneration } = useResolvedFeatureFlags()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string>()
  const [previousUrl, setPreviousUrl] = useState<string>()
  const [undoTimeoutId, setUndoTimeoutId] = useState<NodeJS.Timeout>()
  const [cropModalImage, setCropModalImage] = useState<string>()
  const [originalFile, setOriginalFile] = useState<File>()
  const toast = useToast()
  const { refetch } = useProfile()
  const router = useRouter()

  const handleUndo = useCallback(async () => {
    if (!previousUrl) return
    
    // Clear timeout
    if (undoTimeoutId) clearTimeout(undoTimeoutId)
    
    setUploading(true)
    try {
      const result = await updateProfileAction({ avatar_url: previousUrl })
      
      if (result.success) {
        toast.success('Avatar restored')
        setPreview(undefined)
        setPreviousUrl(undefined)
        router.refresh()
      }
    } catch (_err) {
      toast.error('Failed to restore avatar')
    } finally {
      setUploading(false)
    }
  }, [previousUrl, undoTimeoutId, toast, router])

  const handleUpload = useCallback(async (file: File) => {
    // Store current URL for undo (only in profile mode)
    if (currentUrl && mode === 'profile') {
      setPreviousUrl(currentUrl)
    }

    // Reset state
    setUploading(true)

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    try {
      // 1. Upload to Supabase Storage
      const [bucket, folder] = uploadPath.split('/')
      const url = await uploadFile(file, bucket as 'avatars', folder)
      console.log('[avatar-upload-v2] Uploaded to storage:', url)
      
      if (mode === 'profile') {
        // Profile mode: Auto-save to database
        const result = await updateProfileAction({ avatar_url: url })
        
        if (result.success) {
          toast.success('Profile photo updated')
          
          // Set timeout to clear undo after 10 seconds
          if (previousUrl) {
            const timeoutId = setTimeout(() => {
              setPreviousUrl(undefined)
            }, 10000)
            setUndoTimeoutId(timeoutId)
          }
          
          // Refetch profile to update navbar and all other places
          refetch()
        } else {
          throw new Error(result.error || 'Failed to save')
        }
      } else {
        // Workspace mode: Call callback (parent form handles saving)
        if (onUploadComplete) {
          onUploadComplete(url)
          toast.success(notificationCopy.upload.logoUploaded)
        }
      }
      
    } catch (err) {
      console.error('[avatar-upload-v2] Error:', err)
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setPreview(undefined) // Reset preview on error
    } finally {
      setUploading(false)
    }
  }, [toast, mode, uploadPath, onUploadComplete, currentUrl, previousUrl, refetch])

  const handleSelectedFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    if (imageCropping) {
      const objectUrl = URL.createObjectURL(file)
      setCropModalImage(objectUrl)
      setOriginalFile(file)
    } else {
      void handleUpload(file)
    }
  }, [handleUpload, imageCropping, toast])

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    if (!originalFile) return
    
    // Convert blob to file
    const croppedFile = blobToFile(
      croppedBlob,
      originalFile.name
    )
    
    // Close modal
    setCropModalImage(undefined)
    
    // Upload cropped image
    await handleUpload(croppedFile)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUpload changes cause re-bind
  }, [originalFile])

  const handleCropCancel = useCallback(() => {
    setCropModalImage(undefined)
    setOriginalFile(undefined)
  }, [])


  const handleRemove = async () => {
    if (!currentUrl && !preview) return
    
    setUploading(true)
    try {
      if (mode === 'profile') {
        // Profile mode: Remove from database
        const result = await updateProfileAction({ avatar_url: null })
        if (result.success) {
          setPreview(undefined)
          toast.success('Profile photo removed')
          router.refresh()
        }
      } else {
        // Workspace mode: Call callback with empty string
        if (onUploadComplete) {
          onUploadComplete('')
          setPreview(undefined)
          toast.success('Logo removed')
        }
      }
    } catch (_err) {
      toast.error('Failed to remove photo')
    } finally {
      setUploading(false)
    }
  }

  // Get initials from name
  const initials = userName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  const displayUrl = preview || currentUrl

  return (
    <FileUpload
      onFilesAdded={(files) => handleSelectedFile(files[0])}
      multiple={false}
      accept="image/png,image/jpeg,image/jpg,image/webp"
      disabled={uploading || disabled}
    >
      <div className={cn('space-y-4', className)}>
        <FileUploadContent>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-background/95 p-8 shadow-xl">
            <Upload className="h-10 w-10 text-primary/60" />
            <p className="text-base font-medium text-foreground">Drop image here</p>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              PNG, JPEG, or WebP. Lucid will open the cropper before saving when cropping is enabled.
            </p>
          </div>
        </FileUploadContent>
      <Label className="text-sm font-medium">Avatar</Label>

      <div className="flex items-start gap-6">
        {/* Avatar Preview */}
        <div className="relative group">
          <Avatar className="h-24 w-24 border-2 border-border">
            {displayUrl && (
              <AvatarImage src={displayUrl} alt={userName} className="object-cover" />
            )}
            <AvatarFallback className="text-2xl font-semibold bg-primary/10">
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                initials
              )}
            </AvatarFallback>
          </Avatar>
          
          {/* Remove button (shows on hover if avatar exists) */}
          {displayUrl && !uploading && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Upload Controls */}
        <div className="flex flex-col gap-3 flex-1">
          <div className="flex flex-wrap gap-2">
            {/* Undo Button (shows if previous URL exists) */}
            {previousUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={handleUndo}
                className="min-w-[100px]"
              >
                Undo
              </Button>
            )}
            
            {/* Upload Button */}
            <FileUploadTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || disabled}
                className="min-w-[120px]"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Photo
                  </>
                )}
              </Button>
            </FileUploadTrigger>

            {/* Generate Button (Optional) */}
            {showGenerateButton && aiAvatarGeneration && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate
              </Button>
            )}
            
            {/* Generate Button - Coming Soon (with tooltip) */}
            {showGenerateButton && !aiAvatarGeneration && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={true}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Coming soon</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Help Text */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, or WebP · Maximum 2MB
            </p>
            <p className="text-xs text-muted-foreground">
              Drag and drop or click to upload
            </p>
          </div>
        </div>
      </div>

      {/* Crop Modal */}
      {cropModalImage && (
        <ImageCropModal
          image={cropModalImage}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
      </div>
    </FileUpload>
  )
}
