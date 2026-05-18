import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

describe('knowledge retrieval eval DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts eval cases and maps rows to camelCase', async () => {
    const { upsertKnowledgeRetrievalEvalCase } = await import('../knowledge-retrieval-evals')
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: evalCaseRow(),
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const evalCase = await upsertKnowledgeRetrievalEvalCase({
      orgId: '22222222-2222-4222-8222-222222222222',
      slug: 'project-release-policy',
      category: 'project_fact',
      query: 'What is the release policy?',
      expectedItemIds: ['page-1'],
    })

    expect(mockFrom).toHaveBeenCalledWith('knowledge_retrieval_eval_cases')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'project-release-policy',
      expected_item_ids: ['page-1'],
    }), { onConflict: 'org_id,slug' })
    expect(evalCase?.expectedItemIds).toEqual(['page-1'])
    expect(evalCase?.category).toBe('project_fact')
  })

  it('records replay runs and detailed results', async () => {
    const { recordKnowledgeRetrievalEvalRun } = await import('../knowledge-retrieval-evals')
    const runChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
    }
    const resultChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    mockFrom
      .mockReturnValueOnce(runChain)
      .mockReturnValueOnce(resultChain)

    const run = await recordKnowledgeRetrievalEvalRun({
      orgId: '22222222-2222-4222-8222-222222222222',
      results: [{
        caseId: 'case-1',
        status: 'failed',
        latencyMs: 42,
        summary: 'missing source',
        metrics: {
          precisionAtK: 0,
          recallAtK: 0,
          mrr: 0,
          ndcg: 0,
          citationAccuracy: 0,
          top1Stable: false,
          latencyDeltaMs: null,
          failureTypes: ['missing_source'],
        },
      }],
    })

    expect(run.evalRunId).toBe('run-1')
    expect(run.summary.failureCounts.missing_source).toBe(1)
    expect(resultChain.insert).toHaveBeenCalledWith([expect.objectContaining({
      eval_case_id: 'case-1',
      status: 'failed',
      failure_types: ['missing_source'],
    })])
  })

  it('records retrieval captures without noisy warnings when local actor identity is not an auth user', async () => {
    const { recordKnowledgeRetrievalCapture } = await import('../knowledge-retrieval-evals')
    const insert = vi.fn()
      .mockResolvedValueOnce({
        error: {
          code: '23503',
          message: 'insert or update on table "knowledge_retrieval_captures" violates foreign key constraint "knowledge_retrieval_captures_actor_user_id_fkey"',
        },
      })
      .mockResolvedValueOnce({ error: null })
    mockFrom.mockReturnValue({ insert })

    await recordKnowledgeRetrievalCapture({
      packet: knowledgePacket(),
      query: 'What launch policy applies?',
      actorUserId: 'a00501b9-9ae5-40a7-958c-a1f4fb4b0fe9',
      surface: 'mission_control',
    })

    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      actor_user_id: null,
      metadata: expect.objectContaining({ actor_user_id_unlinked: true }),
    }))
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})

function evalCaseRow() {
  return {
    id: 'case-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: null,
    team_id: null,
    slug: 'project-release-policy',
    category: 'project_fact',
    query: 'What is the release policy?',
    expected_item_ids: ['page-1'],
    expected_citation_keys: [],
    required_layers: ['project_brain'],
    baseline_top_item_id: null,
    status: 'active',
    metadata: {},
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
  }
}

function knowledgePacket() {
  return {
    orgId: '22222222-2222-4222-8222-222222222222',
    projectId: null,
    teamId: null,
    assistantId: null,
    generatedAt: '2026-05-06T00:00:00.000Z',
    mode: 'evidence',
    proofMode: 'optional',
    budget: {
      maxLatencyMs: 900,
      maxPromptTokens: 1200,
      maxItemsPerLayer: 4,
    },
    items: [{
      id: 'item-1',
      layer: 'project_brain',
      label: 'Launch policy',
      content: 'Launch requires QA evidence.',
      tokenCost: 6,
      score: 0.9,
      citations: [{ kind: 'file', label: 'Launch policy' }],
      citationKeys: ['file:launch-policy'],
      freshness: 'fresh',
    }],
    omitted: [],
    telemetry: {
      durationMs: 42,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: { project_brain: 1 },
    },
  } as never
}
