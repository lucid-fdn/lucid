import 'server-only'

import { ImageGenerationError } from './errors'
import {
  mimeTypeForImageFormat,
  resolveImageBackground,
  resolveImageOutputFormat,
  resolveImageQuality,
  resolveImageSize,
} from './normalize'
import type {
  ImageGenerationProgressEvent,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProviderCandidate,
} from './types'

type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: string
    revised_prompt?: string
    url?: string
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    input_tokens_details?: {
      image_tokens?: number
      text_tokens?: number
    }
  }
}

type SseImageEvent = { event?: string; data: string }

const DEFAULT_REFERENCE_IMAGE_MAX_BYTES = 900 * 1024
const PROVIDER_NETWORK_RETRY_COUNT = 1

function imagesUrl(baseUrl: string, path: 'generations' | 'edits'): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  const versioned = normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
  return `${versioned}/images/${path}`
}

function configuredReferenceImageMaxBytes(): number {
  const configured = Number(process.env.AI_IMAGE_REFERENCE_MAX_BYTES)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFERENCE_IMAGE_MAX_BYTES
}

function sniffImageMimeType(bytes: Uint8Array, fallback: ReturnType<typeof mimeTypeForImageFormat>) {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return fallback
}

function extensionForMimeType(mimeType: string): 'png' | 'jpg' | 'webp' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  return 'webp'
}

function providerErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string' &&
    payload.error.trim()
  ) {
    return payload.error
  }
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error &&
    typeof payload.error === 'object' &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message
  }
  if (typeof payload === 'string' && payload.trim()) return payload
  return fallback
}

function normalizeProviderError(input: {
  status: number
  payload: unknown
  fallback: string
}): ImageGenerationError {
  const message = providerErrorMessage(input.payload, input.fallback)
  if (/billing hard limit|quota|insufficient_quota|credit balance|spending limit/i.test(message)) {
    return new ImageGenerationError(
      'provider_quota_exceeded',
      'Image provider quota or billing limit reached. Check TrustGate/OpenAI billing, then try again.',
      input.status === 400 ? 402 : input.status,
      input.payload,
    )
  }

  return new ImageGenerationError('provider_unavailable', message, input.status, input.payload)
}

function parseJsonPayload(rawPayload: string): OpenAIImageResponse & { error?: { message?: string } } | null {
  if (!rawPayload) return null
  try {
    return JSON.parse(rawPayload) as OpenAIImageResponse & { error?: { message?: string } }
  } catch {
    return null
  }
}

async function parseImageResponse(res: Response): Promise<OpenAIImageResponse> {
  const rawPayload = await res.text().catch(() => '')
  const payload = parseJsonPayload(rawPayload)
  const parsedPayload = payload ?? rawPayload

  if (!res.ok) {
    if (res.status === 404) {
      throw new ImageGenerationError(
        'capability_unavailable',
        'Image generation is unavailable in this deployment.',
        404,
        parsedPayload,
      )
    }
    throw normalizeProviderError({
      status: res.status,
      payload: parsedPayload,
      fallback: `Image generation failed (${res.status})`,
    })
  }

  if (!payload?.data?.length) {
    throw new ImageGenerationError('provider_unavailable', 'Image generation returned no image data.', 502, parsedPayload)
  }

  return payload
}

function parseSseEvents(chunk: string): SseImageEvent[] {
  const events: SseImageEvent[] = []

  for (const block of chunk.split(/\n\n+/)) {
    const lines = block.split(/\r?\n/)
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')

    if (data) events.push(event ? { event, data } : { data })
  }

  return events
}

function normalizeProgressEvent(payload: Record<string, unknown>): ImageGenerationProgressEvent | null {
  const type = typeof payload.type === 'string' ? payload.type : ''
  const b64Json = typeof payload.b64_json === 'string'
    ? payload.b64_json
    : typeof payload.partial_image_b64 === 'string'
      ? payload.partial_image_b64
      : undefined
  const partialImageIndex = typeof payload.partial_image_index === 'number'
    ? payload.partial_image_index
    : undefined
  const base = {
    b64Json,
    partialImageIndex,
    size: typeof payload.size === 'string' ? payload.size : undefined,
    quality: typeof payload.quality === 'string' ? payload.quality : undefined,
    background: typeof payload.background === 'string' ? payload.background : undefined,
    outputFormat: typeof payload.output_format === 'string' ? payload.output_format : undefined,
    createdAt: typeof payload.created_at === 'number' ? payload.created_at : undefined,
    raw: payload,
  }

  if (type.endsWith('.partial_image') || type === 'response.image_generation_call.partial_image') {
    return { type: 'partial_image', ...base }
  }
  if (type.endsWith('.completed') || type === 'response.image_generation_call.completed') {
    return { type: 'completed', ...base }
  }
  return null
}

async function parseImageStreamResponse(input: {
  res: Response
  onProgress?: ImageGenerationRequest['onProgress']
}): Promise<OpenAIImageResponse> {
  const contentType = input.res.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    return parseImageResponse(input.res)
  }

  if (!input.res.ok) {
    const payload = await input.res.text().catch(() => '')
    if (input.res.status === 404) {
      throw new ImageGenerationError(
        'capability_unavailable',
        'Image generation is unavailable in this deployment.',
        404,
        { payload },
      )
    }
    throw normalizeProviderError({
      status: input.res.status,
      payload,
      fallback: `Image generation failed (${input.res.status})`,
    })
  }

  if (!input.res.body) {
    throw new ImageGenerationError('provider_unavailable', 'Image generation stream returned no body.', 502)
  }

  const reader = input.res.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let finalEvent: Record<string, unknown> | null = null

  async function handleBlock(block: string): Promise<void> {
    for (const event of parseSseEvents(block)) {
      if (event.data === '[DONE]') continue
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>
      } catch {
        continue
      }
      const progress = normalizeProgressEvent(payload)
      if (!progress) continue
      if (progress.type === 'completed') finalEvent = payload
      await input.onProgress?.(progress)
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    buffered += decoder.decode(value, { stream: !done })
    const parts = buffered.split(/\n\n+/)
    buffered = parts.pop() ?? ''
    for (const part of parts) {
      if (part.trim()) await handleBlock(part)
    }
    if (done) break
  }
  if (buffered.trim()) await handleBlock(buffered)

  const completedEvent = finalEvent as Record<string, unknown> | null
  const b64Json = typeof completedEvent?.b64_json === 'string'
    ? completedEvent.b64_json
    : typeof completedEvent?.partial_image_b64 === 'string'
      ? completedEvent.partial_image_b64
      : undefined

  if (!b64Json) {
    throw new ImageGenerationError('provider_unavailable', 'Image generation stream returned no final image.', 502)
  }

  return {
    data: [{ b64_json: b64Json }],
    usage: completedEvent?.usage as OpenAIImageResponse['usage'],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function shouldFallbackFromStream(error: unknown): boolean {
  if (!(error instanceof ImageGenerationError)) return false
  if (error.code === 'capability_unavailable') return false
  if (error.code === 'provider_quota_exceeded') return false
  return error.code === 'provider_unavailable'
}

async function fetchProviderEndpoint(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt <= PROVIDER_NETWORK_RETRY_COUNT; attempt += 1) {
    try {
      return await fetch(url, init)
    } catch (error) {
      lastError = error
      if (attempt < PROVIDER_NETWORK_RETRY_COUNT) {
        await new Promise((resolve) => setTimeout(resolve, 750))
      }
    }
  }

  throw new ImageGenerationError(
    'provider_unavailable',
    `Image provider request failed while ${operation}.`,
    502,
    { cause: errorMessage(lastError) },
  )
}

async function fetchReferenceUrl(referenceUrl: string): Promise<Response> {
  try {
    return await fetch(referenceUrl)
  } catch (error) {
    throw new ImageGenerationError(
      'invalid_reference_image',
      'Reference avatar could not be fetched for identity-preserving regeneration.',
      400,
      { referenceUrl, cause: errorMessage(error) },
    )
  }
}

async function fetchGeneratedImageUrl(imageUrl: string): Promise<Response> {
  try {
    return await fetch(imageUrl)
  } catch (error) {
    throw new ImageGenerationError(
      'provider_unavailable',
      'Generated image URL could not be fetched.',
      502,
      { imageUrl, cause: errorMessage(error) },
    )
  }
}

async function resultFromResponse(input: {
  response: OpenAIImageResponse
  candidate: ImageProviderCandidate
  latencyMs: number
  outputFormat: ReturnType<typeof resolveImageOutputFormat>
  size: string
  quality: string
}): Promise<ImageGenerationResult> {
  const image = input.response.data?.[0]
  const b64 = image?.b64_json
  let bytes: Uint8Array

  if (b64) {
    bytes = Buffer.from(b64, 'base64')
  } else if (image?.url) {
    const imageRes = await fetchGeneratedImageUrl(image.url)
    if (!imageRes.ok) {
      throw new ImageGenerationError('provider_unavailable', 'Generated image URL could not be fetched.', 502)
    }
    bytes = new Uint8Array(await imageRes.arrayBuffer())
  } else {
    throw new ImageGenerationError('provider_unavailable', 'Image generation returned no usable image payload.', 502)
  }

  return {
    provider: input.candidate.provider,
    model: input.candidate.model,
    imageBytes: bytes,
    mimeType: sniffImageMimeType(bytes, mimeTypeForImageFormat(input.outputFormat)),
    revisedPrompt: image?.revised_prompt,
    usage: input.response.usage
      ? {
          inputTokens: input.response.usage.input_tokens,
          outputTokens: input.response.usage.output_tokens,
          totalTokens: input.response.usage.total_tokens,
          imageTokens: input.response.usage.input_tokens_details?.image_tokens,
          textTokens: input.response.usage.input_tokens_details?.text_tokens,
        }
      : undefined,
    receipt: {
      latencyMs: input.latencyMs,
      size: input.size,
      quality: input.quality,
      outputFormat: input.outputFormat,
    },
  }
}

export async function generateOpenAICompatibleImage(
  candidate: ImageProviderCandidate,
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const startedAt = Date.now()
  const size = resolveImageSize(request.size)
  const quality = resolveImageQuality(request.quality)
  const outputFormat = resolveImageOutputFormat(request.outputFormat)
  const background = resolveImageBackground(request.background)
  const url = imagesUrl(candidate.baseUrl, 'generations')

  async function requestImage(streamProgress: boolean): Promise<OpenAIImageResponse> {
    const res = await fetchProviderEndpoint(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: candidate.model,
        prompt: request.prompt,
        n: 1,
        size,
        quality,
        output_format: outputFormat,
        background,
        ...(streamProgress ? {
          stream: true,
          partial_images: Math.max(0, Math.min(request.partialImages ?? 3, 3)),
        } : {}),
      }),
    }, 'generating an image')

    return streamProgress
      ? parseImageStreamResponse({ res, onProgress: request.onProgress })
      : parseImageResponse(res)
  }

  let response: OpenAIImageResponse
  if (request.streamProgress) {
    try {
      response = await requestImage(true)
    } catch (error) {
      if (!shouldFallbackFromStream(error)) throw error
      response = await requestImage(false)
    }
  } else {
    response = await requestImage(false)
  }
  return resultFromResponse({
    response,
    candidate,
    latencyMs: Date.now() - startedAt,
    outputFormat,
    size,
    quality,
  })
}

async function fetchReferenceBlob(referenceUrl: string): Promise<Blob> {
  const res = await fetchReferenceUrl(referenceUrl)
  if (!res.ok) {
    throw new ImageGenerationError('invalid_reference_image', 'Reference image could not be fetched.', 400)
  }
  const contentType = res.headers.get('content-type') || 'image/png'
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length <= configuredReferenceImageMaxBytes()) {
    return new Blob([new Uint8Array(bytes)], { type: contentType })
  }

  const sharp = (await import('sharp')).default
  let normalized = await sharp(bytes)
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()

  if (normalized.length > configuredReferenceImageMaxBytes()) {
    normalized = await sharp(bytes)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74 })
      .toBuffer()
  }

  return new Blob([new Uint8Array(normalized)], { type: 'image/webp' })
}

export async function editOpenAICompatibleImage(
  candidate: ImageProviderCandidate,
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const startedAt = Date.now()
  const size = resolveImageSize(request.size)
  const quality = resolveImageQuality(request.quality)
  const outputFormat = resolveImageOutputFormat(request.outputFormat)
  const background = resolveImageBackground(request.background)
  const references = request.referenceImages?.filter((reference) => reference.url) ?? []

  if (references.length === 0) {
    return generateOpenAICompatibleImage(candidate, request)
  }

  const referenceBlobs = await Promise.all(references.map(async (reference) => fetchReferenceBlob(reference.url!)))
  const url = imagesUrl(candidate.baseUrl, 'edits')

  function buildFormData(streamProgress: boolean): FormData {
    const formData = new FormData()
    formData.set('model', candidate.model)
    formData.set('prompt', request.prompt)
    formData.set('size', size)
    formData.set('quality', quality)
    formData.set('output_format', outputFormat)
    formData.set('background', background)
    if (streamProgress) {
      formData.set('stream', 'true')
      formData.set('partial_images', String(Math.max(0, Math.min(request.partialImages ?? 3, 3))))
    }

    for (const [index, blob] of referenceBlobs.entries()) {
      formData.append('image[]', blob, `reference-${index}.${extensionForMimeType(blob.type)}`)
    }
    return formData
  }

  async function requestImage(streamProgress: boolean): Promise<OpenAIImageResponse> {
    const res = await fetchProviderEndpoint(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.apiKey}`,
      },
      body: buildFormData(streamProgress),
    }, 'editing an image')

    return streamProgress
      ? parseImageStreamResponse({ res, onProgress: request.onProgress })
      : parseImageResponse(res)
  }

  let response: OpenAIImageResponse
  if (request.streamProgress) {
    try {
      response = await requestImage(true)
    } catch (error) {
      if (!shouldFallbackFromStream(error)) throw error
      response = await requestImage(false)
    }
  } else {
    response = await requestImage(false)
  }
  return resultFromResponse({
    response,
    candidate,
    latencyMs: Date.now() - startedAt,
    outputFormat,
    size,
    quality,
  })
}
