import { describe, expect, it, vi } from 'vitest'

import { buildBrainOpsMaintenanceEvents, runKnowledgeBrainOps } from '../brain-ops.js'

const now = new Date('2026-05-06T12:00:00.000Z')
const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'

describe('Knowledge Brain Ops maintenance', () => {
  it('detects stale sources, missing citations, orphan entities, contradictions, and weekly briefings', () => {
    const events = buildBrainOpsMaintenanceEvents({
      now,
      sources: [{
        id: 'source-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        label: 'Repo docs',
        source_type: 'repo',
        source_ref: 'github:lucid',
        status: 'active',
        refresh_status: 'ok',
        last_refreshed_at: '2026-01-01T00:00:00.000Z',
        stale_after: null,
        refresh_error: null,
      }],
      pages: [{
        id: 'page-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        subject: 'Checkout policy',
        status: 'active',
        confidence: 0.8,
        evidence: [],
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
      entities: [
        {
          id: 'entity-1',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          canonical_name: 'Checkout',
          entity_type: 'topic',
          confidence: 0.8,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'entity-2',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          canonical_name: 'Payments',
          entity_type: 'topic',
          confidence: 0.8,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'entity-3',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          canonical_name: 'Lonely entity',
          entity_type: 'topic',
          confidence: 0.8,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      relationships: [
        {
          id: 'rel-1',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          source_entity_id: 'entity-1',
          target_entity_id: 'entity-2',
          relation_type: 'blocks',
          confidence: 0.8,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'rel-2',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          source_entity_id: 'entity-2',
          target_entity_id: 'entity-1',
          relation_type: 'depends_on',
          confidence: 0.8,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          assistant_id: null,
          claim_type: 'decision',
          subject: 'Launch policy',
          claim: 'Launches require QA evidence.',
          status: 'active',
          confidence: 0.9,
          weight: 0.8,
          evidence: [],
          valid_until: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'claim-2',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          assistant_id: null,
          claim_type: 'bet',
          subject: 'Deprecated checkout signal',
          claim: 'Old checkout signal is still valid.',
          status: 'active',
          confidence: 0.7,
          weight: 0.5,
          evidence: [{ kind: 'run', runId: 'run-1' }],
          valid_until: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      embeddingStats: {
        total_chunks: 10,
        missing_embedding_chunks: 3,
        dimension_mismatch_chunks: 1,
        provider_mismatch_chunks: 1,
        ready_documents: 3,
        errored_documents: 1,
        expected_dimensions: 1536,
        expected_provider_id: 'lucid:text-embedding-3-small',
      },
      l2ProjectionLagRows: [{
        id: 'outbox-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        local_resource_type: 'knowledge_page',
        local_resource_id: 'page-1',
        status: 'failed',
        attempts: 3,
        next_attempt_at: '2026-05-06T11:00:00.000Z',
        last_error: 'timeout',
        created_at: '2026-05-06T10:00:00.000Z',
        updated_at: '2026-05-06T11:00:00.000Z',
      }],
    })

    expect(events.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      'source_stale',
      'consolidation_due',
      'citation_audit',
      'claim_no_evidence',
      'claim_expired',
      'claim_stale',
      'embedding_dimension_mismatch',
      'embedding_provider_mismatch',
      'vector_index_degraded',
      'l2_projection_lagging',
      'orphan_entity',
      'contradiction_candidate',
      'weekly_project_briefing',
    ]))
  })

  it('does not flag fresh cited pages or connected entities', () => {
    const events = buildBrainOpsMaintenanceEvents({
      now,
      sources: [],
      pages: [{
        id: 'page-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        subject: 'Fresh page',
        status: 'active',
        confidence: 0.9,
        evidence: [{ kind: 'run', runId: 'run-1' }],
        updated_at: '2026-05-01T00:00:00.000Z',
      }],
      entities: [
        {
          id: 'entity-1',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          canonical_name: 'Browser Operator',
          entity_type: 'agent',
          confidence: 0.9,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'entity-2',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          canonical_name: 'Slack',
          entity_type: 'integration',
          confidence: 0.9,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ],
      relationships: [{
        id: 'rel-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        source_entity_id: 'entity-1',
        target_entity_id: 'entity-2',
        relation_type: 'uses',
        confidence: 0.8,
        updated_at: '2026-05-01T00:00:00.000Z',
      }],
      claims: [{
        id: 'claim-1',
        org_id: orgId,
        project_id: projectId,
        team_id: null,
        assistant_id: null,
        claim_type: 'decision',
        subject: 'Fresh cited claim',
        claim: 'This claim has evidence.',
        status: 'active',
        confidence: 0.9,
        weight: 0.8,
        evidence: [{ kind: 'run', runId: 'run-1' }],
        valid_until: null,
        updated_at: '2026-05-01T00:00:00.000Z',
      }],
      embeddingStats: {
        total_chunks: 4,
        missing_embedding_chunks: 0,
        dimension_mismatch_chunks: 0,
        provider_mismatch_chunks: 0,
        ready_documents: 1,
        errored_documents: 0,
        expected_dimensions: 1536,
        expected_provider_id: 'lucid:text-embedding-3-small',
      },
      l2ProjectionLagRows: [],
    })

    expect(events.some((event) => event.event_type === 'citation_audit')).toBe(false)
    expect(events.some((event) => event.event_type === 'claim_no_evidence')).toBe(false)
    expect(events.some((event) => event.event_type === 'orphan_entity')).toBe(false)
  })

  it('flags semantic claim conflicts and claim embedding drift', () => {
    const events = buildBrainOpsMaintenanceEvents({
      now,
      sources: [],
      pages: [],
      entities: [],
      relationships: [],
      claims: [
        {
          id: 'claim-allow',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          assistant_id: null,
          claim_type: 'decision',
          subject: 'Launch QA policy',
          claim: 'Launches may ship after QA proof is attached.',
          status: 'active',
          confidence: 0.92,
          weight: 0.8,
          evidence: [{ kind: 'run', runId: 'run-1' }],
          valid_until: null,
          updated_at: '2026-05-06T10:00:00.000Z',
          embedding_status: 'ready',
          embedding_provider_id: 'lucid:text-embedding-3-small',
          embedding_model: 'text-embedding-3-small',
          semantic_fingerprint: 'fingerprint-allow',
          semantic_cluster_key: 'launch-qa-policy',
        },
        {
          id: 'claim-block',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          assistant_id: null,
          claim_type: 'decision',
          subject: 'Launch QA policy',
          claim: 'Launches must not ship after QA proof is attached.',
          status: 'active',
          confidence: 0.88,
          weight: 0.8,
          evidence: [{ kind: 'run', runId: 'run-2' }],
          valid_until: null,
          updated_at: '2026-05-06T11:00:00.000Z',
          embedding_status: 'error',
          embedding_provider_id: 'lucid:text-embedding-3-small',
          embedding_model: 'text-embedding-3-small',
          semantic_fingerprint: 'fingerprint-block',
          semantic_cluster_key: 'launch-qa-policy',
        },
      ],
      embeddingStats: {
        total_chunks: 0,
        missing_embedding_chunks: 0,
        dimension_mismatch_chunks: 0,
        provider_mismatch_chunks: 0,
        ready_documents: 0,
        errored_documents: 0,
        expected_dimensions: 1536,
        expected_provider_id: 'lucid:text-embedding-3-small',
      },
      l2ProjectionLagRows: [],
    })

    expect(events.map((event) => event.event_type)).toEqual(expect.arrayContaining(['claim_conflict', 'vector_index_degraded']))
    const conflict = events.find((event) => event.event_type === 'claim_conflict')
    expect(conflict?.metadata).toMatchObject({
      semanticClusterKey: 'launch-qa-policy',
      conflictingClaimIds: ['claim-block'],
    })
  })

  it('does not flag semantic claim conflicts across project boundaries', () => {
    const events = buildBrainOpsMaintenanceEvents({
      now,
      sources: [],
      pages: [],
      entities: [],
      relationships: [],
      claims: [
        {
          id: 'claim-project-a',
          org_id: orgId,
          project_id: projectId,
          team_id: null,
          assistant_id: null,
          claim_type: 'decision',
          subject: 'Launch QA policy',
          claim: 'Launches may ship after QA proof is attached.',
          status: 'active',
          confidence: 0.92,
          weight: 0.8,
          evidence: [{ kind: 'run', runId: 'run-1' }],
          valid_until: null,
          updated_at: '2026-05-06T10:00:00.000Z',
          embedding_status: 'ready',
          semantic_cluster_key: 'launch-qa-policy',
        },
        {
          id: 'claim-project-b',
          org_id: orgId,
          project_id: '44444444-4444-4444-8444-444444444444',
          team_id: null,
          assistant_id: null,
          claim_type: 'decision',
          subject: 'Launch QA policy',
          claim: 'Launches must not ship after QA proof is attached.',
          status: 'active',
          confidence: 0.9,
          weight: 0.8,
          evidence: [{ kind: 'run', runId: 'run-2' }],
          valid_until: null,
          updated_at: '2026-05-06T11:00:00.000Z',
          embedding_status: 'ready',
          semantic_cluster_key: 'launch-qa-policy',
        },
      ],
      embeddingStats: null,
      l2ProjectionLagRows: [],
    })

    expect(events.some((event) => event.event_type === 'claim_conflict')).toBe(false)
  })

  it('can run an org-scoped manual scan without sweeping every organization', async () => {
    const orgEq = vi.fn().mockReturnThis()
    const organizationQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: orgEq,
      limit: vi.fn().mockResolvedValue({ data: [{ id: orgId }], error: null }),
    }
    const emptyQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const from = vi.fn((table: string) => {
      if (table === 'organizations') return organizationQuery
      if (['knowledge_sources', 'knowledge_pages', 'knowledge_entities', 'knowledge_relationships', 'knowledge_claims'].includes(table)) {
        return { ...emptyQuery }
      }
      if (table === 'knowledge_l2_projection_outbox') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })
    const rpc = vi.fn().mockResolvedValue({
      data: {
        total_chunks: 0,
        missing_embedding_chunks: 0,
        dimension_mismatch_chunks: 0,
        provider_mismatch_chunks: 0,
        ready_documents: 0,
        errored_documents: 0,
        expected_dimensions: 1536,
        expected_provider_id: 'lucid:text-embedding-3-small',
      },
      error: null,
    })

    const result = await runKnowledgeBrainOps({ from, rpc } as never, {
      KNOWLEDGE_BRAIN_OPS_ORG_BATCH_SIZE: 50,
      KNOWLEDGE_BRAIN_OPS_SCAN_LIMIT: 250,
      KNOWLEDGE_EMBEDDING_EXPECTED_DIMENSIONS: 1536,
      KNOWLEDGE_EMBEDDING_PROVIDER_ID: 'lucid:text-embedding-3-small',
    } as never, { orgId })

    expect(orgEq).toHaveBeenCalledWith('id', orgId)
    expect(rpc).toHaveBeenCalledWith('knowledge_embedding_doctor_stats', {
      p_org_id: orgId,
      p_expected_dimensions: 1536,
      p_expected_provider_id: 'lucid:text-embedding-3-small',
    })
    expect(organizationQuery.limit).toHaveBeenCalledWith(1)
    expect(result).toEqual({ scannedOrgs: 1, eventsWritten: 0, staleSourcesUpdated: 0 })
  })
})
