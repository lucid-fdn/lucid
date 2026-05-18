import 'server-only'

export type ImageGenerationErrorCode =
  | 'missing_credentials'
  | 'capability_unavailable'
  | 'provider_quota_exceeded'
  | 'provider_unavailable'
  | 'invalid_reference_image'
  | 'storage_failed'
  | 'invalid_request'

export class ImageGenerationError extends Error {
  constructor(
    public code: ImageGenerationErrorCode,
    message: string,
    public statusCode = 500,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ImageGenerationError'
  }
}

export function isImageGenerationError(error: unknown): error is ImageGenerationError {
  return error instanceof ImageGenerationError
}
