import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateEmbedding: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/ai/embeddings', () => ({
  DEFAULT_EMBEDDING_MODEL: 'text-embedding-3-small',
  generateEmbedding: (...args: unknown[]) => mocks.generateEmbedding(...args),
}))

describe('knowledge claim semantic persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateEmbedding.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], usage: { tokens: 3 } })
  })

  it('stores semantic fingerprint, cluster key, and embedding metadata when creating claims', async () => {
    const insertedRows: Record<string, unknown>[] = []
    mocks.from.mockImplementation((table: string) => {
      if (table === 'knowledge_claims') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRows.push(row)
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: '11111111-1111-4111-8111-111111111111',
                  org_id: row.org_id,
                  project_id: row.project_id,
                  team_id: row.team_id,
                  assistant_id: row.assistant_id,
                  source_id: row.source_id,
                  page_id: row.page_id,
                  claim_type: row.claim_type,
                  subject: row.subject,
                  claim: row.claim,
                  holder_type: row.holder_type,
                  holder_id: row.holder_id,
                  confidence: row.confidence,
                  weight: row.weight,
                  status: row.status,
                  valid_from: row.valid_from,
                  valid_until: row.valid_until,
                  resolved_outcome: null,
                  resolved_at: null,
                  superseded_by: null,
                  embedding_status: row.embedding_status,
                  embedding_model: row.embedding_model,
                  embedding_provider_id: row.embedding_provider_id,
                  semantic_fingerprint: row.semantic_fingerprint,
                  semantic_cluster_key: row.semantic_cluster_key,
                  evidence: row.evidence,
                  metadata: row.metadata,
                  created_at: '2026-05-08T00:00:00.000Z',
                  updated_at: '2026-05-08T00:00:00.000Z',
                },
                error: null,
              }),
            }
          }),
        }
      }
      if (table === 'knowledge_claim_events' || table === 'knowledge_claim_evidence') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const { createKnowledgeClaim } = await import('../knowledge-claims')
    const claim = await createKnowledgeClaim({
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      teamId: null,
      assistantId: null,
      sourceId: null,
      pageId: null,
      claimType: 'decision',
      subject: 'Launch QA policy',
      claim: 'Launches require QA proof before release.',
      holderType: 'system',
      holderId: null,
      confidence: 0.9,
      weight: 0.8,
      status: 'active',
      evidence: [],
      metadata: {},
    })

    expect(mocks.generateEmbedding).toHaveBeenCalledWith(expect.stringContaining('Launch QA policy'), 'text-embedding-3-small')
    expect(insertedRows[0]).toMatchObject({
      embedding: '[0.1,0.2,0.3]',
      embedding_status: 'ready',
      embedding_model: 'text-embedding-3-small',
      embedding_provider_id: 'lucid:text-embedding-3-small',
    })
    expect(insertedRows[0]?.semantic_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(insertedRows[0]?.semantic_cluster_key).toMatch(/^[a-f0-9]{64}$/)
    expect(claim.embeddingStatus).toBe('ready')
    expect(claim.semanticClusterKey).toBe(insertedRows[0]?.semantic_cluster_key)
  })

  it('preserves profile actor provenance when auth-user foreign keys reject created_by_user_id', async () => {
    const insertedRows: Record<string, unknown>[] = []
    let insertCount = 0
    mocks.from.mockImplementation((table: string) => {
      if (table === 'knowledge_claims') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRows.push(row)
            insertCount += 1
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(insertCount === 1
                ? {
                    data: null,
                    error: {
                      code: '23503',
                      message: 'insert or update on table "knowledge_claims" violates foreign key constraint "knowledge_claims_created_by_user_id_fkey"',
                    },
                  }
                : {
                    data: {
                      id: '11111111-1111-4111-8111-111111111111',
                      org_id: row.org_id,
                      project_id: row.project_id,
                      team_id: row.team_id,
                      assistant_id: row.assistant_id,
                      source_id: row.source_id,
                      page_id: row.page_id,
                      claim_type: row.claim_type,
                      subject: row.subject,
                      claim: row.claim,
                      holder_type: row.holder_type,
                      holder_id: row.holder_id,
                      confidence: row.confidence,
                      weight: row.weight,
                      status: row.status,
                      valid_from: row.valid_from,
                      valid_until: row.valid_until,
                      resolved_outcome: null,
                      resolved_at: null,
                      superseded_by: null,
                      embedding_status: row.embedding_status,
                      embedding_model: row.embedding_model,
                      embedding_provider_id: row.embedding_provider_id,
                      semantic_fingerprint: row.semantic_fingerprint,
                      semantic_cluster_key: row.semantic_cluster_key,
                      evidence: row.evidence,
                      metadata: row.metadata,
                      created_at: '2026-05-08T00:00:00.000Z',
                      updated_at: '2026-05-08T00:00:00.000Z',
                    },
                    error: null,
                  }),
            }
          }),
        }
      }
      if (table === 'knowledge_claim_events' || table === 'knowledge_claim_evidence') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const { createKnowledgeClaim } = await import('../knowledge-claims')
    const claim = await createKnowledgeClaim({
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: null,
      teamId: null,
      assistantId: null,
      sourceId: null,
      pageId: null,
      claimType: 'claim',
      subject: 'Profile-backed actor',
      claim: 'Profile ids should not block Knowledge claim creation.',
      holderType: 'operator',
      holderId: null,
      confidence: 0.9,
      weight: 0.8,
      status: 'active',
      evidence: [],
      metadata: {},
      createdByUserId: '33333333-3333-4333-8333-333333333333',
    })

    expect(claim.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]?.created_by_user_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(insertedRows[1]?.created_by_user_id).toBeNull()
    expect(insertedRows[1]?.metadata).toMatchObject({
      provenanceActorUserId: '33333333-3333-4333-8333-333333333333',
    })
  })
})
