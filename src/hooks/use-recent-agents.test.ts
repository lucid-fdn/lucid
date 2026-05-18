import { describe, expect, it } from 'vitest'

import { normalizeRecentAgents } from '@/hooks/use-recent-agents'

describe('normalizeRecentAgents', () => {
  it('preserves explicit project scope for recent agent entries', () => {
    expect(
      normalizeRecentAgents([
        {
          id: 'agent-1',
          name: 'Ops Bot',
          slug: 'acme',
          projectSlug: 'growth',
          visitedAt: 123,
        },
      ]),
    ).toEqual([
      {
        id: 'agent-1',
        name: 'Ops Bot',
        slug: 'acme',
        projectSlug: 'growth',
        visitedAt: 123,
      },
    ])
  })

  it('drops old entries that do not include a real project scope', () => {
    expect(
      normalizeRecentAgents([
        {
          id: 'agent-1',
          name: 'Ops Bot',
          slug: 'acme',
          visitedAt: 123,
        },
      ]),
    ).toEqual([])
  })

  it('drops malformed entries instead of throwing', () => {
    expect(
      normalizeRecentAgents([
        {
          id: 'agent-1',
          name: 'Ops Bot',
          slug: 'acme',
          visitedAt: 123,
        },
        { nope: true },
        null,
      ]),
    ).toHaveLength(0)
  })
})
