import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  V0_SYSTEM_PROMPT,
  V0RestClient,
  buildV0GenerationPrompt,
  createV0Metadata,
} from '../frontend-providers/v0-client'
import { v0FrontendProvider } from '../frontend-providers/v0'
import { resetProviderCircuitStates } from '../provider-resilience'

const brief = {
  schema_version: '1.0' as const,
  app_name: 'Support Concierge',
  app_slug: 'support-concierge',
  purpose: 'Answer pricing questions.',
  audience: 'Website visitors',
  outcome: 'Qualify support requests',
  frontend: {
    strategy: 'manifest' as const,
    theme: { mode: 'system' as const, radius: 'sm' as const },
    pages: [],
    required_states: [],
  },
  public_api_contract: {
    paths: {
      '/api/app-runtime/v1/public/apps/support-concierge/chat': {},
    },
  },
  sdk_package: '@lucid/app-runtime-sdk',
  forbidden: ['Do not call internal Lucid APIs directly.'],
}

describe('v0 provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetProviderCircuitStates()
    delete process.env.V0_API_KEY
    delete process.env.V0_API_URL
    delete process.env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS
    delete process.env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS
    delete process.env.FEATURE_APP_V0_GENERATION
    delete process.env.APP_SERVICE_PROVIDER_MODE
    delete process.env.APP_SERVICE_V0_PROVIDER_MODE
  })

  it('builds a provider-safe prompt from the frontend brief', () => {
    const prompt = buildV0GenerationPrompt(brief)

    expect(prompt).toContain('FrontendBuildBrief')
    expect(prompt).toContain('@lucid/app-runtime-sdk')
    expect(prompt).toContain('/api/app-runtime/v1/public/apps/support-concierge/chat')
    expect(prompt).toContain('/api/app-runtime/v1/sdk/openapi.json')
    expect(prompt).toContain('/api/app-services')
    expect(prompt).toContain('/api/app-runtime/v1/operator')
    expect(prompt).toContain('Treat generated frontend env vars as public only.')
    expect(V0_SYSTEM_PROMPT).toContain('@lucid/app-runtime-sdk')
    expect(V0_SYSTEM_PROMPT).toContain('/api/provider-keys')
    expect(V0_SYSTEM_PROMPT).toContain('private memory')
  })

  it('normalizes v0 metadata to platform constraints', () => {
    const metadata = createV0Metadata({
      lucid_generation_run_id: 'run_123',
      too_long_key_name_that_exceeds_the_v0_platform_metadata_limit: 'drop',
      nested: { ok: true },
    })

    expect(metadata).toEqual({
      lucid_generation_run_id: 'run_123',
      nested: '{"ok":true}',
    })
  })

  it('creates a v0 project and chat through the REST platform API', async () => {
    process.env.V0_API_KEY = 'v0_test'
    process.env.V0_API_URL = 'https://api.example/v1'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'proj_123', webUrl: 'https://v0.app/p/proj_123' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'chat_123',
        projectId: 'proj_123',
        webUrl: 'https://v0.app/chat/chat_123',
        latestVersion: {
          id: 'ver_123',
          status: 'completed',
          demoUrl: 'https://demo.v0.dev/example',
        },
      })))

    const client = new V0RestClient({ fetchImpl: fetchMock })
    const project = await client.createProject({ name: 'Support Concierge' })
    const chat = await client.createChat({
      projectId: project.id,
      message: 'Generate the frontend.',
    })

    expect(project.id).toBe('proj_123')
    expect(chat.latestVersion?.demoUrl).toBe('https://demo.v0.dev/example')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example/v1/projects',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example/v1/chats',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reads v0 versions with default files and deployment status', async () => {
    process.env.V0_API_KEY = 'v0_test'
    process.env.V0_API_URL = 'https://api.example/v1'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'ver_123',
        status: 'completed',
        demoUrl: 'https://demo.v0.dev/example',
        files: {
          'app/page.tsx': { content: 'export default function Page() { return null }', locked: false },
          'package.json': '{"scripts":{"build":"next build"}}',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'dpl_123',
        projectId: 'proj_123',
        chatId: 'chat_123',
        versionId: 'ver_123',
        webUrl: 'https://example.vercel.app',
        readyState: 'READY',
      })))

    const client = new V0RestClient({ fetchImpl: fetchMock })
    const version = await client.getVersion({
      chatId: 'chat_123',
      versionId: 'ver_123',
      includeDefaultFiles: true,
    })
    const deployment = await client.getDeployment('dpl_123')

    expect(version.files).toEqual([
      expect.objectContaining({ name: 'app/page.tsx', content: expect.stringContaining('Page') }),
      expect.objectContaining({ name: 'package.json', content: expect.stringContaining('next build') }),
    ])
    expect(deployment.readyState).toBe('READY')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example/v1/chats/chat_123/versions/ver_123?includeDefaultFiles=true',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example/v1/deployments/dpl_123',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('reads v0 deployment logs and errors', async () => {
    process.env.V0_API_KEY = 'v0_test'
    process.env.V0_API_URL = 'https://api.example/v1'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        logs: [
          {
            id: 'log_123',
            deploymentId: 'dpl_123',
            text: 'Build started',
            type: 'stdout',
            level: 'info',
          },
        ],
        nextSince: 123456,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'Build failed',
        fullErrorText: 'next build failed',
        errorType: 'build_error',
      })))

    const client = new V0RestClient({ fetchImpl: fetchMock })
    const logs = await client.findDeploymentLogs({ deploymentId: 'dpl_123', since: 100 })
    const errors = await client.findDeploymentErrors('dpl_123')

    expect(logs.logs[0]?.text).toBe('Build started')
    expect(logs.nextSince).toBe(123456)
    expect(errors.errorType).toBe('build_error')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example/v1/deployments/dpl_123/logs?since=100',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example/v1/deployments/dpl_123/errors',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('retries transient v0 provider failures once before returning a result', async () => {
    process.env.V0_API_KEY = 'v0_test'
    process.env.V0_API_URL = 'https://api.example/v1'
    process.env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS = '2'
    process.env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS = '0'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary provider outage' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'proj_123' })))

    const client = new V0RestClient({ fetchImpl: fetchMock })
    const project = await client.createProject({ name: 'Support Concierge' })

    expect(project.id).toBe('proj_123')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry exhausted v0 quota responses', async () => {
    process.env.V0_API_KEY = 'v0_test'
    process.env.V0_API_URL = 'https://api.example/v1'
    process.env.APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS = '3'
    process.env.APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS = '0'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Daily quota exhausted for this account.' }), { status: 429 }),
    )

    const client = new V0RestClient({ fetchImpl: fetchMock })
    await expect(client.createProject({ name: 'Support Concierge' })).rejects.toThrow('Daily quota exhausted')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('supports a local mock provider mode without V0_API_KEY', async () => {
    process.env.FEATURE_APP_V0_GENERATION = 'true'
    process.env.APP_SERVICE_PROVIDER_MODE = 'mock'

    const result = await v0FrontendProvider.startGeneration({
      generationRunId: 'f791d8b0-4ee7-4745-ae7a-fc2e9d2cd1b7',
      brief,
    })

    expect(result.provider).toBe('mock')
    expect(result.providerProjectId).toContain('mock-project')
    expect(result.previewUrl).toBe('/apps/support-concierge?provider=mock-v0')
  })
})
