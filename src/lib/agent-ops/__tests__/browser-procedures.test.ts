import { describe, expect, it } from 'vitest'

import {
  browserHostMatchesPattern,
  buildBrowserProcedureContentHash,
  createBrowserProcedureInputSchema,
  normalizeBrowserHostPattern,
  normalizeBrowserProcedureSlug,
  rankBrowserProcedureMatches,
  type AgentOpsBrowserProcedure,
} from '../browser-procedures'

const baseProcedure: AgentOpsBrowserProcedure = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  hostPattern: 'www.example.com',
  name: 'Check homepage',
  slug: 'check-homepage',
  description: 'Validate the public homepage.',
  intentTriggers: ['check homepage', 'qa homepage'],
  procedureType: 'qa',
  scope: 'project',
  trustState: 'active',
  sourceRunId: null,
  createdByUserId: null,
  createdByAgentId: null,
  metadata: {},
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
}

describe('browser procedures', () => {
  it('normalizes slugs and host patterns deterministically', () => {
    expect(normalizeBrowserProcedureSlug(' QA: Checkout / Portal! ')).toBe('qa-checkout-portal')
    expect(normalizeBrowserHostPattern('https://WWW.Example.com:443/path?q=1')).toBe('www.example.com')
  })

  it('matches exact, wildcard, and global host patterns', () => {
    expect(browserHostMatchesPattern('app.example.com', 'app.example.com')).toBe(true)
    expect(browserHostMatchesPattern('app.example.com', '*.example.com')).toBe(true)
    expect(browserHostMatchesPattern('example.com', '*.example.com')).toBe(false)
    expect(browserHostMatchesPattern('anything.test', '*')).toBe(true)
  })

  it('ranks active project exact-host procedures above broader drafts', () => {
    const matches = rankBrowserProcedureMatches([
      {
        ...baseProcedure,
        id: '44444444-4444-4444-8444-444444444444',
        hostPattern: '*.example.com',
        scope: 'org',
        projectId: null,
        trustState: 'draft',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
      baseProcedure,
    ], {
      host: 'https://www.example.com/',
      intent: 'please check homepage',
    })

    expect(matches).toHaveLength(2)
    expect(matches[0]?.procedure.id).toBe(baseProcedure.id)
    expect(matches[0]?.reasons).toEqual(expect.arrayContaining(['active', 'host_exact', 'project_scope', 'intent_trigger']))
  })

  it('excludes blocked and quarantined procedures from runnable matches', () => {
    const matches = rankBrowserProcedureMatches([
      { ...baseProcedure, trustState: 'blocked' },
      { ...baseProcedure, id: '55555555-5555-4555-8555-555555555555', trustState: 'quarantined' },
    ], {
      host: 'www.example.com',
      intent: 'check homepage',
    })

    expect(matches).toEqual([])
  })

  it('builds stable content hashes independent of object key order', () => {
    const first = buildBrowserProcedureContentHash({
      definition: { steps: [{ action: 'click', selector: '#buy' }], goal: 'checkout' },
      testDefinition: { assertions: ['success'] },
      capabilities: ['tool:browser', 'advanced:browser-procedures'],
    })
    const second = buildBrowserProcedureContentHash({
      definition: { goal: 'checkout', steps: [{ selector: '#buy', action: 'click' }] },
      testDefinition: { assertions: ['success'] },
      capabilities: ['advanced:browser-procedures', 'tool:browser'],
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('validates project scope explicitly to avoid ambiguous ownership', () => {
    const parsed = createBrowserProcedureInputSchema.safeParse({
      orgId: baseProcedure.orgId,
      hostPattern: 'www.example.com',
      name: 'Check homepage',
      description: 'Validate the public homepage.',
      scope: 'project',
    })

    expect(parsed.success).toBe(false)
  })
})
