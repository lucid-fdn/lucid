import { describe, expect, it } from 'vitest'

import {
  resolveDesktopDeepLink,
  workspaceSlugFromPathname,
} from '../desktop'

describe('desktop native web bridge helpers', () => {
  it('resolves supported Lucid links to existing app routes', () => {
    expect(resolveDesktopDeepLink('lucid://workspace/acme/mission-control/agent-ops/runs/run_123')).toEqual({
      ok: true,
      source: 'lucid://workspace/acme/mission-control/agent-ops/runs/run_123',
      path: '/acme/mission-control/agent-ops?run=run_123',
    })
  })

  it('uses the current workspace slug for global routine deep links', () => {
    expect(resolveDesktopDeepLink('lucid://routines/routine_123', 'acme')).toMatchObject({
      ok: true,
      path: '/acme/mission-control/routines/routine_123',
    })
  })

  it('rejects unsupported links without throwing', () => {
    expect(resolveDesktopDeepLink('https://lucid.example')).toEqual({
      ok: false,
      source: 'https://lucid.example',
      error: 'not-lucid-deep-link',
    })
  })

  it('extracts workspace slugs from app pathnames while ignoring global routes', () => {
    expect(workspaceSlugFromPathname('/acme/mission-control')).toBe('acme')
    expect(workspaceSlugFromPathname('/settings/profile')).toBeNull()
    expect(workspaceSlugFromPathname('/dashboard')).toBeNull()
  })
})
