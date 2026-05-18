import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getPluginCatalog = vi.fn()
const getOrgPlugins = vi.fn()
const getAssistantPlugins = vi.fn()
const getAssistantOAuthBindings = vi.fn()
const getSkillCatalog = vi.fn()
const getOrgSkills = vi.fn()
const getAssistantSkills = vi.fn()
const getSkillInstallArtifacts = vi.fn()
const getAssistantAppBindings = vi.fn()
const getOrgAppConnectionOptions = vi.fn()

const getOrgConnectionHealth = vi.fn()
const deriveHealthStatus = vi.fn(() => ({
  health_status: 'healthy',
  health_message: null,
  expires_at: null,
}))

const getRuntimeById = vi.fn()
const captureException = vi.fn()

vi.mock('@/lib/db', () => ({
  getPluginCatalog,
  getOrgPlugins,
  getAssistantPlugins,
  getAssistantOAuthBindings,
  getSkillCatalog,
  getOrgSkills,
  getAssistantSkills,
  getSkillInstallArtifacts,
}))

vi.mock('@/lib/db/integration-health', () => ({
  getOrgConnectionHealth,
  deriveHealthStatus,
}))

vi.mock('@/lib/capabilities/agent-app-bindings', () => ({
  getAssistantAppBindings,
  getOrgAppConnectionOptions,
  groupConnectionOptionsByProvider: (connections: Array<{ auth_provider: string }>) => {
    const grouped: Record<string, Array<{ auth_provider: string }>> = {}
    for (const connection of connections) {
      grouped[connection.auth_provider] ??= []
      grouped[connection.auth_provider]!.push(connection)
    }
    return grouped
  },
}))

vi.mock('@/lib/db/mission-control', () => ({
  getRuntimeById,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException,
  },
}))

const { getUnifiedSkills } = await import('../unified-skills')

describe('getUnifiedSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPluginCatalog.mockResolvedValue([])
    getOrgPlugins.mockResolvedValue([])
    getAssistantPlugins.mockResolvedValue([])
    getAssistantOAuthBindings.mockResolvedValue([])
    getAssistantAppBindings.mockResolvedValue([])
    getOrgAppConnectionOptions.mockResolvedValue([])
    getOrgConnectionHealth.mockResolvedValue(new Map())
    getSkillCatalog.mockResolvedValue([])
    getOrgSkills.mockResolvedValue([])
    getAssistantSkills.mockResolvedValue([])
    getSkillInstallArtifacts.mockResolvedValue([])
    getRuntimeById.mockResolvedValue(null)
  })

  it('hides global community mirrored skills from browse', async () => {
    getSkillCatalog.mockResolvedValue([
      {
        id: 'skill-hidden',
        slug: 'healthcheck',
        name: 'healthcheck',
        description: 'Internal OpenClaw health check skill',
        frontmatter: { category: 'skills' },
        status: 'approved',
        visibility: 'global',
        source: 'openclaw',
        source_type: 'internal',
        trust_tier: 'community',
        capability_tier: 'metadata_only',
        content_chars: 100,
        version: 1,
        source_version: '1',
        changelog: null,
        artifact_checksum: null,
        artifact_manifest: null,
        engine_support: [
          {
            engine: 'openclaw',
            support_level: 'native',
            runtime_flavors: ['shared'],
            channel_ownership: ['lucid_relay'],
            required_tools: [],
          },
        ],
      },
    ])

    const items = await getUnifiedSkills({
      id: 'assistant-1',
      org_id: 'org-1',
      engine: 'openclaw',
      runtime_id: null,
    })

    expect(items).toEqual([])
  })

  it('keeps org-private promoted skills visible before install', async () => {
    getSkillCatalog.mockResolvedValue([
      {
        id: 'skill-private',
        slug: 'org-12345678-trade-alpha',
        name: 'Trade Alpha',
        description: 'Private org skill',
        frontmatter: { category: 'runtime' },
        status: 'approved',
        visibility: 'org_private',
        source: 'hermes_native',
        source_type: 'imported',
        trust_tier: 'private_org',
        capability_tier: 'runtime_extended',
        content_chars: 100,
        version: 1,
        source_version: '1',
        changelog: null,
        artifact_checksum: null,
        artifact_manifest: null,
        engine_support: [
          {
            engine: 'openclaw',
            support_level: 'native',
            runtime_flavors: ['shared'],
            channel_ownership: ['lucid_relay'],
            required_tools: ['trade_execute'],
          },
        ],
      },
    ])

    const items = await getUnifiedSkills({
      id: 'assistant-1',
      org_id: 'org-1',
      engine: 'openclaw',
      runtime_id: null,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      slug: 'org-12345678-trade-alpha',
      item_type: 'skill',
      installed: false,
    })
  })

  it('keeps installed community skills visible', async () => {
    getSkillCatalog.mockResolvedValue([
      {
        id: 'skill-installed',
        slug: 'gog',
        name: 'gog',
        description: 'Google Workspace CLI',
        frontmatter: { category: 'skills' },
        status: 'approved',
        visibility: 'global',
        source: 'openclaw',
        source_type: 'internal',
        trust_tier: 'community',
        capability_tier: 'metadata_only',
        content_chars: 100,
        version: 1,
        source_version: '1',
        changelog: null,
        artifact_checksum: null,
        artifact_manifest: null,
        engine_support: [
          {
            engine: 'openclaw',
            support_level: 'native',
            runtime_flavors: ['shared'],
            channel_ownership: ['lucid_relay'],
            required_tools: [],
          },
        ],
      },
    ])
    getOrgSkills.mockResolvedValue([
      {
        id: 'org-skill-1',
        org_id: 'org-1',
        skill_id: 'skill-installed',
        installed_at: '2026-04-17T00:00:00Z',
        installed_by: null,
        skill: { id: 'skill-installed' },
      },
    ])

    const items = await getUnifiedSkills({
      id: 'assistant-1',
      org_id: 'org-1',
      engine: 'openclaw',
      runtime_id: null,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      slug: 'gog',
      installed: true,
    })
  })
})
