import type { FrontendBuildBrief } from '@contracts/app-service'

export interface FrontendGenerationRequest {
  generationRunId: string
  appDeploymentId?: string
  brief: FrontendBuildBrief
  idempotencyKey?: string
}

export interface FrontendGenerationResult {
  provider: 'v0' | 'mock'
  providerProjectId?: string
  providerChatId?: string
  providerVersionId?: string
  providerDeploymentId?: string
  previewUrl?: string
  webUrl?: string
  metadata?: Record<string, unknown>
}

export interface FrontendProvider {
  readonly id: FrontendGenerationResult['provider']
  startGeneration(request: FrontendGenerationRequest): Promise<FrontendGenerationResult>
  refineGeneration(request: FrontendGenerationRequest & {
    instruction: string
    providerChatId?: string
  }): Promise<FrontendGenerationResult>
}
