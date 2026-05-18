import { describe, expect, it } from 'vitest'

import { getProjectRouteState } from '@/lib/projects/route-state'

describe('getProjectRouteState', () => {
  it('returns project scope for project routes', () => {
    expect(getProjectRouteState('/acme/projects/ops/agents/asst-1', 'acme')).toEqual({
      inWorkspace: true,
      inProject: true,
      projectSlug: 'ops',
      subpage: 'agents',
      suffixSegments: ['agents', 'asst-1'],
      workspaceSegments: ['projects', 'ops', 'agents', 'asst-1'],
    })
  })

  it('returns non-project workspace state for workspace pages', () => {
    expect(getProjectRouteState('/acme/templates', 'acme')).toEqual({
      inWorkspace: true,
      inProject: false,
      projectSlug: null,
      subpage: null,
      suffixSegments: [],
      workspaceSegments: ['templates'],
    })
  })

  it('returns empty state when outside the workspace', () => {
    expect(getProjectRouteState('/other/projects/ops', 'acme')).toEqual({
      inWorkspace: false,
      inProject: false,
      projectSlug: null,
      subpage: null,
      suffixSegments: [],
      workspaceSegments: [],
    })
  })
})
