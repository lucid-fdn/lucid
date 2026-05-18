import 'server-only'

export type ImageProviderName = 'trustgate' | 'openai'
export type ImageProviderMode = 'auto' | ImageProviderName
export type ImageGenerationMode = 'generate' | 'edit'
export type ImagePurpose = 'agent-avatar' | 'agent-cover' | 'generic-image' | 'workflow-asset'
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto'
export type ImageOutputFormat = 'png' | 'webp' | 'jpeg'
export type ImageBackground = 'opaque' | 'transparent' | 'auto'

export interface ImageReference {
  url?: string
  assetId?: string
  role: 'identity' | 'style' | 'composition' | 'mask'
}

export interface ImageGenerationRequest {
  purpose: ImagePurpose
  mode: ImageGenerationMode
  prompt: string
  referenceImages?: ImageReference[]
  size?: ImageSize
  quality?: ImageQuality
  outputFormat?: ImageOutputFormat
  background?: ImageBackground
  metadata?: Record<string, unknown>
  streamProgress?: boolean
  partialImages?: number
  onProgress?: (event: ImageGenerationProgressEvent) => Promise<void> | void
}

export interface ImageGenerationProgressEvent {
  type: 'partial_image' | 'completed'
  b64Json?: string
  partialImageIndex?: number
  size?: string
  quality?: string
  background?: string
  outputFormat?: string
  createdAt?: number
  raw?: Record<string, unknown>
}

export interface ImageGenerationUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  imageTokens?: number
  textTokens?: number
}

export interface ImageGenerationReceipt {
  providerRequestId?: string
  latencyMs: number
  size?: string
  quality?: string
  outputFormat?: string
}

export interface ImageGenerationResult {
  provider: ImageProviderName
  model: string
  imageBytes: Uint8Array
  mimeType: 'image/png' | 'image/webp' | 'image/jpeg'
  revisedPrompt?: string
  usage?: ImageGenerationUsage
  receipt: ImageGenerationReceipt
}

export interface ImageProviderCandidate {
  provider: ImageProviderName
  cacheKey: string
  baseUrl: string
  apiKey: string
  model: string
}
