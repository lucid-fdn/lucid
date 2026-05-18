import { describe, expect, it } from 'vitest'

import {
  buildProjectAgentDetailPath,
  buildProjectAppDetailPath,
  buildProjectAppsPath,
  buildProjectInboxPath,
  buildProjectOverviewPath,
  buildProjectSwitcherTarget,
  buildWorkspaceProjectAppsUrl,
  buildWorkspaceProjectInboxUrl,
  buildWorkspaceProjectRunsUrl,
} from '@/lib/projects/urls'

describe('project URL helpers', () => {
  it('builds canonical project routes', () => {
    expect(buildProjectOverviewPath('acme', 'default')).toBe('/acme/projects/default')
    expect(buildProjectAgentDetailPath('acme', 'default', 'asst-1')).toBe('/acme/projects/default/agents/asst-1')
    expect(buildProjectInboxPath('acme', 'default')).toBe('/acme/projects/default/inbox')
    expect(buildProjectAppsPath('acme', 'default')).toBe('/acme/projects/default/apps')
    expect(buildProjectAppDetailPath('acme', 'default', 'app-1')).toBe('/acme/projects/default/apps/app-1')
  })

  it('preserves the current subpage when switching projects', () => {
    expect(buildProjectSwitcherTarget('acme', 'ops', '/acme/projects/default/runs')).toBe('/acme/projects/ops/runs')
    expect(buildProjectSwitcherTarget('acme', 'ops', '/acme/projects/default/agents/asst-1')).toBe('/acme/projects/ops/agents/asst-1')
  })

  it('falls back to project overview when switching from a non-project route', () => {
    expect(buildProjectSwitcherTarget('acme', 'ops', '/acme/templates')).toBe('/acme/projects/ops')
  })

  it('builds workspace-scoped URLs through the shared workspace helper', () => {
    expect(buildWorkspaceProjectRunsUrl('default', 'acme', [{ slug: 'acme' }])).toBe('/acme/projects/default/runs')
    expect(buildWorkspaceProjectInboxUrl('default', 'acme', [{ slug: 'acme' }])).toBe('/acme/projects/default/inbox')
    expect(buildWorkspaceProjectAppsUrl('default', 'acme', [{ slug: 'acme' }])).toBe('/acme/projects/default/apps')
  })
})
