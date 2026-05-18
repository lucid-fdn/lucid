/**
 * Description Builder — Unit tests for buildDescription + marker roundtrip.
 */

import { describe, it, expect } from 'vitest'
import type { HumanWorkItemLite } from '@contracts/pm-adapter'
import {
  buildDescription,
  extractWorkItemIdFromBody,
  LUCID_WORK_ITEM_MARKER_PREFIX,
  LUCID_WORK_ITEM_MARKER_REGEX,
} from '../description-builder'

function makeWi(overrides: Partial<HumanWorkItemLite> = {}): HumanWorkItemLite {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    orgId: 'org-1',
    title: 'Do the thing',
    description: 'This is the body.',
    priority: 'normal',
    labels: [],
    status: 'open',
    resolution: null,
    assigneeUserId: null,
    assigneeRole: null,
    dueAt: null,
    createdAt: '2026-04-08T00:00:00Z',
    updatedAt: '2026-04-08T00:00:00Z',
    ...overrides,
  }
}

describe('buildDescription', () => {
  it('prefixes the hidden work-item marker', () => {
    const body = buildDescription(makeWi())
    expect(body.startsWith(LUCID_WORK_ITEM_MARKER_PREFIX)).toBe(true)
    expect(body).toContain('11111111-2222-3333-4444-555555555555')
  })

  it('includes the description body', () => {
    const body = buildDescription(makeWi({ description: 'Reach out to Acme.' }))
    expect(body).toContain('Reach out to Acme.')
  })

  it('uses a placeholder when description is empty/null', () => {
    expect(buildDescription(makeWi({ description: null }))).toContain(
      '_No description provided._',
    )
    expect(buildDescription(makeWi({ description: '  ' }))).toContain(
      '_No description provided._',
    )
  })

  it('renders DAG context block when present', () => {
    const body = buildDescription(
      makeWi({
        dagContext: {
          dagId: 'dag-1',
          dagNodeId: 'node-7',
          downstreamBlockedCount: 3,
        },
      }),
    )
    expect(body).toContain('**Lucid DAG Context**')
    expect(body).toContain('dag-1')
    expect(body).toContain('node-7')
    expect(body).toContain('**3** node(s)')
  })

  it('omits DAG context block when dagContext is null', () => {
    const body = buildDescription(makeWi({ dagContext: null }))
    expect(body).not.toContain('Lucid DAG Context')
  })

  it('renders labels footer when labels are present', () => {
    const body = buildDescription(makeWi({ labels: ['urgent', 'customer'] }))
    expect(body).toContain('`urgent`')
    expect(body).toContain('`customer`')
  })
})

describe('extractWorkItemIdFromBody', () => {
  it('roundtrips an id through the marker', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const body = buildDescription(makeWi({ id }))
    expect(extractWorkItemIdFromBody(body)).toBe(id)
  })

  it('returns null for a body with no marker', () => {
    expect(extractWorkItemIdFromBody('nothing here')).toBeNull()
  })

  it('returns null for null/undefined/empty', () => {
    expect(extractWorkItemIdFromBody(null)).toBeNull()
    expect(extractWorkItemIdFromBody(undefined)).toBeNull()
    expect(extractWorkItemIdFromBody('')).toBeNull()
  })

  it('marker regex is case-insensitive and whitespace-tolerant', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    expect(
      `<!--   lucid-work-item:   ${id}   -->`.match(LUCID_WORK_ITEM_MARKER_REGEX)?.[1],
    ).toBe(id)
  })
})
