import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchWorkspaceProjects } from '@/hooks/use-projects'

describe('fetchWorkspaceProjects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns project options from the workspace projects API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            { id: 'project-1', name: 'Ops', slug: 'ops', is_default: false },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWorkspaceProjects('org-1')).resolves.toEqual([
      { id: 'project-1', name: 'Ops', slug: 'ops', is_default: false },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/org-1/projects', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
  })

  it('throws when the workspace projects API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    )

    await expect(fetchWorkspaceProjects('org-1')).rejects.toThrow('Failed to load projects')
  })
})
