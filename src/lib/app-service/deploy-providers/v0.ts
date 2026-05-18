import { AppServiceError } from '../errors'
import { assertAppServiceSurfaceEnabled } from '../feature-gates'
import { assertAppServiceStartupEnvReady } from '../startup-env'
import { V0RestClient } from '../frontend-providers/v0-client'
import type { AppDeployProvider, AppDeployRequest, AppDeployResult } from './types'

function shouldUseMockV0(): boolean {
  return process.env.APP_SERVICE_PROVIDER_MODE === 'mock' || process.env.APP_SERVICE_V0_PROVIDER_MODE === 'mock'
}

export class V0DeployProvider implements AppDeployProvider {
  readonly id = 'v0' as const

  async deploy(request: AppDeployRequest): Promise<AppDeployResult> {
    assertAppServiceSurfaceEnabled('v0')
    if (shouldUseMockV0()) {
      return {
        provider: 'v0',
        externalDeploymentId: `mock-v0-deployment-${request.appDeploymentId}`,
        url: `/apps/${request.appDeploymentId}?provider=mock-v0-deploy`,
        status: 'ready',
        metadata: { mode: 'mock' },
      }
    }

    assertAppServiceStartupEnvReady()
    if (!request.providerProjectId || !request.providerChatId || !request.providerVersionId) {
      throw new AppServiceError(
        'validation_failed',
        'v0 deployment requires providerProjectId, providerChatId, and providerVersionId.',
        400,
      )
    }

    const client = new V0RestClient()
    const deployment = await client.createDeployment({
      projectId: request.providerProjectId,
      chatId: request.providerChatId,
      versionId: request.providerVersionId,
    })

    return {
      provider: 'v0',
      externalDeploymentId: deployment.id,
      url: deployment.webUrl,
      status: 'ready',
      metadata: { deployment },
    }
  }
}

export const v0DeployProvider = new V0DeployProvider()
