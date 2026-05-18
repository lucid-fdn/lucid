import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockListRecentCommerceKnowledgeEvidenceEvents = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

vi.mock('../knowledge-operation-events', () => ({
  listRecentCommerceKnowledgeEvidenceEvents: (...args: unknown[]) => mockListRecentCommerceKnowledgeEvidenceEvents(...args),
}))

describe('shared context Daily Intel commerce evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes recent commerce_event evidence as Daily Intel inputs and source links', async () => {
    const contextQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mockFrom.mockReturnValue(contextQuery)
    mockListRecentCommerceKnowledgeEvidenceEvents.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      org_id: '22222222-2222-4222-8222-222222222222',
      commerce_event_id: '33333333-3333-4333-8333-333333333333',
      operation_id: 'knowledge.write_project',
      surface: 'agent_ops',
      success: true,
      output_summary: 'Commerce evidence: spend_request.completed.',
      metadata: {
        evidence_kind: 'commerce_event',
        event_type: 'spend_request.completed',
        provider: 'stripe_link_agents',
        project_id: '44444444-4444-4444-8444-444444444444',
        assistant_id: '55555555-5555-4555-8555-555555555555',
        request_id: 'req-1',
        run_id: 'run-1',
        outcome: 'succeeded',
        status: 'completed',
        amount: 4200,
        currency: 'usd',
      },
      created_at: '2026-05-07T12:00:00.000Z',
    }])

    const { generateSharedContextDailyIntel } = await import('../shared-context')
    const preview = await generateSharedContextDailyIntel({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
      scopeType: 'project',
      scopeId: '44444444-4444-4444-8444-444444444444',
      lookback_hours: 24,
      publish: false,
    })

    expect(mockListRecentCommerceKnowledgeEvidenceEvents).toHaveBeenCalledWith(expect.objectContaining({
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
      teamId: null,
    }))
    expect(preview.inputs).toHaveLength(1)
    expect(preview.inputs[0]).toEqual(expect.objectContaining({
      id: '11111111-1111-4111-8111-111111111111',
      record_type: 'signal',
      source_type: 'commerce_event',
      source_id: '33333333-3333-4333-8333-333333333333',
      title: 'Commerce: spend request completed',
    }))
    expect(preview.body).toContain('Commerce evidence: spend_request.completed.')
    expect(preview.links).toEqual([expect.objectContaining({
      target_type: 'commerce_event',
      target_id: '33333333-3333-4333-8333-333333333333',
    })])
  })

  it('includes team-scoped shared context when generating project Daily Intel', async () => {
    const teamSignal = {
      id: '66666666-6666-4666-8666-666666666666',
      workspace_id: '22222222-2222-4222-8222-222222222222',
      project_id: '44444444-4444-4444-8444-444444444444',
      agent_id: null,
      scope_type: 'team',
      scope_id: '77777777-7777-4777-8777-777777777777',
      record_type: 'signal',
      title: 'Commerce context attached',
      body: 'A team attached a completed spend request as project evidence.',
      source_type: 'commerce_event',
      source_id: '33333333-3333-4333-8333-333333333333',
      confidence: 0.88,
      status: 'active',
      valid_from: null,
      valid_until: null,
      metadata: {},
      links: [],
      created_by: null,
      created_at: '2026-05-07T12:00:00.000Z',
      updated_at: '2026-05-07T12:00:00.000Z',
    }
    const contextQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [teamSignal], error: null }),
    }
    mockFrom.mockReturnValue(contextQuery)
    mockListRecentCommerceKnowledgeEvidenceEvents.mockResolvedValue([])

    const { generateSharedContextDailyIntel } = await import('../shared-context')
    const preview = await generateSharedContextDailyIntel({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
      scopeType: 'project',
      scopeId: '44444444-4444-4444-8444-444444444444',
      lookback_hours: 24,
      publish: false,
    })

    expect(preview.inputs).toHaveLength(1)
    expect(preview.inputs[0]).toEqual(expect.objectContaining({
      id: '66666666-6666-4666-8666-666666666666',
      scope_type: 'team',
      source_type: 'commerce_event',
      source_id: '33333333-3333-4333-8333-333333333333',
    }))
    expect(preview.body).toContain('Commerce context attached')
  })

  it('resolves an agent primary team without embedded crew relationships', async () => {
    const membershipsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { crew_id: 'crew-old' },
          { crew_id: 'crew-active' },
        ],
        error: null,
      }),
    }
    const crewsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'crew-active' }],
        error: null,
      }),
    }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'crew_members') return membershipsQuery
      if (table === 'crews') return crewsQuery
      throw new Error(`Unexpected table ${table}`)
    })

    const { getAgentPrimaryTeamId } = await import('../shared-context')
    const teamId = await getAgentPrimaryTeamId('agent-1', 'workspace-1')

    expect(teamId).toBe('crew-active')
    expect(membershipsQuery.select).toHaveBeenCalledWith('crew_id')
    expect(crewsQuery.select).toHaveBeenCalledWith('id')
    expect(crewsQuery.in).toHaveBeenCalledWith('id', ['crew-old', 'crew-active'])
  })
})
