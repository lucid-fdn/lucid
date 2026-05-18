import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/deployment-mode', () => ({
  getL2BaseUrl: vi.fn(() => 'https://l2.lucid.foundation'),
}))

describe('l2RuntimeMaintenanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    process.env.LUCID_L2_API_KEY = 'test-key'
    delete process.env.RAILWAY_API_TOKEN
    delete process.env.RAILWAY_TOKEN
    delete process.env.RAILWAY_AGENT_DEPLOYMENT_PROJECT_ID
  })

  it('deploys Railway runtimes from current service source when image drift is detected', async () => {
    const fetchMock = vi.mocked(fetch)
    process.env.RAILWAY_API_TOKEN = 'railway-token'

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              service: {
                id: 'svc-1',
                project: {
                  id: 'proj-1',
                  environments: {
                    edges: [
                      { node: { id: 'env-prod', name: 'production' } },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { serviceInstanceUpdate: true } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              serviceInstanceDeployV2: 'dep-new',
            },
          }),
          { status: 200 },
        ),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-1',
        displayName: 'Test runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'svc-1',
        l2PassportId: 'passport-1',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'hermes',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      {
        action: 'redeploy',
        envVars: { LUCID_RUNTIME_ID: 'rt-1' },
        targetImageRef: 'ghcr.io/daishizensensei/worker:new',
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://backboard.railway.app/graphql/v2',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer railway-token',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://backboard.railway.app/graphql/v2',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('serviceInstanceDeployV2'),
      }),
    )
    expect(result.status).toBe('queued')
    expect(result.operationId).toBe('dep-new')
    expect(result.detail?.mode).toBe('railway-source-deploy')
  })

  it('falls back to project service lookup when l2DeploymentId is not a Railway service id', async () => {
    const fetchMock = vi.mocked(fetch)
    process.env.RAILWAY_API_TOKEN = 'railway-token'
    process.env.RAILWAY_AGENT_DEPLOYMENT_PROJECT_ID = 'proj-1'

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              service: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              project: {
                id: 'proj-1',
                environments: {
                  edges: [{ node: { id: 'env-prod', name: 'production' } }],
                },
                services: {
                  edges: [{ node: { id: 'svc-passport', name: 'agent-passport_abc123def45' } }],
                },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { serviceInstanceUpdate: true } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              serviceInstanceDeployV2: 'dep-fallback',
            },
          }),
          { status: 200 },
        ),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-2',
        displayName: 'Fallback runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'l2-deploy-id',
        l2PassportId: 'passport_abc123def456789',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'openclaw',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      {
        action: 'redeploy',
        envVars: { LUCID_RUNTIME_ID: 'rt-2' },
        targetImageRef: 'ghcr.io/daishizensensei/worker:new',
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://backboard.railway.app/graphql/v2',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('RuntimeProjectServices'),
      }),
    )
    expect(result.operationId).toBe('dep-fallback')
    expect(result.status).toBe('queued')
  })

  it('falls back to L2 redeploy when Railway source deploy is unavailable', async () => {
    const fetchMock = vi.mocked(fetch)
    process.env.RAILWAY_API_TOKEN = 'railway-token'

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ message: 'Not Authorized' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, status: 'queued', operation_id: 'op-fallback' }),
          { status: 200 },
        ),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-1',
        displayName: 'Test runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'dep-1',
        l2PassportId: 'passport-1',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'hermes',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      {
        action: 'redeploy',
        envVars: { LUCID_RUNTIME_ID: 'rt-1' },
        targetImageRef: 'ghcr.io/daishizensensei/worker:new',
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://l2.lucid.foundation/v1/agents/passport-1/redeploy',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.status).toBe('queued')
    expect(result.detail?.railwayDirectError).toBe('Not Authorized')
  })

  it('propagates nested L2 provider redeploy failures', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            success: false,
            deployment_id: 'dep-1',
            status: 'failed',
          },
        }),
        { status: 200 },
      ),
    )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-1',
        displayName: 'Test runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'dep-1',
        l2PassportId: 'passport-1',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'hermes',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      { action: 'redeploy' },
    )

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.detail?.providerResult).toEqual({
      success: false,
      deployment_id: 'dep-1',
      status: 'failed',
    })
  })

  it('reconciles env before redeploy', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'queued', operation_id: 'op-1' }), {
          status: 200,
        }),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-1',
        displayName: 'Test runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'dep-1',
        l2PassportId: 'passport-1',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'openclaw',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      {
        action: 'redeploy',
        envVars: { LUCID_RUNTIME_ID: 'rt-1', LUCID_CONTROL_PLANE_URL: 'https://www.lucid.foundation' },
        targetImageRef: 'ghcr.io/daishizensensei/worker:next',
        targetImageDigest: 'sha256:next',
      },
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://l2.lucid.foundation/v1/agents/passport-1/env',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          vars: {
            LUCID_RUNTIME_ID: 'rt-1',
            LUCID_CONTROL_PLANE_URL: 'https://www.lucid.foundation',
          },
          controlPlaneRef: {
            provider: 'railway',
            providerDeploymentId: 'dep-1',
            deploymentUrl: 'https://runtime.example.com',
          },
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://l2.lucid.foundation/v1/agents/passport-1/redeploy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          controlPlaneRef: {
            provider: 'railway',
            providerDeploymentId: 'dep-1',
            deploymentUrl: 'https://runtime.example.com',
          },
          image: 'ghcr.io/daishizensensei/worker:next',
          imageDigest: 'sha256:next',
          targetImageRef: 'ghcr.io/daishizensensei/worker:next',
          targetImageDigest: 'sha256:next',
        }),
      }),
    )
    expect(result.detail?.envSync).toEqual({ status: 'updated' })
  })

  it('continues redeploy when env update is unsupported', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unsupported' }), { status: 501 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'queued', operation_id: 'op-2' }), {
          status: 200,
        }),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const result = await l2RuntimeMaintenanceProvider.execute(
      {
        id: 'rt-1',
        displayName: 'Test runtime',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtimeTier: 'dedicated',
        runtimeFlavor: 'c1_managed',
        channelOwnership: 'lucid_relay',
        runtimeProtocol: 'lucid-runtime-v1',
        lastSeenAt: null,
        openclawVersion: null,
        engineVersion: null,
        runtimeVersion: null,
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        gpuPercent: null,
        workerPendingEvents: 0,
        workerDeadLetters: 0,
        agentCount: 0,
        deploymentUrl: 'https://runtime.example.com',
        l2DeploymentId: 'dep-1',
        l2PassportId: 'passport-1',
        lastL2Status: null,
        lastL2Error: null,
        lastL2CheckedAt: null,
        managedByLucid: true,
        maintenanceChannel: 'stable',
        autoUpdatePolicy: 'manual',
        currentImageRef: null,
        currentImageDigest: null,
        targetImageRef: null,
        lastSuccessfulImageRef: null,
        lastMaintenanceAction: null,
        lastMaintenanceAt: null,
        lastMaintenanceError: null,
        createdAt: '2026-04-13T00:00:00Z',
        engine: 'openclaw',
        channelMode: 'relay',
        dedicatedTransportMode: 'relay',
      },
      {
        action: 'redeploy',
        envVars: { LUCID_RUNTIME_ID: 'rt-1' },
      },
    )

    expect(result.detail?.envSync).toEqual({ status: 'unsupported' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('supports restart using the same reconcile-and-redeploy flow', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'queued', operation_id: 'op-3' }), {
          status: 200,
        }),
      )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const runtime = {
      id: 'rt-1',
      displayName: 'Test runtime',
      description: null,
      provider: 'railway',
      status: 'connected',
      runtimeTier: 'dedicated',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
      runtimeProtocol: 'lucid-runtime-v1',
      lastSeenAt: null,
      openclawVersion: null,
      engineVersion: null,
      runtimeVersion: null,
      cpuPercent: null,
      ramPercent: null,
      diskPercent: null,
      gpuPercent: null,
      workerPendingEvents: 0,
      workerDeadLetters: 0,
      agentCount: 0,
      deploymentUrl: 'https://runtime.example.com',
      l2DeploymentId: 'dep-1',
      l2PassportId: 'passport-1',
      lastL2Status: null,
      lastL2Error: null,
      lastL2CheckedAt: null,
      managedByLucid: true,
      maintenanceChannel: 'stable',
      autoUpdatePolicy: 'manual',
      currentImageRef: null,
      currentImageDigest: null,
      targetImageRef: null,
      lastSuccessfulImageRef: null,
      lastMaintenanceAction: null,
      lastMaintenanceAt: null,
      lastMaintenanceError: null,
      createdAt: '2026-04-13T00:00:00Z',
      engine: 'openclaw',
      channelMode: 'relay',
      dedicatedTransportMode: 'relay',
    } as const

    expect(l2RuntimeMaintenanceProvider.supports(runtime, { action: 'restart' })).toBe(true)

    const result = await l2RuntimeMaintenanceProvider.execute(runtime, {
      action: 'restart',
      envVars: { LUCID_RUNTIME_ID: 'rt-1' },
    })

    expect(result.action).toBe('restart')
    expect(result.detail?.envSync).toEqual({ status: 'updated' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://l2.lucid.foundation/v1/agents/passport-1/redeploy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          controlPlaneRef: {
            provider: 'railway',
            providerDeploymentId: 'dep-1',
            deploymentUrl: 'https://runtime.example.com',
          },
        }),
      }),
    )
  })

  it('supports env-only reconcile for existing managed runtimes', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    const { l2RuntimeMaintenanceProvider } = await import('./l2')
    const runtime = {
      id: 'rt-1',
      displayName: 'Test runtime',
      description: null,
      provider: 'railway',
      status: 'connected',
      runtimeTier: 'dedicated',
      runtimeFlavor: 'c1_managed',
      channelOwnership: 'lucid_relay',
      runtimeProtocol: 'lucid-runtime-v1',
      lastSeenAt: null,
      openclawVersion: null,
      engineVersion: null,
      runtimeVersion: null,
      cpuPercent: null,
      ramPercent: null,
      diskPercent: null,
      gpuPercent: null,
      workerPendingEvents: 0,
      workerDeadLetters: 0,
      agentCount: 0,
      deploymentUrl: 'https://runtime.example.com',
      l2DeploymentId: 'dep-1',
      l2PassportId: 'passport-1',
      lastL2Status: null,
      lastL2Error: null,
      lastL2CheckedAt: null,
      managedByLucid: true,
      maintenanceChannel: 'stable',
      autoUpdatePolicy: 'manual',
      currentImageRef: null,
      currentImageDigest: null,
      targetImageRef: null,
      lastSuccessfulImageRef: null,
      lastMaintenanceAction: null,
      lastMaintenanceAt: null,
      lastMaintenanceError: null,
      createdAt: '2026-04-13T00:00:00Z',
      engine: 'openclaw',
      channelMode: 'relay',
      dedicatedTransportMode: 'relay',
    } as const

    const result = await l2RuntimeMaintenanceProvider.execute(runtime, {
      action: 'reconcile',
      envVars: { LUCID_RUNTIME_ID: 'rt-1' },
    })

    expect(result.action).toBe('reconcile')
    expect(result.status).toBe('succeeded')
    expect(result.detail?.envSync).toEqual({ status: 'updated' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://l2.lucid.foundation/v1/agents/passport-1/env',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          vars: { LUCID_RUNTIME_ID: 'rt-1' },
          controlPlaneRef: {
            provider: 'railway',
            providerDeploymentId: 'dep-1',
            deploymentUrl: 'https://runtime.example.com',
          },
        }),
      }),
    )
  })
})
