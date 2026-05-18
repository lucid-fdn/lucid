import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { getConfig } from '../../config.js'

import {
  calculateKnowledgeSourceStaleAfter,
  calculateNextKnowledgeSourceRefreshAt,
  runKnowledgeSourceRefreshJobs,
} from '../knowledge-source-refresh.js'

describe('Knowledge source refresh worker', () => {
  it('marks changed URL sources stale so Brain Ops can request re-ingestion', async () => {
    const patches: Array<Record<string, unknown>> = []
    const supabase = supabaseMock([
      selectChain([sourceRow({ external_etag: '"old"' })]),
      updateChain(patches),
      updateChain(patches),
    ])
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { etag: '"new"', 'content-length': '123' },
    }))

    const result = await runKnowledgeSourceRefreshJobs(
      supabase as unknown as SupabaseClient,
      config(),
      fetchMock as unknown as typeof fetch,
    )

    expect(result).toEqual({ scanned: 1, refreshed: 1, changed: 1, failed: 0, skipped: 0 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: 'https://example.com/docs' }),
      expect.objectContaining({ method: 'HEAD' }),
    )
    expect(patches.at(-1)).toMatchObject({
      refresh_status: 'ok',
      status: 'stale',
      external_etag: '"new"',
      refresh_error: null,
    })
  })

  it('fails unsupported scheduled sources visibly instead of silently pretending they refreshed', async () => {
    const patches: Array<Record<string, unknown>> = []
    const supabase = supabaseMock([
      selectChain([sourceRow({ source_type: 'manual', source_ref: null })]),
      updateChain(patches),
      updateChain(patches),
    ])
    const fetchMock = vi.fn()

    const result = await runKnowledgeSourceRefreshJobs(
      supabase as unknown as SupabaseClient,
      config(),
      fetchMock as unknown as typeof fetch,
    )

    expect(result).toEqual({ scanned: 1, refreshed: 0, changed: 0, failed: 1, skipped: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(patches.at(-1)).toMatchObject({
      refresh_status: 'failed',
      status: 'errored',
      refresh_error: 'unsupported_scheduled_source_type',
    })
  })

  it('can scope manual refresh sweeps to one organization', async () => {
    const select = selectChain([])
    const supabase = supabaseMock([select])

    await runKnowledgeSourceRefreshJobs(
      supabase as unknown as SupabaseClient,
      config(),
      vi.fn() as unknown as typeof fetch,
      { orgId: '22222222-2222-4222-8222-222222222222' },
    )

    expect(select.eq).toHaveBeenCalledWith('org_id', '22222222-2222-4222-8222-222222222222')
  })

  it('calculates refresh and stale windows from source policy first', () => {
    const now = new Date('2026-05-06T00:00:00.000Z')
    expect(calculateNextKnowledgeSourceRefreshAt({ refresh_interval_seconds: 600 }, config(), now))
      .toBe('2026-05-06T00:10:00.000Z')
    expect(calculateKnowledgeSourceStaleAfter({ refresh_interval_seconds: 600 }, config(), now))
      .toBe('2026-05-06T00:20:00.000Z')
  })
})

function sourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'source-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    team_id: null,
    source_type: 'url',
    source_ref: 'https://example.com/docs',
    label: 'Docs',
    status: 'active',
    refresh_interval_seconds: 3600,
    refresh_status: 'ok',
    external_etag: null,
    connector_key: null,
    ...overrides,
  }
}

function config(): ReturnType<typeof getConfig> {
  return {
    KNOWLEDGE_SOURCE_REFRESH_BATCH_SIZE: 10,
    KNOWLEDGE_SOURCE_REFRESH_REQUEST_TIMEOUT_MS: 1000,
    KNOWLEDGE_SOURCE_REFRESH_DEFAULT_INTERVAL_SECONDS: 86400,
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
    neq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

function updateChain(patches: Array<Record<string, unknown>>) {
  const chain = {
    update: vi.fn((patch: Record<string, unknown>) => {
      patches.push(patch)
      return chain
    }),
    eq: vi.fn(() => {
      if (chain.eq.mock.calls.length >= 2) return Promise.resolve({ error: null })
      return chain
    }),
  }
  return chain
}
