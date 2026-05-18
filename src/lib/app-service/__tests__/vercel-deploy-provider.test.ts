import { afterEach, describe, expect, it, vi } from 'vitest'
import { vercelDeployProvider } from '../deploy-providers/vercel'
import { resetProviderCircuitStates } from '../provider-resilience'

const deployRequest = {
  appDeploymentId: 'deployment-123',
  artifactId: 'artifact-123',
  target: 'vercel' as const,
  environment: 'preview' as const,
  metadata: {
    projectName: 'lucid-support-concierge',
    files: [
      { file: 'package.json', data: '{"scripts":{"build":"next build"}}' },
      { file: 'app/page.tsx', data: 'export default function Page() { return null }' },
    ],
  },
}

describe('vercel deploy provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetProviderCircuitStates()
    delete process.env.FEATURE_APP_VERCEL_DEPLOY
    delete process.env.APP_SERVICE_PROVIDER_MODE
    delete process.env.APP_SERVICE_VERCEL_PROVIDER_MODE
    delete process.env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS
    delete process.env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS
    delete process.env.VERCEL_API_TOKEN
    delete process.env.VERCEL_TOKEN
    delete process.env.VERCEL_TEAM_ID
    delete process.env.VERCEL_API_BASE_URL
  })

  it('supports local mock mode without Vercel credentials', async () => {
    process.env.FEATURE_APP_VERCEL_DEPLOY = 'true'
    process.env.APP_SERVICE_PROVIDER_MODE = 'mock'

    const result = await vercelDeployProvider.deploy(deployRequest)

    expect(result).toMatchObject({
      provider: 'vercel',
      externalDeploymentId: 'mock-vercel-deployment-deployment-123',
      status: 'ready',
      metadata: { mode: 'mock' },
    })
  })

  it('creates a Vercel deployment with scoped files and project metadata', async () => {
    process.env.FEATURE_APP_VERCEL_DEPLOY = 'true'
    process.env.VERCEL_TOKEN = 'vercel_test'
    process.env.VERCEL_TEAM_ID = 'team_123'
    process.env.VERCEL_API_BASE_URL = 'https://api.example.vercel'

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'dpl_123',
      url: 'lucid-support-concierge.vercel.app',
      readyState: 'READY',
      inspectorUrl: 'https://vercel.com/inspect/dpl_123',
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await vercelDeployProvider.deploy(deployRequest)

    expect(result).toMatchObject({
      provider: 'vercel',
      externalDeploymentId: 'dpl_123',
      url: 'https://lucid-support-concierge.vercel.app',
      status: 'ready',
    })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.example.vercel/v13/deployments?teamId=team_123')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer vercel_test',
        'content-type': 'application/json',
      },
    })

    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      name: 'lucid-support-concierge',
      project: 'lucid-support-concierge',
      projectSettings: {
        framework: 'nextjs',
        buildCommand: 'npm run build',
        installCommand: 'npm install',
      },
      meta: {
        lucid_app_deployment_id: 'deployment-123',
        lucid_artifact_id: 'artifact-123',
      },
    })
    expect(body.files).toEqual(deployRequest.metadata.files)
  })

  it('retries a transient Vercel deployment failure before returning the receipt', async () => {
    process.env.FEATURE_APP_VERCEL_DEPLOY = 'true'
    process.env.VERCEL_TOKEN = 'vercel_test'
    process.env.VERCEL_API_BASE_URL = 'https://api.example.vercel'
    process.env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS = '2'
    process.env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS = '0'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary deploy outage' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'dpl_retry',
        url: 'retry-support-concierge.vercel.app',
        readyState: 'READY',
      })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await vercelDeployProvider.deploy(deployRequest)

    expect(result).toMatchObject({
      provider: 'vercel',
      externalDeploymentId: 'dpl_retry',
      status: 'ready',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed before provider calls when live Vercel credentials are missing', async () => {
    process.env.FEATURE_APP_VERCEL_DEPLOY = 'true'
    process.env.APP_SERVICE_VERCEL_PROVIDER_MODE = 'live'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(vercelDeployProvider.deploy(deployRequest)).rejects.toThrow('App Service Foundry startup environment is not ready.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
