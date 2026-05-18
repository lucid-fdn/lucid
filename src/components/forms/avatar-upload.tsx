'use client'

import { AvatarUploadV2 } from './avatar-upload-v2'

interface AvatarUploadProps {
  currentUrl?: string
  onUpload: (url: string) => void
  userName?: string
  className?: string
  showGenerateButton?: boolean
}

/**
 * Compatibility wrapper for legacy settings forms.
 * New upload behavior is centralized in AvatarUploadV2 and the shared FileUpload primitive.
 */
export function AvatarUpload({
  currentUrl,
  onUpload,
  userName = 'User',
  className,
  showGenerateButton = false,
}: AvatarUploadProps) {
  return (
    <AvatarUploadV2
      currentUrl={currentUrl}
      userName={userName}
      className={className}
      showGenerateButton={showGenerateButton}
      mode="workspace"
      uploadPath="avatars/users"
      onUploadComplete={onUpload}
    />
  )
}
