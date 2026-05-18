/**
 * AI Multi-Modal Attachments
 *
 * Utilities for handling file attachments in AI chat messages.
 * Supports images, PDFs, and text files for vision-capable models.
 *
 * AI SDK v6 automatically converts image/* and text/* content types
 * into multi-modal content parts via convertToModelMessages().
 *
 * @example
 * ```ts
 * import { convertFilesToDataURLs, validateAttachment } from '@/lib/ai/attachments'
 *
 * // Convert FileList to FileUIPart[] for sendMessage()
 * const fileParts = await convertFilesToDataURLs(fileList)
 * sendMessage({ text: 'Describe this image', files: fileParts })
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

/** File part compatible with AI SDK v6 UIMessage.parts */
export interface FileUIPart {
  type: 'file'
  filename?: string
  mediaType: string
  url: string // data URL or remote URL
}

/** Validation result for file attachments */
export interface AttachmentValidation {
  valid: boolean
  error?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Max file size: 20MB (most vision models support up to 20MB) */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

/** Max number of files per message */
export const MAX_FILES_PER_MESSAGE = 10

/** Supported MIME types for multi-modal AI */
export const SUPPORTED_MEDIA_TYPES = {
  // Images (vision models)
  'image/png': { maxSize: MAX_FILE_SIZE_BYTES, label: 'PNG Image' },
  'image/jpeg': { maxSize: MAX_FILE_SIZE_BYTES, label: 'JPEG Image' },
  'image/gif': { maxSize: MAX_FILE_SIZE_BYTES, label: 'GIF Image' },
  'image/webp': { maxSize: MAX_FILE_SIZE_BYTES, label: 'WebP Image' },
  'image/svg+xml': { maxSize: 1 * 1024 * 1024, label: 'SVG Image' },
  // Documents
  'application/pdf': { maxSize: MAX_FILE_SIZE_BYTES, label: 'PDF Document' },
  // Text
  'text/plain': { maxSize: 1 * 1024 * 1024, label: 'Text File' },
  'text/csv': { maxSize: 5 * 1024 * 1024, label: 'CSV File' },
  'text/markdown': { maxSize: 1 * 1024 * 1024, label: 'Markdown File' },
} as const

export type SupportedMediaType = keyof typeof SUPPORTED_MEDIA_TYPES

/** Accept string for file input elements */
export const FILE_INPUT_ACCEPT = Object.keys(SUPPORTED_MEDIA_TYPES).join(',')

/** Image-only accept string */
export const IMAGE_INPUT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

// ============================================================================
// FILE CONVERSION
// ============================================================================

/**
 * Convert a File to a data URL string.
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Convert a FileList to an array of FileUIPart objects.
 * These can be passed directly to sendMessage({ files: [...] }).
 *
 * @param files - FileList from an input element
 * @returns Array of FileUIPart objects with data URLs
 */
export async function convertFilesToDataURLs(
  files: FileList | File[]
): Promise<FileUIPart[]> {
  const fileArray = Array.from(files)
  const parts: FileUIPart[] = []

  for (const file of fileArray) {
    const validation = validateAttachment(file)
    if (!validation.valid) {
      console.warn(`[Attachments] Skipping invalid file: ${file.name} — ${validation.error}`)
      continue
    }

    const dataUrl = await fileToDataURL(file)
    parts.push({
      type: 'file',
      filename: file.name,
      mediaType: file.type || 'application/octet-stream',
      url: dataUrl,
    })
  }

  return parts
}

/**
 * Create a FileUIPart from a remote URL (e.g., for pasting image URLs).
 */
export function createFilePartFromURL(
  url: string,
  mediaType: string,
  filename?: string
): FileUIPart {
  return {
    type: 'file',
    filename: filename || extractFilenameFromURL(url),
    mediaType,
    url,
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a file before uploading as an AI attachment.
 */
export function validateAttachment(file: File): AttachmentValidation {
  // Check if media type is supported
  const mediaConfig = SUPPORTED_MEDIA_TYPES[file.type as SupportedMediaType]
  if (!mediaConfig) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Supported: ${Object.values(SUPPORTED_MEDIA_TYPES).map((c) => c.label).join(', ')}`,
    }
  }

  // Check file size
  if (file.size > mediaConfig.maxSize) {
    const maxMB = Math.round(mediaConfig.maxSize / (1024 * 1024))
    const fileMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File too large: ${fileMB}MB (max ${maxMB}MB for ${mediaConfig.label})`,
    }
  }

  // Check for empty files
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' }
  }

  return { valid: true }
}

/**
 * Validate multiple files before uploading.
 */
export function validateAttachments(
  files: FileList | File[]
): AttachmentValidation {
  const fileArray = Array.from(files)

  if (fileArray.length > MAX_FILES_PER_MESSAGE) {
    return {
      valid: false,
      error: `Too many files: ${fileArray.length} (max ${MAX_FILES_PER_MESSAGE})`,
    }
  }

  for (const file of fileArray) {
    const result = validateAttachment(file)
    if (!result.valid) return result
  }

  return { valid: true }
}

// ============================================================================
// MODEL CAPABILITIES
// ============================================================================

/** Models that support vision (image input) */
const VISION_CAPABLE_MODELS = new Set([
  // OpenAI
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-vision-preview',
  'o1',
  'o1-mini',
  'o3',
  'o3-mini',
  'o4-mini',
  'o1-pro',
  'gpt-5',
  // Anthropic
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-4-sonnet-20250514',
  'claude-4-opus-20250514',
  // Google
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  // Meta (via Together/Fireworks)
  'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
  'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
])

/**
 * Check if a model supports vision (image input).
 * Uses a heuristic: known model IDs + pattern matching.
 */
export function isVisionCapable(modelId: string): boolean {
  // Exact match
  if (VISION_CAPABLE_MODELS.has(modelId)) return true

  // Pattern-based detection
  const lowerModel = modelId.toLowerCase()
  if (lowerModel.includes('vision')) return true
  if (lowerModel.includes('gpt-4o')) return true
  if (lowerModel.includes('gpt-5')) return true
  if (lowerModel.includes('o1-pro')) return true
  if (lowerModel.includes('claude-3')) return true
  if (lowerModel.includes('claude-4')) return true
  if (lowerModel.includes('gemini')) return true
  if (lowerModel.includes('llama-3.2') && lowerModel.includes('vision')) return true
  if (lowerModel.includes('llama-4')) return true
  if (lowerModel.includes('pixtral')) return true
  if (lowerModel.includes('qwen2-vl')) return true
  if (lowerModel.includes('qwen-vl')) return true

  return false
}

/**
 * Check if a model supports PDF input.
 * Fewer models support direct PDF processing.
 */
export function isPDFCapable(modelId: string): boolean {
  const lowerModel = modelId.toLowerCase()
  // Gemini and Claude support PDFs natively
  return (
    lowerModel.includes('gemini') ||
    lowerModel.includes('claude-3-5') ||
    lowerModel.includes('claude-4')
  )
}

/**
 * Get the accept string for file input based on model capabilities.
 */
export function getAcceptForModel(modelId: string): string {
  const types: string[] = []

  if (isVisionCapable(modelId)) {
    types.push('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  }

  if (isPDFCapable(modelId)) {
    types.push('application/pdf')
  }

  // Text files always supported (sent as text content)
  types.push('text/plain', 'text/csv', 'text/markdown')

  return types.join(',')
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Extract filename from a URL.
 */
function extractFilenameFromURL(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segments = pathname.split('/')
    return segments[segments.length - 1] || 'file'
  } catch {
    return 'file'
  }
}

/**
 * Get human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check if a media type is an image.
 */
export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith('image/')
}

/**
 * Check if a media type is a PDF.
 */
export function isPDFType(mediaType: string): boolean {
  return mediaType === 'application/pdf'
}

/**
 * Check if a media type is a text file.
 */
export function isTextType(mediaType: string): boolean {
  return mediaType.startsWith('text/')
}