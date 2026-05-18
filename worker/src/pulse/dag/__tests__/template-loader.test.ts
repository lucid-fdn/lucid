/**
 * Template Loader — Unit Tests (Phase 4N-a, Task 22)
 *
 * Covers:
 *   - Happy path (valid spec parses + loader returns row)
 *   - Malformed case 1: edge child references a non-existent node
 *   - Malformed case 2: duplicate node_key
 *   - Malformed case 3: self-loop (parent == child)
 *   - Not found → TemplateNotFoundError
 *
 * Cycle detection is NOT tested here — cycles are caught by
 * `cycle-detector.ts` at commit time in the planner, not at load time.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  loadTemplateBySlug,
  parseDagSpec,
  TemplateValidationError,
  TemplateNotFoundError,
} from '../template-loader.js'

function mockSupabase(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const limit = vi.fn().mockReturnValue({ maybeSingle })
  const order = vi.fn().mockReturnValue({ limit, maybeSingle })
  const or = vi.fn().mockReturnValue({
    order,
    eq: vi.fn().mockReturnValue({ maybeSingle }),
  })
  const eqIsActive = vi.fn().mockReturnValue({ or })
  const eqSlug = vi.fn().mockReturnValue({ eq: eqIsActive })
  const select = vi.fn().mockReturnValue({ eq: eqSlug })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as any
}

const VALID_SPEC = {
  nodes: [
    { node_key: 'root', node_type: 'leaf', step_type: 'inbound' },
    { node_key: 'mid', node_type: 'leaf', step_type: 'outbound' },
    { node_key: 'leaf', node_type: 'leaf', step_type: 'outbound' },
  ],
  edges: [
    { parent: 'root', child: 'mid' },
    { parent: 'mid', child: 'leaf' },
  ],
}

const VALID_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: '22222222-2222-4222-8222-222222222222',
  slug: 'research',
  name: 'Research flow',
  version: 1,
  spec: VALID_SPEC,
  schema_version: 1,
  trigger_intents: null,
  mission_type: null,
  is_active: true,
}

describe('parseDagSpec', () => {
  it('accepts a valid spec', () => {
    const parsed = parseDagSpec(VALID_SPEC)
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.edges).toHaveLength(2)
  })

  it('rejects dangling edge child', () => {
    expect(() =>
      parseDagSpec({
        ...VALID_SPEC,
        edges: [{ parent: 'root', child: 'ghost' }],
      }),
    ).toThrow(TemplateValidationError)
  })

  it('rejects duplicate node_key', () => {
    expect(() =>
      parseDagSpec({
        nodes: [
          { node_key: 'x', node_type: 'leaf' },
          { node_key: 'x', node_type: 'leaf' },
        ],
        edges: [],
      }),
    ).toThrow(/duplicate node_key/)
  })

  it('rejects self-loop', () => {
    expect(() =>
      parseDagSpec({
        nodes: [{ node_key: 'x', node_type: 'leaf' }],
        edges: [{ parent: 'x', child: 'x' }],
      }),
    ).toThrow(/self-loop/)
  })

  it('rejects missing nodes array', () => {
    expect(() => parseDagSpec({ edges: [] })).toThrow(TemplateValidationError)
  })

  it('rejects expansion_zone referencing unknown node', () => {
    expect(() =>
      parseDagSpec({
        nodes: [{ node_key: 'x', node_type: 'leaf' }],
        edges: [],
        expansion_zones: ['ghost'],
      }),
    ).toThrow(/expansion_zone/)
  })
})

describe('loadTemplateBySlug', () => {
  it('returns a fully validated row on happy path', async () => {
    const supabase = mockSupabase({ data: VALID_ROW, error: null })
    const row = await loadTemplateBySlug(supabase, VALID_ROW.org_id!, 'research')
    expect(row.slug).toBe('research')
    expect(row.spec.nodes).toHaveLength(3)
  })

  it('throws TemplateNotFoundError when no row matches', async () => {
    const supabase = mockSupabase({ data: null, error: null })
    await expect(
      loadTemplateBySlug(supabase, VALID_ROW.org_id!, 'missing'),
    ).rejects.toBeInstanceOf(TemplateNotFoundError)
  })

  it('throws on DB error', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'boom' } })
    await expect(
      loadTemplateBySlug(supabase, VALID_ROW.org_id!, 'research'),
    ).rejects.toThrow(/boom/)
  })

  it('propagates spec validation errors when row is malformed', async () => {
    const bad = {
      ...VALID_ROW,
      spec: {
        nodes: [{ node_key: 'a', node_type: 'leaf' }],
        edges: [{ parent: 'a', child: 'ghost' }],
      },
    }
    const supabase = mockSupabase({ data: bad, error: null })
    await expect(
      loadTemplateBySlug(supabase, VALID_ROW.org_id!, 'research'),
    ).rejects.toBeInstanceOf(TemplateValidationError)
  })
})
