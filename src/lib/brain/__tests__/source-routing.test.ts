import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListKnowledgeSources = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db/knowledge', () => ({
  listKnowledgeSources: (...args: unknown[]) => mockListKnowledgeSources(...args),
}))

import { resolveBrainSource } from '../source-routing'

describe('resolveBrainSource', () => {
  beforeEach(() => {
    mockListKnowledgeSources.mockReset()
  })

  it('uses an explicit source id when provided', async () => {
    mockListKnowledgeSources.mockResolvedValueOnce([
      {
        id: 'source-1',
        sourceKey: 'workspace/notion',
        federationPolicy: 'org_federated',
        metadata: {},
      },
    ])

    await expect(resolveBrainSource({
      orgId: 'org-1',
      sourceId: 'source-1',
    })).resolves.toMatchObject({
      brainId: 'org-1',
      sourceId: 'source-1',
      sourceKey: 'workspace/notion',
      federated: true,
    })

    expect(mockListKnowledgeSources).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      sourceId: 'source-1',
      includeArchived: true,
    }))
  })

  it('prefers scoped project/team sources before workspace defaults', async () => {
    mockListKnowledgeSources.mockResolvedValueOnce([
      {
        id: 'project-source',
        sourceKey: 'project/spec',
        federationPolicy: 'source_scoped',
        metadata: {},
      },
    ])

    await expect(resolveBrainSource({
      orgId: 'org-1',
      projectId: 'project-1',
      teamId: 'team-1',
    })).resolves.toMatchObject({
      sourceId: 'project-source',
      sourceKey: 'project/spec',
      federated: true,
    })

    expect(mockListKnowledgeSources).toHaveBeenCalledTimes(1)
  })

  it('falls back to a virtual workspace default when no source exists', async () => {
    mockListKnowledgeSources
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await expect(resolveBrainSource({ orgId: 'org-1' })).resolves.toMatchObject({
      brainId: 'org-1',
      sourceId: null,
      sourceKey: 'workspace/default',
      source: null,
      federated: true,
    })
  })
})
