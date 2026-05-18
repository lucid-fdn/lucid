import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { requireUserIdMock, getWorkspaceWithAccessMock } = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getWorkspaceWithAccessMock: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  requireUserId: requireUserIdMock,
}))

vi.mock('@/lib/workspace', () => ({
  getWorkspaceWithAccess: getWorkspaceWithAccessMock,
}))

vi.mock('@/components/mission-control/mission-control-section-shell', () => ({
  MissionControlSectionShell: ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  ),
}))

vi.mock('@/components/browser-operator/browser-operator-console', () => ({
  BrowserOperatorConsole: (props: Record<string, unknown>) => (
    <div data-testid="browser-operator-console">{JSON.stringify(props)}</div>
  ),
}))

import BrowserOperatorPage from '../browser/page'

describe('Mission Control Browser Operator page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUserIdMock.mockResolvedValue('user-1')
    getWorkspaceWithAccessMock.mockResolvedValue({
      id: 'org-1',
      slug: 'acme',
      name: 'Acme',
    })
  })

  it('renders the Browser Operator shell with workspace scope', async () => {
    const html = renderToStaticMarkup(await BrowserOperatorPage({
      params: Promise.resolve({ 'workspace-slug': 'acme' }),
    }))

    expect(html).toContain('Browser Operator')
    expect(html).toContain('browser automation, live handoffs, and safety evidence')
    expect(html).toContain('browser-operator-console')
    expect(html).toContain('&quot;orgId&quot;:&quot;org-1&quot;')
    expect(html).toContain('&quot;workspaceSlug&quot;:&quot;acme&quot;')
  })
})
