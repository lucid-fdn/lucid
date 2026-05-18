'use server'

import { createClient } from '@supabase/supabase-js'
import { composeAbortSignal, readPositiveIntEnv } from '@/lib/http/fetch-timeout'

let _supabase: ReturnType<typeof createClient<any>> | null = null

const DEFAULT_STORAGE_UPLOAD_RETRIES = 4
const DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS = 60_000

function getStorageUploadRetries(): number {
  return Math.min(readPositiveIntEnv('SUPABASE_STORAGE_UPLOAD_RETRIES', DEFAULT_STORAGE_UPLOAD_RETRIES), 8)
}

function getStorageUploadTimeoutMs(): number {
  return readPositiveIntEnv('SUPABASE_STORAGE_UPLOAD_TIMEOUT_MS', DEFAULT_STORAGE_UPLOAD_TIMEOUT_MS)
}

function storageFetch(input: RequestInfo | URL, init?: RequestInit) {
  return globalThis.fetch(input, {
    ...init,
    signal: composeAbortSignal(init?.signal, getStorageUploadTimeoutMs()),
  })
}

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: {
          fetch: storageFetch as typeof fetch,
        },
      },
    )
  }
  return _supabase
}

export type BucketName = 'avatars' | 'org-logos'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function storageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableStorageError(error: unknown): boolean {
  const message = storageErrorMessage(error).toLowerCase()
  const originalError = typeof error === 'object' && error !== null && 'originalError' in error
    ? (error as { originalError?: unknown }).originalError
    : undefined
  const originalMessage = storageErrorMessage(originalError).toLowerCase()

  return [
    message,
    originalMessage,
  ].some((value) => (
    value.includes('fetch failed')
    || value.includes('aborted')
    || value.includes('epipe')
    || value.includes('econnreset')
    || value.includes('etimedout')
    || value.includes('network')
    || value.includes('timeout')
  ))
}

async function uploadToStorageWithRetry(input: {
  bucket: BucketName
  filename: string
  body: Buffer
  contentType: string
  upsert: boolean
}) {
  let lastError: unknown
  const maxRetries = getStorageUploadRetries()

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const { error } = await getSupabase().storage
      .from(input.bucket)
      .upload(input.filename, input.body, {
        contentType: input.contentType,
        cacheControl: '31536000',
        upsert: input.upsert,
      })

    if (!error) return
    lastError = error

    if (!isRetryableStorageError(error) || attempt >= maxRetries) {
      throw error
    }

    const backoffMs = Math.min(500 * 2 ** attempt, 5_000)
    const jitterMs = Math.floor(Math.random() * 250)
    await sleep(backoffMs + jitterMs)
  }

  throw lastError instanceof Error ? lastError : new Error('Upload failed')
}

/**
 * Upload a file to Supabase Storage
 * Server-side only for security
 */
export async function uploadFile(
  file: File,
  bucket: BucketName,
  folder?: string
): Promise<string> {
  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. PNG, JPEG, or WebP only.')
  }

  // Validate file size (2MB max)
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('File too large. Maximum 2MB.')
  }

  // Generate unique filename
  const ext = file.name.split('.').pop()
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const filename = folder
    ? `${folder}/${timestamp}-${random}.${ext}`
    : `${timestamp}-${random}.${ext}`

  try {
    // Convert File to ArrayBuffer for server upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    await uploadToStorageWithRetry({
      bucket,
      filename,
      body: buffer,
      contentType: file.type,
      upsert: false,
    })

    // Get public URL
    const {
      data: { publicUrl },
    } = getSupabase().storage.from(bucket).getPublicUrl(filename)

    return publicUrl
  } catch (error) {
    console.error('[storage] Upload error:', error)
    throw error instanceof Error ? error : new Error('Upload failed')
  }
}

export async function uploadBuffer(
  buffer: Buffer,
  bucket: BucketName,
  filename: string,
  contentType: string,
): Promise<string> {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!validTypes.includes(contentType)) {
    throw new Error('Invalid file type. PNG, JPEG, or WebP only.')
  }

  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error('File too large. Maximum 8MB.')
  }

  try {
    await uploadToStorageWithRetry({
      bucket,
      filename,
      body: buffer,
      contentType,
      upsert: false,
    })
  } catch (error) {
    console.error('[storage] Upload buffer error:', error)
    throw new Error(`Upload failed: ${storageErrorMessage(error)}`)
  }

  const {
    data: { publicUrl },
  } = getSupabase().storage.from(bucket).getPublicUrl(filename)

  return publicUrl
}

/**
 * Delete a file from Supabase Storage
 * Extracted from URL
 */
export async function deleteFile(url: string): Promise<void> {
  try {
    // Extract bucket and filename from URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const bucket = pathParts[pathParts.indexOf('storage') + 2] as BucketName
    const filename = pathParts.slice(pathParts.indexOf('storage') + 3).join('/')

    await getSupabase().storage.from(bucket).remove([filename])

  } catch (error) {
    console.error('[storage] Delete error:', error)
    // Don't throw - deletion failure shouldn't block updates
  }
}

/**
 * Get public URL for a file
 */
export async function getPublicUrl(bucket: BucketName, filename: string): Promise<string> {
  const {
    data: { publicUrl },
  } = getSupabase().storage.from(bucket).getPublicUrl(filename)
  return publicUrl
}
