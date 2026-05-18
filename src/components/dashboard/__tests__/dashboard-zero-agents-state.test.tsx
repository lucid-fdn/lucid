import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/reveal-surface', () => ({
  RevealSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/logo-cluster-illustration', () => ({
  LogoClusterIllustration: () => <div data-testid="logo-cluster" />,
}))

import { DashboardZeroAgentsState } from '../dashboard-zero-agents-state'

describe('DashboardZeroAgentsState', () => {
  it('hands off empty projects to the agents canvas builder', () => {
    const html = renderToStaticMarkup(
      <DashboardZeroAgentsState
        workspaceSlug="acme"
        projectName="Ops"
        projectSlug="ops"
      />,
    )

    expect(html).toContain('Ops is ready for its first agent')
    expect(html).toContain('Open Agents canvas')
    expect(html).toContain('/acme/projects/ops/agents?view=canvas&amp;builder=1')
    expect(html).not.toContain('All projects')
    expect(html).not.toContain('Open project')
  })
})
