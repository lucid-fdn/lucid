import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../../config.js'

import {
  buildKnowledgeL2ProjectionRequest,
  calculateNextAttemptAt,
  projectKnowledgeL2Outbox,
} from '../knowledge-l2-projections.js'

describe('Knowledge L2 projection worker', () => {
  it('builds commitment-only projection requests without raw content', () => {
    const request = buildKnowledgeL2ProjectionRequest(outboxRow())

    expect(request.projection.policy).toBe('commitment_only')
    expect(request.projection.encryptedPayload).toBeNull()
    expect(JSON.stringify(request)).not.toContain('private compiled truth')
    expect(request.identity.scopedUserId).toBeNull()
    expect(request.localResource.type).toBe('project_brain')
  })

  it('projects rows to Lucid-L2 and stores receipts', async () => {
    const supabase = supabaseMock([
      selectChain([outboxRow()]),
      updateChain(),
      insertChain(),
      updateChain(),
      selectChain([]),
      selectChain([]),
      selectChain([]),
    ])
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        l2MemoryId: 'l2-memory-1',
        receiptHash: 'receipt-1',
        snapshotCid: 'bafy-snapshot',
        anchorEpochId: 'epoch-1',
        anchorStatus: 'anchored',
      }),
    })

    const result = await projectKnowledgeL2Outbox(
      supabase as unknown as SupabaseClient,
      config(),
      fetchMock as unknown as typeof fetch,
    )

    expect(result).toEqual({ scanned: 1, projected: 1, failed: 0, skipped: 0, reconciled: 0 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/v1/knowledge/projections' }),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(supabase.from).toHaveBeenCalledWith('knowledge_l2_projection_receipts')
  })

  it('does not block local product memory when L2 is not configured', async () => {
    const result = await projectKnowledgeL2Outbox(
      supabaseMock([]) as unknown as SupabaseClient,
      { ...config(), LUCID_KNOWLEDGE_L2_API_URL: undefined },
    )

    expect(result).toEqual({ scanned: 0, projected: 0, failed: 0, skipped: 1, reconciled: 0 })
  })

  it('uses capped exponential retry delays', () => {
    const now = new Date('2026-05-06T00:00:00.000Z')
    expect(calculateNextAttemptAt(1, now).getTime()).toBe(now.getTime() + 60_000)
    expect(calculateNextAttemptAt(20, now).getTime()).toBe(now.getTime() + 3_600_000)
  })
})

function outboxRow() {
  return {
    id: 'outbox-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    team_id: null,
    assistant_id: null,
    local_resource_type: 'project_brain',
    local_resource_id: 'page-1',
    projection_policy: 'commitment_only',
    namespace: 'org:222:project:333:project_brain',
    scoped_user_id: null,
    agent_passport_id: null,
    channel_type: null,
    channel_id: null,
    conversation_id: null,
    content_hash: 'hash-1',
    payload_redacted: { subject: 'Pricing', contentHash: 'hash-1' },
    encrypted_payload: null,
    attempts: 0,
    metadata: { bridge: 'test' },
  } as const
}

function config(): ReturnType<typeof getConfig> {
  return {
    LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED: true,
    LUCID_KNOWLEDGE_L2_API_URL: 'https://l2.example.test',
    LUCID_KNOWLEDGE_L2_API_TOKEN: 'secret',
    KNOWLEDGE_L2_PROJECTION_BATCH_SIZE: 10,
    KNOWLEDGE_L2_PROJECTION_REQUEST_TIMEOUT_MS: 1000,
  } as ReturnType<typeof getConfig>
}

function supabaseMock(chains: unknown[]) {
  return {
    from: vi.fn(() => chains.shift()),
  }
}

function selectChain(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

function updateChain() {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
}

function insertChain() {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}
