import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchProjectAttentionSummary, getProjectAttentionCount } from './use-project-attention'

describe('project attention helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the attention summary from the project API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: {
          approvals: 2,
          failedRuns: 1,
          activeRuns: 3,
          openWorkItems: 4,
          criticalEvents: 2,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchProjectAttentionSummary('org-1', 'project-1')).resolves.toEqual({
      approvals: 2,
      failedRuns: 1,
      activeRuns: 3,
      openWorkItems: 4,
      criticalEvents: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/org-1/projects/project-1/attention')
  })

  it('computes the inbox badge count from actionable attention only', () => {
    expect(getProjectAttentionCount({
      approvals: 2,
      failedRuns: 1,
      activeRuns: 7,
      openWorkItems: 4,
      criticalEvents: 2,
    })).toBe(9)
  })
})
