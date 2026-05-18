import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const procedureId = '44444444-4444-4444-8444-444444444444'

describe('agent-ops browser procedure DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates normalized browser procedures', async () => {
    const { createAgentOpsBrowserProcedure } = await import('../agent-ops-browser-procedures')
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: procedureId,
          org_id: orgId,
          project_id: projectId,
          host_pattern: 'www.example.com',
          name: 'Check checkout',
          slug: 'check-checkout',
          description: 'Validate checkout.',
          intent_triggers: ['check checkout'],
          procedure_type: 'qa',
          scope: 'project',
          trust_state: 'draft',
          source_run_id: null,
          created_by_user_id: null,
          created_by_agent_id: null,
          metadata: {},
          created_at: '2026-05-02T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const procedure = await createAgentOpsBrowserProcedure({
      orgId,
      projectId,
      hostPattern: 'https://WWW.Example.com/checkout',
      name: 'Check checkout',
      description: 'Validate checkout.',
      intentTriggers: ['check checkout'],
      procedureType: 'qa',
      scope: 'project',
    })

    expect(mockFrom).toHaveBeenCalledWith('agent_ops_browser_procedures')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      project_id: projectId,
      host_pattern: 'www.example.com',
      slug: 'check-checkout',
      procedure_type: 'qa',
      scope: 'project',
    }))
    expect(procedure.slug).toBe('check-checkout')
  })

  it('creates content-addressed procedure versions', async () => {
    const { createAgentOpsBrowserProcedureVersion } = await import('../agent-ops-browser-procedures')
    const latestChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { version: 2 },
        error: null,
      }),
    }
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: '55555555-5555-4555-8555-555555555555',
          procedure_id: procedureId,
          version: 3,
          definition_kind: 'browser_operator_plan',
          definition: { steps: [] },
          fixture_artifact_id: null,
          test_definition: {},
          capabilities: ['tool:browser'],
          risk_level: 'medium',
          approval_policy: {},
          content_hash: 'a'.repeat(64),
          created_by_user_id: null,
          created_at: '2026-05-02T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom
      .mockReturnValueOnce(latestChain)
      .mockReturnValueOnce(insertChain)

    const version = await createAgentOpsBrowserProcedureVersion({
      procedureId,
      definition: { steps: [] },
    })

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'agent_ops_browser_procedure_versions')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'agent_ops_browser_procedure_versions')
    expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      procedure_id: procedureId,
      version: 3,
      content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }))
    expect(version.version).toBe(3)
  })

  it('loads procedure detail with versions after verifying org scope', async () => {
    const { getAgentOpsBrowserProcedureDetail } = await import('../agent-ops-browser-procedures')
    const procedureChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: procedureId,
          org_id: orgId,
          project_id: projectId,
          host_pattern: 'www.example.com',
          name: 'Check checkout',
          slug: 'check-checkout',
          description: 'Validate checkout.',
          intent_triggers: ['check checkout'],
          procedure_type: 'qa',
          scope: 'project',
          trust_state: 'active',
          source_run_id: null,
          created_by_user_id: null,
          created_by_agent_id: null,
          metadata: {},
          created_at: '2026-05-02T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
        error: null,
      }),
    }
    const versionsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{
          id: '55555555-5555-4555-8555-555555555555',
          procedure_id: procedureId,
          version: 1,
          definition_kind: 'browser_operator_plan',
          definition: { steps: [] },
          fixture_artifact_id: null,
          test_definition: {},
          capabilities: ['tool:browser'],
          risk_level: 'medium',
          approval_policy: {},
          content_hash: 'a'.repeat(64),
          created_by_user_id: null,
          created_at: '2026-05-02T00:00:00.000Z',
        }],
        error: null,
      }),
    }
    mockFrom
      .mockReturnValueOnce(procedureChain)
      .mockReturnValueOnce(versionsChain)

    const detail = await getAgentOpsBrowserProcedureDetail({ orgId, procedureId })

    expect(procedureChain.eq).toHaveBeenCalledWith('org_id', orgId)
    expect(procedureChain.eq).toHaveBeenCalledWith('id', procedureId)
    expect(detail?.procedure.trustState).toBe('active')
    expect(detail?.versions[0]?.version).toBe(1)
  })

  it('updates trust state without touching procedures from other orgs', async () => {
    const { updateAgentOpsBrowserProcedureTrustState } = await import('../agent-ops-browser-procedures')
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: procedureId,
          org_id: orgId,
          project_id: projectId,
          host_pattern: 'www.example.com',
          name: 'Check checkout',
          slug: 'check-checkout',
          description: 'Validate checkout.',
          intent_triggers: ['check checkout'],
          procedure_type: 'qa',
          scope: 'project',
          trust_state: 'active',
          source_run_id: null,
          created_by_user_id: null,
          created_by_agent_id: null,
          metadata: { last_trust_action: 'promote' },
          created_at: '2026-05-02T00:00:00.000Z',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const procedure = await updateAgentOpsBrowserProcedureTrustState({
      orgId,
      procedureId,
      trustState: 'active',
      metadata: { last_trust_action: 'promote' },
    })

    expect(chain.update).toHaveBeenCalledWith({
      trust_state: 'active',
      metadata: { last_trust_action: 'promote' },
    })
    expect(chain.eq).toHaveBeenCalledWith('org_id', orgId)
    expect(chain.eq).toHaveBeenCalledWith('id', procedureId)
    expect(procedure.trustState).toBe('active')
  })
})
