import { describe, expect, it } from 'vitest'

import {
  isLucidDeepLink,
  parseLucidDeepLink,
  parseLucidDeepLinkToWebPath,
  resolveLucidDeepLinkToWebPath,
} from '../deep-links.js'

describe('Lucid native deep links', () => {
  it('parses workspace deep links', () => {
    const parsed = parseLucidDeepLink('lucid://workspace/acme')

    expect(parsed).toEqual({
      ok: true,
      input: 'lucid://workspace/acme',
      segments: ['workspace', 'acme'],
      link: {
        kind: 'workspace',
        workspaceSlug: 'acme',
      },
    })
  })

  it('maps project agent deep links to existing web routes', () => {
    const parsed = parseLucidDeepLink('lucid://workspace/acme/projects/alpha/agents/agent_123')
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) throw new Error('expected parse success')
    expect(resolveLucidDeepLinkToWebPath(parsed.link)).toEqual({
      ok: true,
      link: parsed.link,
      path: '/acme/projects/alpha/agents/agent_123',
    })
  })

  it('maps project run links to the project runs route with a run query', () => {
    const resolved = parseLucidDeepLinkToWebPath('lucid://workspace/acme/projects/alpha/runs/run-456')

    expect(resolved).toMatchObject({
      ok: true,
      path: '/acme/projects/alpha/runs?run=run-456',
    })
  })

  it('maps Agent Ops run links to the canonical Mission Control route', () => {
    const resolved = parseLucidDeepLinkToWebPath('lucid://workspace/acme/mission-control/agent-ops/runs/run-789')

    expect(resolved).toMatchObject({
      ok: true,
      path: '/acme/mission-control/agent-ops?run=run-789',
    })
  })

  it('requires a workspace for global routine links unless a default workspace is provided', () => {
    const parsed = parseLucidDeepLink('lucid://routines/routine-1')
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) throw new Error('expected parse success')
    expect(resolveLucidDeepLinkToWebPath(parsed.link)).toMatchObject({
      ok: false,
      error: 'workspace-required',
    })
    expect(resolveLucidDeepLinkToWebPath(parsed.link, { defaultWorkspaceSlug: 'acme' })).toMatchObject({
      ok: true,
      path: '/acme/mission-control/routines/routine-1',
    })
  })

  it('rejects unsupported protocols and unsafe segments', () => {
    expect(isLucidDeepLink('https://workspace/acme')).toBe(false)
    expect(parseLucidDeepLink('https://workspace/acme')).toMatchObject({
      ok: false,
      error: 'unsupported-protocol',
    })
    expect(parseLucidDeepLink('lucid://workspace/%2Fetc')).toMatchObject({
      ok: false,
      error: 'invalid-segment',
    })
  })
})
