/**
 * Runtime DB Functions — Unit Tests
 *
 * Tests runtime-related DB functions with mocked Supabase.
 * Uses vi.mock hoisting for server-only and DB client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to allow importing in test environment
vi.mock('server-only', () => ({}))

// ─── Chainable Supabase Mock ───

function createChain(resolveWith: { data: unknown; error: unknown } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const fns = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'lt', 'gt', 'gte', 'like', 'in', 'not',
    'order', 'limit', 'match', 'filter', 'or', 'is',
  ]
  for (const fn of fns) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  // Terminal methods resolve
  chain.single = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  // Make the chain itself thennable so await on non-terminal works
  const asPromise = resolveWith ?? { data: null, error: null }
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
    resolve(asPromise)
    return chain
  }
  return chain
}

let mockFromResults: Map<string, ReturnType<typeof createChain>>
let rpcResults: Map<string, { data: unknown; error: unknown }>

const mockFrom = vi.fn((table: string) => {
  return mockFromResults.get(table) ?? createChain()
})
const mockRpc = vi.fn((fn: string, params: unknown) => {
  return Promise.resolve(rpcResults.get(fn) ?? { data: null, error: null })
})

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
    rpc: (...args: unknown[]) => mockRpc(...(args as [string, unknown])),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

// Import AFTER mocks
const mc = await import('../mission-control')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  rpcResults = new Map()
  // Restore default mockFrom implementation (cleared by clearAllMocks)
  mockFrom.mockImplementation((table: string) => {
    return mockFromResults.get(table) ?? createChain()
  })
  mockRpc.mockImplementation((fn: string) => {
    return Promise.resolve(rpcResults.get(fn) ?? { data: null, error: null })
  })
})

// ─── getRuntimes ───

describe('getRuntimes', () => {
  it('queries dedicated_runtimes with correct org_id', async () => {
    const chain = createChain({ data: [], error: null })
    mockFromResults.set('dedicated_runtimes', chain)
    await mc.getRuntimes('org-123')
    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-123')
    expect(chain.neq).toHaveBeenCalledWith('status', 'revoked')
  })

  it('maps snake_case DB rows to camelCase DedicatedRuntime', async () => {
    mockFromResults.set('dedicated_runtimes', createChain({
      data: [
        {
          id: 'rt-1',
          display_name: 'prod-worker',
          description: null,
          provider: 'railway',
          status: 'connected',
          runtime_tier: 'dedicated',
          last_seen_at: '2026-03-22T12:00:00Z',
          openclaw_version: '2.4',
          cpu_percent: 45.5,
          ram_percent: 60.0,
          disk_percent: 30.0,
          gpu_percent: null,
          worker_pending_events: 2,
          worker_dead_letters: 0,
          agent_count: 3,
          deployment_url: 'https://railway.app/xxx',
          l2_deployment_id: 'l2-dep-1',
          runtime_bootstrap_config: {
            migration: {
              source: 'openclaw',
            },
          },
          created_at: '2026-03-20T10:00:00Z',
        },
      ],
      error: null,
    }))

    const result = await mc.getRuntimes('org-123')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'rt-1',
      displayName: 'prod-worker',
      description: null,
      engine: 'openclaw',
      provider: 'railway',
      status: 'connected',
      runtimeTier: 'dedicated',
      runtimeFlavor: 'c1_managed',
      channelOwnership: null,
      runtimeProtocol: 'lucid-runtime-v1',
      lastSeenAt: '2026-03-22T12:00:00Z',
      openclawVersion: '2.4',
      engineVersion: null,
      runtimeVersion: null,
      cpuPercent: 45.5,
      ramPercent: 60,
      diskPercent: 30,
      gpuPercent: null,
      workerPendingEvents: 2,
      workerDeadLetters: 0,
      agentCount: 3,
      deploymentUrl: 'https://railway.app/xxx',
      l2DeploymentId: 'l2-dep-1',
      l2PassportId: null,
      lastL2Status: null,
      lastL2Error: null,
      lastL2CheckedAt: null,
      runtimeBootstrapConfig: { migration: { source: 'openclaw' } },
      migrationConfig: { source: 'openclaw' },
      channelMode: null,
      nativeChannels: null,
      pendingActions: null,
      systemInfo: null,
      createdAt: '2026-03-20T10:00:00Z',
    })
  })

  it('returns empty array on error', async () => {
    mockFromResults.set('dedicated_runtimes', createChain({ data: null, error: { message: 'DB error' } }))
    const result = await mc.getRuntimes('org-123')
    expect(result).toEqual([])
  })

  it('handles null metric values correctly', async () => {
    mockFromResults.set('dedicated_runtimes', createChain({
      data: [
        {
          id: 'rt-2',
          display_name: 'staging',
          description: null,
          provider: 'docker',
          status: 'offline',
          last_seen_at: null,
          openclaw_version: null,
          cpu_percent: null,
          ram_percent: null,
          disk_percent: null,
          gpu_percent: null,
          worker_pending_events: 0,
          worker_dead_letters: 0,
          agent_count: 0,
          deployment_url: null,
          l2_deployment_id: null,
          created_at: '2026-03-20T10:00:00Z',
        },
      ],
      error: null,
    }))

    const result = await mc.getRuntimes('org-123')
    expect(result[0].cpuPercent).toBeNull()
    expect(result[0].ramPercent).toBeNull()
    expect(result[0].lastSeenAt).toBeNull()
  })
})

// ─── getRuntimeById ───

describe('getRuntimeById', () => {
  it('queries with correct filters', async () => {
    const chain = createChain({
      data: {
        id: 'rt-1', display_name: 'prod', description: null, provider: 'railway',
        status: 'connected', last_seen_at: '2026-03-22T12:00:00Z', openclaw_version: '2.4',
        cpu_percent: 45, ram_percent: 60, disk_percent: 30, gpu_percent: null,
        worker_pending_events: 0, worker_dead_letters: 0, agent_count: 3,
        deployment_url: null, l2_deployment_id: null, created_at: '2026-03-20T10:00:00Z',
      },
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.getRuntimeById('rt-1', 'org-123')
    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    expect(result).not.toBeNull()
    expect(result!.displayName).toBe('prod')
  })

  it('returns null when not found (PGRST116)', async () => {
    const chain = createChain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.getRuntimeById('nonexistent', 'org-123')
    expect(result).toBeNull()
  })
})

// ─── createRuntime ───

describe('createRuntime', () => {
  it('inserts runtime and returns id', async () => {
    const chain = createChain({ data: { id: 'new-rt-id' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.createRuntime({
      orgId: 'org-123',
      displayName: 'gpu-worker',
      description: 'Akash GPU runtime',
      provider: 'akash',
      apiKeyHash: 'salt:hash',
    })

    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    expect(result).toEqual({ id: 'new-rt-id' })
  })

  it('returns null on insert error', async () => {
    const chain = createChain({ data: null, error: { message: 'Duplicate' } })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.createRuntime({
      orgId: 'org-123',
      displayName: 'test',
      provider: 'manual',
      apiKeyHash: 'salt:hash',
    })
    expect(result).toBeNull()
  })
})

// ─── revokeRuntime ───

describe('revokeRuntime', () => {
  it('sets status to revoked and unlinks agents', async () => {
    const runtimeChain = createChain({ data: null, error: null })
    const agentChain = createChain({ data: null, error: null })

    // Both tables need different chains, but mockFrom returns based on table name
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      callCount++
      if (table === 'dedicated_runtimes') return runtimeChain
      if (table === 'ai_assistants') return agentChain
      return createChain()
    })

    const result = await mc.revokeRuntime('rt-1', 'org-123')
    expect(result.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    expect(mockFrom).toHaveBeenCalledWith('ai_assistants')
  })
})

// ─── Runtime Maintenance ───

describe('runtime maintenance helpers', () => {
  it('lists maintenance jobs in newest-first order', async () => {
    const chain = createChain({
      data: [
        {
          id: 'job-1',
          runtime_id: 'rt-1',
          org_id: 'org-123',
          provider: 'railway',
          action: 'redeploy',
          status: 'succeeded',
          target_image_ref: null,
          target_image_digest: null,
          provider_operation_id: 'op-1',
          provider_deployment_id: 'dep-1',
          requested_by: 'user-1',
          result_payload: { success: true },
          error: null,
          started_at: '2026-04-12T10:00:00Z',
          completed_at: '2026-04-12T10:01:00Z',
          created_at: '2026-04-12T10:00:00Z',
        },
      ],
      error: null,
    })
    mockFromResults.set('runtime_maintenance_jobs', chain)

    const result = await mc.listRuntimeMaintenanceJobs('rt-1', 'org-123')
    expect(result).toEqual([
      expect.objectContaining({
        id: 'job-1',
        runtimeId: 'rt-1',
        orgId: 'org-123',
        action: 'redeploy',
        status: 'succeeded',
      }),
    ])
  })

  it('creates a maintenance job in queued state', async () => {
    const chain = createChain({
      data: {
        id: 'job-2',
        runtime_id: 'rt-1',
        org_id: 'org-123',
        provider: 'railway',
        action: 'redeploy',
        status: 'queued',
        target_image_ref: null,
        target_image_digest: null,
        provider_operation_id: null,
        provider_deployment_id: null,
        requested_by: 'user-1',
        result_payload: {},
        error: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-04-12T10:00:00Z',
      },
      error: null,
    })
    mockFromResults.set('runtime_maintenance_jobs', chain)

    const result = await mc.createRuntimeMaintenanceJob({
      runtimeId: 'rt-1',
      orgId: 'org-123',
      provider: 'railway',
      action: 'redeploy',
      requestedBy: 'user-1',
    })

    expect(result).toMatchObject({
      id: 'job-2',
      runtimeId: 'rt-1',
      status: 'queued',
    })
  })

  it('marks queued async maintenance as running without advancing current image', async () => {
    const jobChain = createChain({ data: null, error: null })
    const runtimeChain = createChain({ data: null, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'runtime_maintenance_jobs') return jobChain
      if (table === 'dedicated_runtimes') return runtimeChain
      return createChain()
    })

    await mc.updateRuntimeMaintenanceJobProgress({
      jobId: 'job-async',
      runtimeId: 'rt-1',
      orgId: 'org-123',
      action: 'redeploy',
      providerOperationId: 'op-queued',
      providerDeploymentId: 'dep-queued',
      targetImageRef: 'ghcr.io/daishizensensei/worker:new',
      resultPayload: { status: 'queued' },
    })

    expect(jobChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        provider_operation_id: 'op-queued',
        provider_deployment_id: 'dep-queued',
        target_image_ref: 'ghcr.io/daishizensensei/worker:new',
      }),
    )
    expect(runtimeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        target_image_ref: 'ghcr.io/daishizensensei/worker:new',
        last_maintenance_action: 'redeploy',
        last_maintenance_error: null,
      }),
    )
  })

  it('returns maintenance overview from runtime row and jobs', async () => {
    const runtimeChain = createChain({
      data: {
        id: 'rt-1',
        display_name: 'prod',
        description: null,
        provider: 'railway',
        status: 'connected',
        runtime_tier: 'dedicated',
        managed_by_lucid: true,
        maintenance_channel: 'stable',
        auto_update_policy: 'manual',
        current_image_ref: 'ghcr.io/lucid/worker:sha-1',
        current_image_digest: 'sha256:abc',
        target_image_ref: null,
        last_successful_image_ref: 'ghcr.io/lucid/worker:sha-1',
        last_maintenance_action: 'redeploy',
        last_maintenance_at: '2026-04-12T10:01:00Z',
        last_maintenance_error: null,
        last_seen_at: '2026-04-12T10:02:00Z',
        openclaw_version: '2.4',
        cpu_percent: 20,
        ram_percent: 40,
        disk_percent: 30,
        gpu_percent: null,
        worker_pending_events: 0,
        worker_dead_letters: 0,
        agent_count: 1,
        deployment_url: 'https://railway.app/x',
        l2_deployment_id: 'dep-1',
        l2_passport_id: 'pass-1',
        created_at: '2026-04-12T10:00:00Z',
      },
      error: null,
    })
    const jobsChain = createChain({
      data: [
        {
          id: 'job-3',
          runtime_id: 'rt-1',
          org_id: 'org-123',
          provider: 'railway',
          action: 'redeploy',
          status: 'succeeded',
          result_payload: {},
          error: null,
          started_at: '2026-04-12T10:00:00Z',
          completed_at: '2026-04-12T10:01:00Z',
          created_at: '2026-04-12T10:00:00Z',
        },
      ],
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', runtimeChain)
    mockFromResults.set('runtime_maintenance_jobs', jobsChain)

    const result = await mc.getRuntimeMaintenanceState('rt-1', 'org-123')

    expect(result).toMatchObject({
      runtimeId: 'rt-1',
      managedByLucid: true,
      maintenanceChannel: 'stable',
      autoUpdatePolicy: 'manual',
      currentImageRef: 'ghcr.io/lucid/worker:sha-1',
      jobs: [expect.objectContaining({ id: 'job-3', status: 'succeeded' })],
    })
  })
})

// ─── runtime management commands ───

describe('claimRuntimeManagementCommands', () => {
  it('requeues stale sent commands before claiming queued commands', async () => {
    const staleRequeueChain = createChain({ data: null, error: null })
    const selectChain = createChain({
      data: [
        {
          id: 'cmd-1',
          runtime_id: 'rt-1',
          org_id: 'org-1',
          command_type: 'adapter.probe',
          target_capability_id: null,
          payload: {},
          status: 'queued',
          response: null,
          error: null,
          requested_by: null,
          requested_at: '2026-05-07T10:00:00Z',
          dispatched_at: null,
          acknowledged_at: null,
          expires_at: null,
        },
      ],
      error: null,
    })
    const claimChain = createChain({
      data: [
        {
          id: 'cmd-1',
          runtime_id: 'rt-1',
          org_id: 'org-1',
          command_type: 'adapter.probe',
          target_capability_id: null,
          payload: {},
          status: 'sent',
          response: null,
          error: null,
          requested_by: null,
          requested_at: '2026-05-07T10:00:00Z',
          dispatched_at: '2026-05-07T10:01:00Z',
          acknowledged_at: null,
          expires_at: null,
        },
      ],
      error: null,
    })

    mockFrom
      .mockImplementationOnce(() => staleRequeueChain)
      .mockImplementationOnce(() => selectChain)
      .mockImplementationOnce(() => claimChain)

    const commands = await mc.claimRuntimeManagementCommands('rt-1')

    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ id: 'cmd-1', commandType: 'adapter.probe', status: 'sent' })
    expect(staleRequeueChain.update).toHaveBeenCalledWith({
      status: 'queued',
      dispatched_at: null,
    })
    expect(staleRequeueChain.eq).toHaveBeenCalledWith('runtime_id', 'rt-1')
    expect(staleRequeueChain.eq).toHaveBeenCalledWith('status', 'sent')
    expect(staleRequeueChain.is).toHaveBeenCalledWith('acknowledged_at', null)
  })
})

// ─── insertRuntimeEvents ───

describe('insertRuntimeEvents', () => {
  it('inserts batch of events', async () => {
    const chain = createChain({ data: null, error: null })
    const candidateChain = createChain({ data: null, error: null })
    mockFromResults.set('runtime_events', chain)
    mockFromResults.set('mc_native_mutation_candidates', candidateChain)

    const result = await mc.insertRuntimeEvents('rt-1', 'org-1', [
      { agentId: 'agent-1', eventType: 'tool_call', severity: 'info', payload: { tool: 'get_price' } },
      { eventType: 'error', severity: 'error', payload: { message: 'timeout' } },
    ])

    expect(result.inserted).toBe(2)
    expect(result.error).toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('runtime_events')
  })

  it('extracts native mutation candidate events into the dedicated MC table', async () => {
    const runtimeChain = createChain({ data: null, error: null })
    const candidateChain = createChain({ data: null, error: null })
    mockFromResults.set('runtime_events', runtimeChain)
    mockFromResults.set('mc_native_mutation_candidates', candidateChain)

    const result = await mc.insertRuntimeEvents('rt-1', 'org-1', [
      {
        agentId: 'agent-1',
        eventType: 'native_mutation_candidate',
        severity: 'info',
        payload: {
          runId: 'run-1',
          source: 'relay',
          toolName: 'memory',
          mutationEngine: 'hermes',
          mutationRuntimeFlavor: 'shared',
          mutationKind: 'memory_write',
          toolArgs: { content: 'remember this' },
          reason: 'Shared candidate path',
        },
      },
    ])

    expect(result.inserted).toBe(1)
    expect(mockFrom).toHaveBeenCalledWith('mc_native_mutation_candidates')
    expect(candidateChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        runtime_id: 'rt-1',
        org_id: 'org-1',
        agent_id: 'agent-1',
        run_id: 'run-1',
        source: 'relay',
        engine: 'hermes',
        runtime_flavor: 'shared',
        mutation_kind: 'memory_write',
        tool_name: 'memory',
        tool_args: { content: 'remember this' },
        reason: 'Shared candidate path',
      }),
    ])
  })

  it('extracts legacy native mutation candidate payloads for backward compatibility', async () => {
    const runtimeChain = createChain({ data: null, error: null })
    const candidateChain = createChain({ data: null, error: null })
    mockFromResults.set('runtime_events', runtimeChain)
    mockFromResults.set('mc_native_mutation_candidates', candidateChain)

    const result = await mc.insertRuntimeEvents('rt-1', 'org-1', [
      {
        agentId: 'agent-1',
        eventType: 'tool_call',
        severity: 'info',
        payload: {
          toolEventType: 'native_mutation_candidate',
          runId: 'run-2',
          source: 'shared',
          toolName: 'skill_manage',
          mutationEngine: 'hermes',
          mutationRuntimeFlavor: 'shared',
          mutationKind: 'skill_update',
          toolArgs: { slug: 'alpha' },
          reason: 'Legacy path',
        },
      },
    ])

    expect(result.inserted).toBe(1)
    expect(candidateChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        run_id: 'run-2',
        mutation_kind: 'skill_update',
        tool_name: 'skill_manage',
        reason: 'Legacy path',
      }),
    ])
  })

  it('returns 0 inserted on error', async () => {
    const chain = createChain({ data: null, error: { message: 'Insert failed' } })
    mockFromResults.set('runtime_events', chain)

    const result = await mc.insertRuntimeEvents('rt-1', 'org-1', [
      { eventType: 'tool_call' },
    ])

    expect(result.inserted).toBe(0)
    expect(result.error).toBe('Insert failed')
  })
})

describe('getAssistantNativeMutationCandidates', () => {
  it('returns assistant-scoped candidates newest first', async () => {
    const chain = createChain({
      data: [
        {
          id: 'cand-1',
          agent_id: 'agent-1',
          org_id: 'org-1',
          runtime_id: 'rt-1',
          run_id: 'run-1',
          source: 'relay',
          engine: 'hermes',
          runtime_flavor: 'shared',
        mutation_kind: 'memory_write',
        tool_name: 'memory',
        tool_args: { content: 'remember' },
        reason: 'Shared candidate path',
        status: 'pending',
        promotion_scope: null,
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        review_attempts: 1,
        last_error: null,
        last_error_at: null,
        applied_record_id: null,
        applied_at: null,
        created_at: '2026-04-11T20:00:00Z',
      },
      ],
      error: null,
    })
    mockFromResults.set('mc_native_mutation_candidates', chain)

    const result = await mc.getAssistantNativeMutationCandidates('agent-1', 'org-1', 25)
    expect(mockFrom).toHaveBeenCalledWith('mc_native_mutation_candidates')
    expect(chain.eq).toHaveBeenCalledWith('agent_id', 'agent-1')
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
    expect(chain.limit).toHaveBeenCalledWith(25)
    expect(result[0]?.id).toBe('cand-1')
  })
})

describe('reviewNativeMutationCandidate', () => {
  it('updates candidate review state for approval', async () => {
    const claimChain = createChain({
      data: {
        id: 'cand-1',
        agent_id: 'agent-1',
        org_id: 'org-1',
        runtime_id: 'rt-1',
        run_id: 'run-1',
        source: 'shared',
        engine: 'hermes',
        runtime_flavor: 'shared',
        mutation_kind: 'memory_write',
        tool_name: 'memory',
        tool_args: { content: 'remember this' },
        reason: 'candidate',
        status: 'approved',
        promotion_scope: null,
        review_notes: 'Looks good',
        reviewed_by: 'user-1',
        reviewed_at: '2026-04-11T21:00:00Z',
        review_attempts: 1,
        last_error: null,
        last_error_at: null,
        applied_record_id: null,
        applied_at: null,
        created_at: '2026-04-11T20:00:00Z',
      },
      error: null,
    })
    const updateChain = createChain({
      data: {
        id: 'cand-1',
        status: 'approved',
        review_notes: 'Looks good',
        review_attempts: 1,
      },
      error: null,
    })

    let call = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'mc_native_mutation_candidates') return createChain()
      call += 1
      if (call === 1) return createChain({
        data: {
          id: 'cand-1',
          agent_id: 'agent-1',
          org_id: 'org-1',
          runtime_id: 'rt-1',
          run_id: 'run-1',
          source: 'shared',
          engine: 'hermes',
          runtime_flavor: 'shared',
          mutation_kind: 'memory_write',
          tool_name: 'memory',
          tool_args: { content: 'remember this' },
          reason: 'candidate',
          status: 'pending',
          promotion_scope: null,
          review_notes: null,
          reviewed_by: null,
          reviewed_at: null,
          review_attempts: 0,
          last_error: null,
          last_error_at: null,
          applied_record_id: null,
          applied_at: null,
          created_at: '2026-04-11T20:00:00Z',
        },
        error: null,
      }) as any
      return call === 2 ? claimChain as any : updateChain as any
    })

    const result = await mc.reviewNativeMutationCandidate('agent-1', 'org-1', 'cand-1', {
      action: 'approve',
      reviewerId: 'user-1',
      reviewNotes: 'Looks good',
    })

    expect(result).toMatchObject({
      id: 'cand-1',
      status: 'approved',
      review_notes: 'Looks good',
    })
    expect(claimChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      reviewed_by: 'user-1',
      review_notes: 'Looks good',
      promotion_scope: null,
    }))
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      review_attempts: 1,
    }))
  })
})

describe('getNativeMutationOpsSummary', () => {
  it('aggregates backlog and failure metrics', async () => {
    const pendingCountChain = createChain({ data: null, error: null })
    ;(pendingCountChain as any).then = (resolve: (value: unknown) => void) => {
      resolve({ data: null, error: null, count: 4 })
      return pendingCountChain
    }
    const oldestChain = createChain({
      data: { created_at: '2026-04-11T20:00:00Z' },
      error: null,
    })
    const promotedChain = createChain({ data: null, error: null })
    ;(promotedChain as any).then = (resolve: (value: unknown) => void) => {
      resolve({ data: null, error: null, count: 2 })
      return promotedChain
    }
    const reviewedChain = createChain({ data: null, error: null })
    ;(reviewedChain as any).then = (resolve: (value: unknown) => void) => {
      resolve({ data: null, error: null, count: 3 })
      return reviewedChain
    }
    const failedChain = createChain({ data: null, error: null })
    ;(failedChain as any).then = (resolve: (value: unknown) => void) => {
      resolve({ data: null, error: null, count: 1 })
      return failedChain
    }
    const recentFailuresChain = createChain({
      data: [{ id: 'cand-err', last_error: 'Failed to install skill' }],
      error: null,
    })

    rpcResults.set('mc_native_mutation_pending_breakdown', {
      data: [
        { engine: 'hermes', mutation_kind: 'memory_write', pending_count: 3 },
        { engine: 'hermes', mutation_kind: 'skill_create', pending_count: 1 },
      ],
      error: null,
    })

    let call = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'mc_native_mutation_candidates') return createChain()
      call += 1
      return [
        pendingCountChain,
        oldestChain,
        promotedChain,
        reviewedChain,
        failedChain,
        recentFailuresChain,
      ][call - 1] as any
    })

    const result = await mc.getNativeMutationOpsSummary('org-1')
    expect(result.pendingCount).toBe(4)
    expect(result.promotedLast24h).toBe(2)
    expect(result.failedLast24h).toBe(1)
    expect(mockRpc).toHaveBeenCalledWith('mc_native_mutation_pending_breakdown', { p_org_id: 'org-1' })
    expect(result.pendingByEngine.hermes).toBe(4)
    expect(result.pendingByKind.skill_create).toBe(1)
    expect(result.recentFailures[0]?.id).toBe('cand-err')
  })
})

// ─── updateRuntimeHeartbeat ───

describe('updateRuntimeHeartbeat', () => {
  const validMetrics = {
    cpuPercent: 45,
    ramPercent: 60,
    diskPercent: 30,
    pendingEvents: 0,
    deadLetters: 0,
    openclawVersion: '2.4',
    agentCount: 3,
    uptimeSeconds: 3600,
  }

  it('rejects heartbeat when generation mismatches', async () => {
    const chain = createChain({
      data: { generation: 2, heartbeat_counter: 0, status: 'connected', org_id: 'org-1', display_name: 'test' },
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.updateRuntimeHeartbeat('rt-1', 1, validMetrics)
    expect(result.error).toContain('Generation mismatch')
    expect(result.writeHistory).toBe(false)
  })

  it('rejects heartbeat for revoked runtime', async () => {
    const chain = createChain({
      data: { generation: 1, heartbeat_counter: 0, status: 'revoked', org_id: 'org-1', display_name: 'test' },
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.updateRuntimeHeartbeat('rt-1', 1, validMetrics)
    expect(result.error).toBe('Runtime revoked')
  })

  it('returns error when runtime not found', async () => {
    const chain = createChain({ data: null, error: { message: 'Not found' } })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.updateRuntimeHeartbeat('rt-1', 1, validMetrics)
    expect(result.error).toBe('Runtime not found')
  })
})

// ─── getRuntimeHealthHistory ───

describe('getRuntimeHealthHistory', () => {
  it('returns mapped health snapshots', async () => {
    const chain = createChain()
    chain.limit = vi.fn().mockResolvedValue({
      data: [
        { reported_at: '2026-03-22T12:00:00Z', cpu_percent: 45, ram_percent: 60, disk_percent: 30 },
        { reported_at: '2026-03-22T11:57:30Z', cpu_percent: 50, ram_percent: 65, disk_percent: 31 },
      ],
      error: null,
    })
    mockFromResults.set('vps_health_snapshots', chain)

    const result = await mc.getRuntimeHealthHistory('rt-1', 'org-1')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      reportedAt: '2026-03-22T12:00:00Z',
      cpuPercent: 45,
      ramPercent: 60,
      diskPercent: 30,
    })
  })

  it('returns empty array on error', async () => {
    const chain = createChain()
    chain.limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } })
    mockFromResults.set('vps_health_snapshots', chain)

    const result = await mc.getRuntimeHealthHistory('rt-1', 'org-1')
    expect(result).toEqual([])
  })
})

// ─── upsertRuntimeCosts ───

describe('upsertRuntimeCosts', () => {
  it('accumulates tokens when existing row found', async () => {
    const readChain = createChain()
    readChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { input_tokens: 1000, output_tokens: 500, estimated_cost_usd: 0.05 },
      error: null,
    })

    const writeChain = createChain({ data: null, error: null })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      // First call is the read (select), second is the upsert
      return callCount === 1 ? readChain : writeChain
    })

    const result = await mc.upsertRuntimeCosts('org-1', {
      agentId: 'agent-1',
      runId: 'run-1',
      inputTokens: 500,
      outputTokens: 300,
      estimatedCostUsd: 0.02,
    })

    expect(result.error).toBeUndefined()
  })

  it('starts from zero when no existing row', async () => {
    const readChain = createChain()
    readChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const writeChain = createChain({ data: null, error: null })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return callCount === 1 ? readChain : writeChain
    })

    const result = await mc.upsertRuntimeCosts('org-1', {
      agentId: 'agent-1',
      runId: 'run-1',
      inputTokens: 500,
      outputTokens: 300,
      estimatedCostUsd: 0.02,
    })

    expect(result.error).toBeUndefined()
  })
})

// ─── insertRuntimeHealthScore ───

describe('insertRuntimeHealthScore', () => {
  it('inserts health score record', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('mc_agent_health_scores', chain)

    const result = await mc.insertRuntimeHealthScore('org-1', {
      agentId: 'agent-1',
      overallScore: 85,
      dimensions: { latency: 90, error_rate: 80 },
    })

    expect(result.error).toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('mc_agent_health_scores')
  })

  it('returns error on failure', async () => {
    const chain = createChain({ data: null, error: { message: 'Failed' } })
    mockFromResults.set('mc_agent_health_scores', chain)

    const result = await mc.insertRuntimeHealthScore('org-1', {
      agentId: 'agent-1',
      overallScore: 50,
      dimensions: {},
    })
    expect(result.error).toBe('Failed')
  })
})

// ─── getApprovalStatus ───

describe('getApprovalStatus', () => {
  it('returns approval status', async () => {
    const chain = createChain({
      data: { status: 'approved', resolved_at: '2026-03-22T12:05:00Z' },
      error: null,
    })
    mockFromResults.set('mc_pending_approvals', chain)

    const result = await mc.getApprovalStatus('approval-1', 'org-1')
    expect(result).toEqual({ status: 'approved', resolvedAt: '2026-03-22T12:05:00Z' })
  })

  it('returns null when not found', async () => {
    const chain = createChain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    mockFromResults.set('mc_pending_approvals', chain)

    const result = await mc.getApprovalStatus('approval-1', 'org-1')
    expect(result).toBeNull()
  })
})

// ─── updateRuntimeApiKeyHash ───

describe('updateRuntimeApiKeyHash', () => {
  it('updates api_key_hash for the runtime', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeApiKeyHash('rt-1', 'org-1', 'newsalt:newhash')
    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
  })
})
