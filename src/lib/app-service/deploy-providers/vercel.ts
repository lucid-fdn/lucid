import { z } from 'zod'
import { AppServiceError } from '../errors'
import { assertAppServiceSurfaceEnabled } from '../feature-gates'
import { runProviderRequestWithResilience } from '../provider-resilience'
import { assertAppServiceStartupEnvReady } from '../startup-env'
import type { AppDeployProvider, AppDeployRequest, AppDeployResult } from './types'

function assertVercelConfigured() {
  if (!process.env.VERCEL_API_TOKEN && !process.env.VERCEL_TOKEN) {
    throw new AppServiceError('provider_unavailable', 'VERCEL_API_TOKEN or VERCEL_TOKEN is not configured.', 503, {
      retryable: true,
    })
  }
}

const VercelSourceFileSchema = z.object({
  file: z.string().min(1),
  data: z.string(),
})

const VercelDeploymentResponseSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  readyState: z.string().optional(),
  inspectorUrl: z.string().optional(),
}).passthrough()

function shouldUseMockVercel(): boolean {
  return process.env.APP_SERVICE_PROVIDER_MODE === 'mock' || process.env.APP_SERVICE_VERCEL_PROVIDER_MODE === 'mock'
}

function getVercelApiBaseUrl(): string {
  return (process.env.VERCEL_API_BASE_URL || 'https://api.vercel.com').replace(/\/+$/, '')
}

function getVercelRequestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.VERCEL_DEPLOY_REQUEST_TIMEOUT_MS || '60000', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000
}

function mapVercelStatus(readyState?: string): AppDeployResult['status'] {
  if (readyState === 'READY') return 'ready'
  if (readyState === 'ERROR') return 'failed'
  if (readyState === 'QUEUED') return 'queued'
  return 'building'
}

export class VercelDeployProvider implements AppDeployProvider {
  readonly id = 'vercel' as const

  async deploy(request: AppDeployRequest): Promise<AppDeployResult> {
    assertAppServiceSurfaceEnabled('vercel')
    if (shouldUseMockVercel()) {
      return {
        provider: 'vercel',
        externalDeploymentId: `mock-vercel-deployment-${request.appDeploymentId}`,
        url: `https://mock-${request.appDeploymentId}.vercel.app`,
        status: 'ready',
        metadata: { mode: 'mock' },
      }
    }

    assertAppServiceStartupEnvReady()
    assertVercelConfigured()

    const files = z.array(VercelSourceFileSchema).min(1).parse(request.metadata?.files)
    const projectName = typeof request.metadata?.projectName === 'string'
      ? request.metadata.projectName
      : `lucid-app-${request.appDeploymentId}`

    const url = new URL('/v13/deployments', getVercelApiBaseUrl())
    const teamId = process.env.VERCEL_TEAM_ID
    if (teamId) url.searchParams.set('teamId', teamId)

    const parsed = await runProviderRequestWithResilience({
      provider: 'vercel',
      operation: 'POST /v13/deployments',
      execute: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), getVercelRequestTimeoutMs())
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              name: projectName,
              project: projectName,
              target: request.environment === 'production' ? 'production' : undefined,
              files,
              projectSettings: {
                framework: 'nextjs',
                buildCommand: 'npm run build',
                installCommand: 'npm install',
              },
              meta: {
                lucid_app_deployment_id: request.appDeploymentId,
                lucid_artifact_id: request.artifactId,
              },
            }),
            signal: controller.signal,
          })

          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            throw new AppServiceError(
              response.status === 429 ? 'rate_limited' : 'provider_unavailable',
              `Vercel deployment failed with status ${response.status}.`,
              response.status === 429 ? 429 : 502,
              {
                retryable: response.status === 429 || response.status >= 500,
                details: { provider: 'vercel', status: response.status, payload },
              },
            )
          }

          return VercelDeploymentResponseSchema.parse(payload)
        } catch (error) {
          if (error instanceof AppServiceError) throw error
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AppServiceError('provider_unavailable', 'Vercel deployment request timed out.', 504, {
              retryable: true,
              details: { provider: 'vercel' },
            })
          }
          throw error
        } finally {
          clearTimeout(timeout)
        }
      },
    })

    return {
      provider: 'vercel',
      externalDeploymentId: parsed.id,
      url: parsed.url ? `https://${parsed.url.replace(/^https?:\/\//, '')}` : undefined,
      status: mapVercelStatus(parsed.readyState),
      metadata: parsed,
    }
  }
}

export const vercelDeployProvider = new VercelDeployProvider()
