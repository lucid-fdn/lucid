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

describe('knowledge graph DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts canonical entities with normalized names', async () => {
    const { upsertKnowledgeEntity } = await import('../knowledge-graph')
    mockFrom
      .mockReturnValueOnce(maybeSingleChain(null))
      .mockReturnValueOnce(insertEntityChain(entityRow({ normalized_name: 'browser operator' })))

    const entity = await upsertKnowledgeEntity({
      orgId,
      projectId,
      type: 'agent',
      canonicalName: 'Browser Operator',
      confidence: 0.9,
    })

    expect(mockFrom).toHaveBeenCalledWith('knowledge_entities')
    expect(entity?.normalizedName).toBe('browser operator')
    expect(entity?.type).toBe('agent')
  })

  it('lists graph neighbors from inbound and outbound relationships', async () => {
    const { getKnowledgeGraphNeighbors } = await import('../knowledge-graph')
    const relationship = relationshipRow({
      source_entity_id: 'entity-1',
      target_entity_id: 'entity-2',
    })
    mockFrom
      .mockReturnValueOnce(listRelationshipsChain([relationship]))
      .mockReturnValueOnce(listEntitiesByIdsChain([entityRow({ id: 'entity-2', canonical_name: 'Slack', normalized_name: 'slack', entity_type: 'integration' })]))

    const neighbors = await getKnowledgeGraphNeighbors({
      orgId,
      entityId: 'entity-1',
    })

    expect(neighbors[0]?.entity.canonicalName).toBe('Slack')
    expect(neighbors[0]?.direction).toBe('outbound')
  })
})

function maybeSingleChain(row: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
}

function insertEntityChain(row: unknown) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
}

function listRelationshipsChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function listEntitiesByIdsChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function entityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1',
    org_id: orgId,
    project_id: projectId,
    team_id: null,
    source_id: null,
    entity_type: 'agent',
    canonical_name: 'Browser Operator',
    normalized_name: 'browser operator',
    description: null,
    status: 'active',
    merged_into_entity_id: null,
    confidence: 0.9,
    metadata: {},
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  }
}

function relationshipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'relationship-1',
    org_id: orgId,
    project_id: projectId,
    team_id: null,
    source_entity_id: 'entity-1',
    target_entity_id: 'entity-2',
    source_id: null,
    page_id: null,
    event_id: null,
    relation_type: 'uses',
    direction: 'directed',
    confidence: 0.8,
    evidence: [],
    metadata: {},
    status: 'active',
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  }
}
