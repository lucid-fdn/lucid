/**
 * Workflow Templates DB layer tests (mock Supabase).
 *
 * Covers CRUD + cross-org RLS isolation, spec validation via Zod,
 * 23505 → null mapping, and the global-row read-only invariant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const TEMPLATE_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'

function validSpec() {
  return {
    nodes: [
      { node_key: 'start', node_type: 'leaf', step_type: 'inbound' },
      { node_key: 'end', node_type: 'leaf', step_type: 'outbound' },
    ],
    edges: [{ parent: 'start', child: 'end' }],
  }
}

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_ID,
    org_id: ORG_A,
    slug: 'demo',
    name: 'Demo Template',
    description: null,
    version: 1,
    spec: validSpec(),
    schema_version: 1,
    trigger_intents: null,
    mission_type: null,
    is_active: true,
    created_by: USER_ID,
    created_at: '2026-04-07T00:00:00Z',
    ...overrides,
  }
}

describe('dag-templates DB layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listDagTemplates', () => {
    it('returns templates visible to the org (org rows + global)', async () => {
      const { listDagTemplates } = await import('../dag-templates')

      const rows = [
        validRow(),
        validRow({ id: 'global-1', org_id: null, slug: 'global-tpl' }),
      ]

      const chain = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await listDagTemplates(ORG_A)

      expect(mockFrom).toHaveBeenCalledWith('orchestration_dag_templates')
      expect(chain.or).toHaveBeenCalledWith(`org_id.eq.${ORG_A},org_id.is.null`)
      expect(result).toHaveLength(2)
      expect(result[0].org_id).toBe(ORG_A)
      expect(result[1].org_id).toBeNull()
    })

    it('applies activeOnly filter when requested', async () => {
      const { listDagTemplates } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockFrom.mockReturnValue(chain)

      await listDagTemplates(ORG_A, { activeOnly: true })

      expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('returns empty array on error', async () => {
      const { listDagTemplates } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await listDagTemplates(ORG_A)
      expect(result).toEqual([])
    })
  })

  describe('getDagTemplate', () => {
    it('returns the template when visible to the org', async () => {
      const { getDagTemplate } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: validRow(), error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await getDagTemplate(ORG_A, TEMPLATE_ID)

      expect(chain.or).toHaveBeenCalledWith(`org_id.eq.${ORG_A},org_id.is.null`)
      expect(result?.id).toBe(TEMPLATE_ID)
    })

    it('returns null when no row matches (cross-org isolation)', async () => {
      const { getDagTemplate } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await getDagTemplate(ORG_B, TEMPLATE_ID)
      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      const { getDagTemplate } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await getDagTemplate(ORG_A, TEMPLATE_ID)
      expect(result).toBeNull()
    })
  })

  describe('createDagTemplate', () => {
    it('inserts a new template with defaults', async () => {
      const { createDagTemplate } = await import('../dag-templates')

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: validRow(), error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await createDagTemplate(ORG_A, USER_ID, {
        slug: 'demo',
        name: 'Demo Template',
        spec: validSpec(),
      })

      expect(result?.id).toBe(TEMPLATE_ID)
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: ORG_A,
          slug: 'demo',
          name: 'Demo Template',
          version: 1,
          schema_version: 1,
          is_active: true,
          created_by: USER_ID,
        }),
      )
    })

    it('returns null on duplicate (23505)', async () => {
      const { createDagTemplate } = await import('../dag-templates')

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'unique_violation' },
        }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await createDagTemplate(ORG_A, USER_ID, {
        slug: 'demo',
        name: 'Demo Template',
        spec: validSpec(),
      })

      expect(result).toBeNull()
    })

    it('rejects invalid slug via Zod', async () => {
      const { createDagTemplate } = await import('../dag-templates')

      await expect(
        createDagTemplate(ORG_A, USER_ID, {
          slug: 'Invalid Slug!',
          name: 'Demo',
          spec: validSpec(),
        }),
      ).rejects.toThrow()
    })

    it('rejects invalid spec via dagSpecSchema', async () => {
      const { createDagTemplate } = await import('../dag-templates')

      await expect(
        createDagTemplate(ORG_A, USER_ID, {
          slug: 'demo',
          name: 'Demo',
          // edge references undeclared node — but this is structural validation
          // dagSpecSchema only validates shape, so we trip it with empty nodes
          spec: { nodes: [], edges: [] } as never,
        }),
      ).rejects.toThrow()
    })

    it('throws on non-23505 DB error', async () => {
      const { createDagTemplate } = await import('../dag-templates')

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42P01', message: 'undefined_table' },
        }),
      }
      mockFrom.mockReturnValue(chain)

      await expect(
        createDagTemplate(ORG_A, USER_ID, {
          slug: 'demo',
          name: 'Demo',
          spec: validSpec(),
        }),
      ).rejects.toMatchObject({ code: '42P01' })
    })
  })

  describe('updateDagTemplate', () => {
    it('updates only org-scoped rows (global rows unwriteable)', async () => {
      const { updateDagTemplate } = await import('../dag-templates')

      const updated = validRow({ name: 'Renamed' })

      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await updateDagTemplate(ORG_A, TEMPLATE_ID, { name: 'Renamed' })

      expect(chain.update).toHaveBeenCalledWith({ name: 'Renamed' })
      expect(chain.eq).toHaveBeenCalledWith('id', TEMPLATE_ID)
      expect(chain.eq).toHaveBeenCalledWith('org_id', ORG_A)
      expect(result?.name).toBe('Renamed')
    })

    it('returns null when no row matched (cross-org or global)', async () => {
      const { updateDagTemplate } = await import('../dag-templates')

      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await updateDagTemplate(ORG_B, TEMPLATE_ID, { name: 'Renamed' })
      expect(result).toBeNull()
    })

    it('falls back to getDagTemplate when patch is empty', async () => {
      const { updateDagTemplate } = await import('../dag-templates')

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: validRow(), error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await updateDagTemplate(ORG_A, TEMPLATE_ID, {})
      expect(result?.id).toBe(TEMPLATE_ID)
      // No update call — only the select chain from getDagTemplate
      expect(mockFrom).toHaveBeenCalledWith('orchestration_dag_templates')
    })

    it('rejects invalid spec on update', async () => {
      const { updateDagTemplate } = await import('../dag-templates')

      await expect(
        updateDagTemplate(ORG_A, TEMPLATE_ID, {
          spec: { nodes: [], edges: [] } as never,
        }),
      ).rejects.toThrow()
    })
  })

  describe('deleteDagTemplate', () => {
    it('returns true when row was deleted', async () => {
      const { deleteDagTemplate } = await import('../dag-templates')

      const chain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      // Resolve on the second .eq() call (org_id scope)
      let eqCalls = 0
      chain.eq.mockImplementation(function (this: typeof chain) {
        eqCalls += 1
        if (eqCalls >= 2) {
          return Promise.resolve({ count: 1, error: null })
        }
        return this
      })
      mockFrom.mockReturnValue(chain)

      const result = await deleteDagTemplate(ORG_A, TEMPLATE_ID)
      expect(result).toBe(true)
    })

    it('returns false when no row matched (cross-org or global)', async () => {
      const { deleteDagTemplate } = await import('../dag-templates')

      const chain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      let eqCalls = 0
      chain.eq.mockImplementation(function (this: typeof chain) {
        eqCalls += 1
        if (eqCalls >= 2) {
          return Promise.resolve({ count: 0, error: null })
        }
        return this
      })
      mockFrom.mockReturnValue(chain)

      const result = await deleteDagTemplate(ORG_B, TEMPLATE_ID)
      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      const { deleteDagTemplate } = await import('../dag-templates')

      const chain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      let eqCalls = 0
      chain.eq.mockImplementation(function (this: typeof chain) {
        eqCalls += 1
        if (eqCalls >= 2) {
          return Promise.resolve({ count: null, error: { message: 'boom' } })
        }
        return this
      })
      mockFrom.mockReturnValue(chain)

      const result = await deleteDagTemplate(ORG_A, TEMPLATE_ID)
      expect(result).toBe(false)
    })
  })
})
