import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

function createChain(resolveWith: { data: unknown; error: unknown } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const fns = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'lt', 'gt', 'like', 'in', 'or',
    'order', 'limit', 'match', 'filter',
  ]
  for (const fn of fns) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => {
    resolve(resolveWith ?? { data: null, error: null })
    return chain
  }
  return chain
}

let mockFromResults: Map<string, ReturnType<typeof createChain>>
const mockFrom = vi.fn((table: string) => mockFromResults.get(table) ?? createChain())

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const skills = await import('../skills')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => mockFromResults.get(table) ?? createChain())
})

describe('getSkillCatalog', () => {
  it('limits default browse to global approved skills', async () => {
    const chain = createChain({ data: [], error: null })
    mockFromResults.set('skill_catalog', chain)

    await skills.getSkillCatalog()

    expect(chain.eq).toHaveBeenCalledWith('status', 'approved')
    expect(chain.eq).toHaveBeenCalledWith('visibility', 'global')
  })

  it('includes org-private approved skills for the owning org', async () => {
    const chain = createChain({ data: [], error: null })
    mockFromResults.set('skill_catalog', chain)

    await skills.getSkillCatalog('org-123')

    expect(chain.or).toHaveBeenCalledWith(
      'visibility.eq.global,and(visibility.eq.org_private,owner_org_id.eq.org-123)',
    )
  })
})

describe('promoteNativeSkillCandidate', () => {
  it('publishes an org-private native skill, installs it, and activates it for assistant scope', async () => {
    const catalogLookup = createChain({ data: null, error: null })
    const catalogUpsert = createChain({
      data: {
        id: 'skill-1',
        source_type: 'imported',
        engine_support: [{
          engine: 'hermes',
          support_level: 'native',
          runtime_flavors: ['c1_managed', 'c2a_autonomous'],
          channel_ownership: ['lucid_relay', 'runtime_native'],
          required_tools: [],
        }],
      },
      error: null,
    })
    const orgInstallLookup = createChain({ data: { id: 'install-1' }, error: null })
    const artifactUpsert = createChain({ data: null, error: null })
    const activationUpsert = createChain({ data: { id: 'activation-1' }, error: null })

    let skillCatalogCall = 0

    mockFrom.mockImplementation((table: string) => {
      if (table === 'skill_catalog') {
        skillCatalogCall += 1
        return skillCatalogCall === 1 ? catalogLookup : catalogUpsert
      }
      if (table === 'org_skill_installations') return orgInstallLookup
      if (table === 'skill_install_artifacts') return artifactUpsert
      if (table === 'assistant_skill_activations') return activationUpsert
      return createChain()
    })

    const result = await skills.promoteNativeSkillCandidate({
      candidate: {
        id: 'cand-1',
        agent_id: 'assistant-1',
        org_id: 'org-1',
        engine: 'hermes',
        mutation_kind: 'skill_create',
        tool_args: {
          slug: 'trade-alpha',
          content: '---\nname: Trade Alpha\ndescription: Hermes local skill\n---\n# Trade Alpha\n',
        },
      },
      reviewerId: 'user-1',
      promotionScope: 'assistant_durable',
    })

    expect(result).toEqual({
      skillId: 'skill-1',
      installationId: 'install-1',
      activationId: 'activation-1',
    })
    expect(catalogUpsert.upsert).toHaveBeenCalled()
  })
})

describe('publishPrivateSkillToCatalog', () => {
  it('clones an org-private skill into the global draft catalog', async () => {
    const privateSkillLookup = createChain({
      data: {
        id: 'skill-private-1',
        slug: 'org-12345678-trade-alpha',
        name: 'Trade Alpha',
        description: 'Private promoted skill',
        raw_content: '# Trade Alpha',
        sanitized_content: '# Trade Alpha\n',
        frontmatter: { name: 'Trade Alpha', description: 'Private promoted skill' },
        source: 'hermes_native',
        source_path: null,
        source_commit: null,
        content_hash: 'hash-1',
        content_chars: 14,
        status: 'approved',
        visibility: 'org_private',
        owner_org_id: 'org-1',
        origin_mutation_candidate_id: 'cand-1',
        import_warnings: null,
        version: 1,
        changelog: null,
        source_type: 'imported',
        source_skill_id: 'native:org-1:trade-alpha',
        source_version: '1',
        trust_tier: 'private_org',
        capability_tier: 'runtime_extended',
        artifact_checksum: 'hash-1',
        engine_support: null,
        artifact_manifest: null,
      },
      error: null,
    })
    const globalSlugLookup = createChain({ data: null, error: null })
    const existingDraftLookup = createChain({ data: null, error: null })
    const insertGlobal = createChain({ data: { id: 'skill-global-1' }, error: null })

    let skillCatalogCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'skill_catalog') return createChain()
      skillCatalogCall += 1
      if (skillCatalogCall === 1) return privateSkillLookup
      if (skillCatalogCall === 2) return existingDraftLookup
      if (skillCatalogCall === 3) return globalSlugLookup
      return insertGlobal
    })

    const result = await skills.publishPrivateSkillToCatalog({
      skillId: 'skill-private-1',
    })

    expect(result).toEqual({ id: 'skill-global-1' })
    expect(insertGlobal.insert).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'global',
      status: 'draft',
      slug: 'trade-alpha',
      origin_mutation_candidate_id: 'cand-1',
    }))
  })

  it('updates an existing global draft for the same private skill instead of creating another one', async () => {
    const privateSkillLookup = createChain({
      data: {
        id: 'skill-private-1',
        slug: 'org-12345678-trade-alpha',
        name: 'Trade Alpha',
        description: 'Private promoted skill',
        raw_content: '# Trade Alpha',
        sanitized_content: '# Trade Alpha\n',
        frontmatter: { name: 'Trade Alpha', description: 'Private promoted skill' },
        source: 'hermes_native',
        source_path: null,
        source_commit: null,
        content_hash: 'hash-1',
        content_chars: 14,
        status: 'approved',
        visibility: 'org_private',
        owner_org_id: 'org-1',
        origin_mutation_candidate_id: 'cand-1',
        import_warnings: null,
        version: 2,
        changelog: null,
        source_type: 'imported',
        source_skill_id: 'native:org-1:trade-alpha',
        source_version: '2',
        trust_tier: 'private_org',
        capability_tier: 'runtime_extended',
        artifact_checksum: 'hash-1',
        engine_support: null,
        artifact_manifest: null,
      },
      error: null,
    })
    const existingDraftLookup = createChain({ data: { id: 'skill-global-1' }, error: null })
    const slugLookup = createChain({ data: null, error: null })
    const updateGlobal = createChain({ data: { id: 'skill-global-1' }, error: null })

    let skillCatalogCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'skill_catalog') return createChain()
      skillCatalogCall += 1
      if (skillCatalogCall === 1) return privateSkillLookup
      if (skillCatalogCall === 2) return existingDraftLookup
      if (skillCatalogCall === 3) return slugLookup
      return updateGlobal
    })

    const result = await skills.publishPrivateSkillToCatalog({
      skillId: 'skill-private-1',
      name: 'Trade Alpha Updated',
    })

    expect(result).toEqual({ id: 'skill-global-1' })
    expect(updateGlobal.update).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'trade-alpha',
      name: 'Trade Alpha Updated',
      visibility: 'global',
      status: 'draft',
    }))
  })
})
