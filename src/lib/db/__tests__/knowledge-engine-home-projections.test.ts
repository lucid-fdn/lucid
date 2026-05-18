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

vi.mock('../knowledge', () => ({
  writeProjectKnowledge: vi.fn(),
  writeTeamKnowledge: vi.fn(),
}))

describe('knowledge engine-home projection DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts candidates with redacted payloads and provenance', async () => {
    const { upsertKnowledgeEngineHomeProjectionCandidates } = await import('../knowledge-engine-home-projections')
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [candidateRow()], error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const candidates = await upsertKnowledgeEngineHomeProjectionCandidates([candidateInput()])

    expect(mockFrom).toHaveBeenCalledWith('knowledge_engine_home_projection_candidates')
    expect(chain.upsert).toHaveBeenCalledWith([expect.objectContaining({
      engine: 'hermes',
      home_kind: 'hermes_hhv',
      projection_policy: 'candidate_only',
      payload_redacted: { path: 'memories/memory.md', contentHash: 'hash-1' },
    })], { onConflict: 'org_id,engine,source_snapshot_id,path,content_hash' })
    expect(candidates[0]?.summary).toBe('Customer prefers weekly proof summaries.')
  })

  it('lists candidate rows scoped to org and status', async () => {
    const { listKnowledgeEngineHomeProjectionCandidates } = await import('../knowledge-engine-home-projections')
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [candidateRow()], error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const candidates = await listKnowledgeEngineHomeProjectionCandidates({
      orgId: '22222222-2222-4222-8222-222222222222',
      status: 'candidate',
    })

    expect(chain.eq).toHaveBeenCalledWith('org_id', '22222222-2222-4222-8222-222222222222')
    expect(chain.eq).toHaveBeenCalledWith('status', 'candidate')
    expect(candidates[0]?.homeKind).toBe('hermes_hhv')
  })

  it('records rejection review state without promotion side effects', async () => {
    const { reviewKnowledgeEngineHomeProjectionCandidate } = await import('../knowledge-engine-home-projections')
    const getChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: candidateRow(), error: null }),
    }
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: candidateRow({ status: 'rejected', reviewed_by: 'user-1', review_note: 'not useful' }),
        error: null,
      }),
    }
    mockFrom
      .mockReturnValueOnce(getChain)
      .mockReturnValueOnce(updateChain)

    const candidate = await reviewKnowledgeEngineHomeProjectionCandidate({
      orgId: '22222222-2222-4222-8222-222222222222',
      candidateId: 'candidate-1',
      reviewerUserId: 'user-1',
      action: 'reject',
      note: 'not useful',
    })

    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      reviewed_by: 'user-1',
      review_note: 'not useful',
    }))
    expect(candidate?.status).toBe('rejected')
  })
})

function candidateInput() {
  return {
    orgId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    teamId: null,
    assistantId: '44444444-4444-4444-8444-444444444444',
    runtimeId: '55555555-5555-4555-8555-555555555555',
    engine: 'hermes',
    homeKind: 'hermes_hhv',
    homeAuthority: 'local_authoritative',
    resourceType: 'memory',
    projectionPolicy: 'candidate_only',
    status: 'candidate',
    path: 'memories/memory.md',
    contentHash: 'hash-1',
    summary: 'Customer prefers weekly proof summaries.',
    payloadRedacted: { path: 'memories/memory.md', contentHash: 'hash-1' },
    sourceSnapshotId: 'snapshot-1',
    sourceDiffId: 'diff-1',
    metadata: { source: 'engine_home' },
  } as const
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    team_id: null,
    assistant_id: '44444444-4444-4444-8444-444444444444',
    runtime_id: '55555555-5555-4555-8555-555555555555',
    engine: 'hermes',
    home_kind: 'hermes_hhv',
    home_authority: 'local_authoritative',
    resource_type: 'memory',
    projection_policy: 'candidate_only',
    status: 'candidate',
    path: 'memories/memory.md',
    content_hash: 'hash-1',
    summary: 'Customer prefers weekly proof summaries.',
    payload_redacted: { path: 'memories/memory.md', contentHash: 'hash-1' },
    source_snapshot_id: 'snapshot-1',
    source_diff_id: 'diff-1',
    promotion_target_type: null,
    promotion_target_id: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    metadata: { source: 'engine_home' },
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  }
}
