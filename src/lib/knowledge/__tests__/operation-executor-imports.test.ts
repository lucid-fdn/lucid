import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBoardMemory: vi.fn(),
  createKnowledgeClaim: vi.fn(),
  createKnowledgeImportJob: vi.fn(),
  deleteBoardMemory: vi.fn(),
  explainKnowledge: vi.fn(),
  findKnowledgeEntities: vi.fn(),
  findKnowledgeImportItemsByContentHashes: vi.fn(),
  getKnowledgeGraphNeighbors: vi.fn(),
  getKnowledgeImportJob: vi.fn(),
  listKnowledgeClaims: vi.fn(),
  listKnowledgeImportItems: vi.fn(),
  listKnowledgeImportJobs: vi.fn(),
  listKnowledgeSources: vi.fn(),
  queryBrain: vi.fn(),
  thinkWithKnowledge: vi.fn(),
  updateKnowledgeClaimStatus: vi.fn(),
  updateKnowledgeImportItemStatus: vi.fn(),
  updateKnowledgeImportJob: vi.fn(),
  updateKnowledgeMaintenanceEventStatus: vi.fn(),
  updateKnowledgeSourcePolicy: vi.fn(),
  upsertKnowledgeImportItems: vi.fn(),
  writeProjectKnowledge: vi.fn(),
  writeTeamKnowledge: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  createBoardMemory: mocks.createBoardMemory,
  createKnowledgeClaim: mocks.createKnowledgeClaim,
  createKnowledgeImportJob: mocks.createKnowledgeImportJob,
  deleteBoardMemory: mocks.deleteBoardMemory,
  explainKnowledge: mocks.explainKnowledge,
  findKnowledgeEntities: mocks.findKnowledgeEntities,
  findKnowledgeImportItemsByContentHashes: mocks.findKnowledgeImportItemsByContentHashes,
  getKnowledgeGraphNeighbors: mocks.getKnowledgeGraphNeighbors,
  getKnowledgeImportJob: mocks.getKnowledgeImportJob,
  listKnowledgeClaims: mocks.listKnowledgeClaims,
  listKnowledgeImportItems: mocks.listKnowledgeImportItems,
  listKnowledgeImportJobs: mocks.listKnowledgeImportJobs,
  listKnowledgeSources: mocks.listKnowledgeSources,
  updateKnowledgeClaimStatus: mocks.updateKnowledgeClaimStatus,
  updateKnowledgeImportItemStatus: mocks.updateKnowledgeImportItemStatus,
  updateKnowledgeImportJob: mocks.updateKnowledgeImportJob,
  updateKnowledgeMaintenanceEventStatus: mocks.updateKnowledgeMaintenanceEventStatus,
  updateKnowledgeSourcePolicy: mocks.updateKnowledgeSourcePolicy,
  upsertKnowledgeImportItems: mocks.upsertKnowledgeImportItems,
  writeProjectKnowledge: mocks.writeProjectKnowledge,
  writeTeamKnowledge: mocks.writeTeamKnowledge,
}))

vi.mock('@/lib/brain/query', () => ({
  queryBrain: mocks.queryBrain,
}))

vi.mock('@/lib/knowledge/think', () => ({
  thinkWithKnowledge: mocks.thinkWithKnowledge,
}))

vi.mock('@/lib/knowledge/source-safety', () => ({
  assertKnowledgeSourceUrlSafe: vi.fn(),
}))

import type { KnowledgeImportItem, KnowledgeImportJob } from '@contracts/knowledge-imports'
import { executeKnowledgeOperation, KnowledgeOperationExecutionError } from '../operation-executor'

const orgId = '22222222-2222-4222-8222-222222222222'
const jobId = '44444444-4444-4444-8444-444444444444'
const userId = '55555555-5555-4555-8555-555555555555'

function buildJob(overrides: Partial<KnowledgeImportJob> = {}): KnowledgeImportJob {
  return {
    id: jobId,
    orgId,
    projectId: '33333333-3333-4333-8333-333333333333',
    teamId: null,
    sourceType: 'channel_transcript',
    mode: 'preview',
    status: 'queued',
    itemCount: 0,
    redactionCount: 0,
    errorMessage: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function buildItem(overrides: Partial<KnowledgeImportItem> = {}): KnowledgeImportItem {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    orgId,
    importJobId: jobId,
    itemKey: 'call-1',
    itemType: 'transcript',
    status: 'preview',
    contentHash: 'a'.repeat(64),
    title: 'Customer call',
    preview: 'Customer wants weekly proof summaries.',
    redactions: [],
    outputRefs: [],
    metadata: { redacted_content: 'Customer wants weekly proof summaries.' },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('shared Knowledge import operation executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findKnowledgeImportItemsByContentHashes.mockResolvedValue([])
    mocks.updateKnowledgeImportJob.mockImplementation(async (input: Record<string, unknown>) => ({
      ...buildJob(),
      status: input.status ?? 'queued',
      itemCount: input.itemCount ?? 0,
      redactionCount: input.redactionCount ?? 0,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    }))
    mocks.upsertKnowledgeImportItems.mockImplementation(async (input: { items: unknown[] }) =>
      input.items.map((item, index) => ({
        ...buildItem({ id: `66666666-6666-4666-8666-66666666666${index}`, itemKey: `item-${index + 1}` }),
        ...(item as Record<string, unknown>),
      })),
    )
    mocks.updateKnowledgeImportItemStatus.mockImplementation(async (input: Record<string, unknown>) => ({
      ...buildItem({ id: String(input.itemId), status: input.status as KnowledgeImportItem['status'] }),
      outputRefs: (input.outputRefs as KnowledgeImportItem['outputRefs']) ?? [],
      metadata: (input.metadata as Record<string, unknown>) ?? {},
    }))
  })

  it('routes retrieve_context through the Brain query facade while preserving packet response shape', async () => {
    const packet = {
      generatedAt: new Date().toISOString(),
      mode: 'evidence',
      layers: ['org_brain'],
      query: 'pricing policy',
      budget: { maxLatencyMs: 1000, maxPromptTokens: 2000, maxItemsPerLayer: 5 },
      items: [],
      omitted: [],
      telemetry: { durationMs: 12, fallbackUsed: false },
    }
    mocks.queryBrain.mockResolvedValue({ packet })

    await expect(executeKnowledgeOperation('knowledge.retrieve_context', {
      org_id: orgId,
      query: 'pricing policy',
      mode: 'evidence',
      layers: ['org_brain'],
      budget: {
        max_latency_ms: 1000,
        max_prompt_tokens: 2000,
        max_items_per_layer: 5,
      },
    }, userId)).resolves.toBe(packet)

    expect(mocks.queryBrain).toHaveBeenCalledWith(expect.objectContaining({
      org_id: orgId,
      query: 'pricing policy',
      actorUserId: userId,
      audit: false,
      knowledgeLayers: ['org_brain'],
      surface: 'external_agent',
    }))
  })

  it('previews imports through the shared executor with dedupe and redaction', async () => {
    mocks.getKnowledgeImportJob.mockResolvedValue(buildJob())

    const result = await executeKnowledgeOperation('knowledge.imports.preview', {
      org_id: orgId,
      import_job_id: jobId,
      raw_text: [
        '### Customer call',
        '',
        'Authorization: Bearer sk-proj-this_should_never_persist_1234567890',
        'Customer wants weekly proof summaries.',
      ].join('\n'),
      metadata: { source: 'test' },
    }, userId) as {
      summary: { itemCount: number; previewItemCount: number; redactionCount: number }
    }

    expect(result.summary).toMatchObject({
      itemCount: 1,
      previewItemCount: 1,
      redactionCount: 1,
    })
    expect(mocks.findKnowledgeImportItemsByContentHashes).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      excludeImportJobId: jobId,
    }))
    const plannedItem = mocks.upsertKnowledgeImportItems.mock.calls[0]?.[0].items[0]
    expect(JSON.stringify(plannedItem)).toContain('[REDACTED_TOKEN]')
    expect(JSON.stringify(plannedItem)).not.toContain('sk-proj-this_should_never_persist')
    expect(mocks.updateKnowledgeImportJob).toHaveBeenLastCalledWith(expect.objectContaining({
      orgId,
      importJobId: jobId,
      status: 'preview_ready',
      redactionCount: 1,
    }))
  })

  it('commits previewed imports as evidence-backed claims through the shared executor', async () => {
    mocks.getKnowledgeImportJob.mockResolvedValue(buildJob({ status: 'preview_ready', itemCount: 2 }))
    mocks.listKnowledgeImportItems.mockResolvedValue([
      buildItem(),
      buildItem({
        id: '77777777-7777-4777-8777-777777777777',
        itemKey: 'duplicate',
        status: 'skipped',
      }),
    ])
    mocks.createKnowledgeClaim.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      subject: 'Customer call',
    })

    const result = await executeKnowledgeOperation('knowledge.imports.commit', {
      org_id: orgId,
      import_job_id: jobId,
      target: 'claims',
      metadata: { source: 'test' },
    }, null) as {
      summary: { committed: number; failed: number; skipped: number; outputRefs: Array<Record<string, unknown>> }
    }

    expect(result.summary).toMatchObject({ committed: 1, failed: 0, skipped: 1 })
    expect(result.summary.outputRefs[0]).toMatchObject({
      type: 'knowledge_claim',
      id: '88888888-8888-4888-8888-888888888888',
    })
    expect(mocks.createKnowledgeClaim).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      holderType: 'source',
      createdByUserId: null,
      evidence: expect.arrayContaining([expect.objectContaining({ kind: 'transcript' })]),
    }))
    expect(mocks.updateKnowledgeImportItemStatus).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      importJobId: jobId,
      status: 'committed',
    }))
    expect(mocks.updateKnowledgeImportJob).toHaveBeenLastCalledWith(expect.objectContaining({
      orgId,
      importJobId: jobId,
      status: 'committed',
      itemCount: 2,
    }))
  })

  it('returns typed execution errors for invalid import lifecycle transitions', async () => {
    mocks.getKnowledgeImportJob.mockResolvedValue(buildJob({ status: 'queued' }))

    await expect(executeKnowledgeOperation('knowledge.imports.commit', {
      org_id: orgId,
      import_job_id: jobId,
      target: 'claims',
    }, userId)).rejects.toMatchObject({
      name: 'KnowledgeOperationExecutionError',
      status: 409,
      message: 'Preview the import before committing it',
    } satisfies Partial<KnowledgeOperationExecutionError>)
  })
})
