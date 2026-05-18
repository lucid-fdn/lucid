import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockIngestDocument = vi.fn()
const mockDeleteDocument = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

vi.mock('@/lib/rag/ingest', () => ({
  ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
}))

vi.mock('@/lib/rag/documents', () => ({
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
}))

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const teamId = '44444444-4444-4444-8444-444444444444'

describe('knowledge DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIngestDocument.mockResolvedValue({
      status: 'ready',
      documentId: 'rag-doc-1',
      chunkCount: 1,
      totalTokens: 100,
    })
    mockDeleteDocument.mockResolvedValue(undefined)
  })

  it('writes project knowledge as compiled truth with event, version, and RAG link', async () => {
    const { writeProjectKnowledge } = await import('../knowledge')
    mockFrom
      .mockReturnValueOnce(upsertSourceChain('source-1'))
      .mockReturnValueOnce(findPageChain(null))
      .mockReturnValueOnce(insertPageChain({
        id: 'page-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        source_id: 'source-1',
        scope_type: 'project',
        subject: 'What we know',
        slug: 'what-we-know',
        compiled_truth: 'Prefer Agent Ops workflows.',
        status: 'active',
        trust_level: 'operator_approved',
        confidence: 0.9,
        evidence: [{ kind: 'run', runId: 'run-1', label: 'Review run' }],
        metadata: {},
        rag_document_id: null,
        version: 1,
        created_at: '2026-05-06T00:00:00.000Z',
        updated_at: '2026-05-06T00:00:00.000Z',
      }))
      .mockReturnValueOnce(insertEventChain('event-1'))
      .mockReturnValueOnce(insertVersionChain())
      .mockReturnValueOnce(updatePageChain({
        id: 'page-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        source_id: 'source-1',
        scope_type: 'project',
        subject: 'What we know',
        slug: 'what-we-know',
        compiled_truth: 'Prefer Agent Ops workflows.',
        status: 'active',
        trust_level: 'operator_approved',
        confidence: 0.9,
        evidence: [{ kind: 'run', runId: 'run-1', label: 'Review run' }],
        metadata: {},
        rag_document_id: 'rag-doc-1',
        version: 1,
        created_at: '2026-05-06T00:00:00.000Z',
        updated_at: '2026-05-06T00:00:00.000Z',
      }))

    const page = await writeProjectKnowledge({
      orgId,
      projectId,
      source: {
        orgId,
        projectId,
        type: 'manual',
        visibility: 'project',
        trustLevel: 'operator_approved',
        label: 'Operator',
      },
      subject: 'What we know',
      compiledTruthPatch: 'Prefer Agent Ops workflows.',
      event: { type: 'created', summary: 'Seeded project knowledge.', confidence: 0.9 },
      evidence: [{ kind: 'run', runId: 'run-1', label: 'Review run' }],
    })

    expect(page.ragDocumentId).toBe('rag-doc-1')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_sources')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_pages')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_events')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_versions')
    expect(mockIngestDocument).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      title: 'Knowledge: What we know',
      content: 'Prefer Agent Ops workflows.',
      sourceType: 'api',
    }))
  })

  it('lists active team knowledge pages', async () => {
    const { listKnowledgePages } = await import('../knowledge')
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{
          id: 'page-1',
          org_id: orgId,
          project_id: projectId,
          team_id: teamId,
          source_id: null,
          scope_type: 'team',
          subject: 'Handoffs',
          slug: 'handoffs',
          compiled_truth: 'Coordinator routes QA to Browser Operator.',
          status: 'active',
          trust_level: 'observed',
          confidence: 0.8,
          evidence: [],
          metadata: {},
          rag_document_id: null,
          version: 1,
          created_at: '2026-05-06T00:00:00.000Z',
          updated_at: '2026-05-06T00:00:00.000Z',
        }],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const pages = await listKnowledgePages({ orgId, teamId, scopeType: 'team' })

    expect(chain.eq).toHaveBeenCalledWith('scope_type', 'team')
    expect(chain.eq).toHaveBeenCalledWith('team_id', teamId)
    expect(pages[0]?.subject).toBe('Handoffs')
  })

  it('lists governed knowledge sources without archived rows by default', async () => {
    const { listKnowledgeSources } = await import('../knowledge')
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [sourceRow({ id: 'source-1', label: 'Agent Ops history' })],
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const sources = await listKnowledgeSources({ orgId, projectId, limit: 10 })

    expect(chain.neq).toHaveBeenCalledWith('status', 'archived')
    expect(chain.eq).toHaveBeenCalledWith('project_id', projectId)
    expect(sources[0]?.includeInRetrieval).toBe(true)
    expect(sources[0]?.federationPolicy).toBe('source_scoped')
  })

  it('updates knowledge source federation and refresh policy', async () => {
    const { updateKnowledgeSourcePolicy } = await import('../knowledge')
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: sourceRow({
          id: 'source-1',
          federation_policy: 'org_federated',
          refresh_policy: 'scheduled',
          refresh_interval_seconds: 3600,
        }),
        error: null,
      }),
    }
    mockFrom.mockReturnValue(chain)

    const source = await updateKnowledgeSourcePolicy({
      orgId,
      sourceId: 'source-1',
      federationPolicy: 'org_federated',
      refreshPolicy: 'scheduled',
      refreshIntervalSeconds: 3600,
    })

    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      federation_policy: 'org_federated',
      refresh_policy: 'scheduled',
      refresh_interval_seconds: 3600,
    }))
    expect(source?.federationPolicy).toBe('org_federated')
    expect(source?.refreshPolicy).toBe('scheduled')
  })
})

function upsertSourceChain(id: string) {
  return {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
  }
}

function findPageChain(row: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
}

function insertPageChain(row: unknown) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
}

function insertEventChain(id: string) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id,
        page_id: 'page-1',
        event_type: 'created',
        summary: 'Seeded project knowledge.',
        patch: 'Prefer Agent Ops workflows.',
        confidence: 0.9,
        evidence: [],
        metadata: {},
        created_at: '2026-05-06T00:00:00.000Z',
      },
      error: null,
    }),
  }
}

function insertVersionChain() {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

function updatePageChain(row: unknown) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
}

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-1',
    org_id: orgId,
    project_id: projectId,
    team_id: null,
    assistant_id: null,
    source_type: 'agent_ops',
    source_ref: null,
    label: 'Source',
    visibility: 'project',
    trust_level: 'observed',
    federation_policy: 'source_scoped',
    retention_policy: 'standard',
    status: 'active',
    include_in_retrieval: true,
    refresh_policy: 'manual',
    refresh_interval_seconds: null,
    refresh_status: 'never',
    last_seen_at: null,
    last_refreshed_at: null,
    next_refresh_at: null,
    stale_after: null,
    refresh_error: null,
    connector_key: null,
    external_etag: null,
    source_key: 'source-key',
    metadata: {},
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  }
}
