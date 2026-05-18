import { AppServiceError } from '../errors'
import { assertAppServiceSurfaceEnabled } from '../feature-gates'
import { assertAppServiceStartupEnvReady } from '../startup-env'
import type { FrontendGenerationRequest, FrontendGenerationResult, FrontendProvider } from './types'
import { V0RestClient, V0_SYSTEM_PROMPT, buildV0GenerationPrompt } from './v0-client'

function shouldUseMockV0(): boolean {
  return process.env.APP_SERVICE_PROVIDER_MODE === 'mock' || process.env.APP_SERVICE_V0_PROVIDER_MODE === 'mock'
}

function createMockResult(request: FrontendGenerationRequest, instruction?: string): FrontendGenerationResult {
  const suffix = instruction ? 'refine' : 'generate'
  return {
    provider: 'mock',
    providerProjectId: `mock-project-${request.generationRunId}`,
    providerChatId: `mock-chat-${request.generationRunId}`,
    providerVersionId: `mock-version-${suffix}-${Date.now()}`,
    previewUrl: `/apps/${request.brief.app_slug}?provider=mock-v0`,
    webUrl: `/apps/${request.brief.app_slug}?provider=mock-v0`,
    metadata: {
      mode: 'mock',
      instruction,
    },
  }
}

export class V0FrontendProvider implements FrontendProvider {
  readonly id = 'v0' as const

  async startGeneration(request: FrontendGenerationRequest): Promise<FrontendGenerationResult> {
    assertAppServiceSurfaceEnabled('v0')
    if (shouldUseMockV0()) return createMockResult(request)

    assertAppServiceStartupEnvReady()
    const client = new V0RestClient()
    const project = await client.createProject({
      name: request.brief.app_name,
      description: request.brief.purpose,
      instructions: V0_SYSTEM_PROMPT,
      metadata: {
        lucid_generation_run_id: request.generationRunId,
        lucid_app_deployment_id: request.appDeploymentId,
        lucid_app_slug: request.brief.app_slug,
      },
    })

    const chat = await client.createChat({
      projectId: project.id,
      system: V0_SYSTEM_PROMPT,
      message: buildV0GenerationPrompt(request.brief),
      metadata: {
        lucid_generation_run_id: request.generationRunId,
        lucid_app_deployment_id: request.appDeploymentId,
        idempotency_key: request.idempotencyKey,
      },
    })

    const version = chat.latestVersion
    return {
      provider: 'v0',
      providerProjectId: project.id,
      providerChatId: chat.id,
      providerVersionId: version?.id,
      previewUrl: version?.demoUrl,
      webUrl: chat.webUrl || project.webUrl,
      metadata: {
        project,
        chat,
      },
    }
  }

  async refineGeneration(
    request: FrontendGenerationRequest & { instruction: string; providerChatId?: string },
  ): Promise<FrontendGenerationResult> {
    assertAppServiceSurfaceEnabled('v0')
    if (shouldUseMockV0()) return createMockResult(request, request.instruction)

    assertAppServiceStartupEnvReady()
    if (!request.providerChatId) {
      throw new AppServiceError(
        'validation_failed',
        'A v0 chat id is required to refine a frontend generation.',
        400,
      )
    }

    const client = new V0RestClient()
    const chat = await client.sendMessage({
      chatId: request.providerChatId,
      message: request.instruction,
      metadata: {
        lucid_generation_run_id: request.generationRunId,
        lucid_app_deployment_id: request.appDeploymentId,
      },
    })

    return {
      provider: 'v0',
      providerChatId: chat.id,
      providerProjectId: chat.projectId,
      providerVersionId: chat.latestVersion?.id,
      previewUrl: chat.latestVersion?.demoUrl,
      webUrl: chat.webUrl,
      metadata: { chat },
    }
  }
}

export const v0FrontendProvider = new V0FrontendProvider()
