/**
 * Unified Skills — Server-side data assembly (Server-only)
 *
 * Shared between the API route and server component prefetch.
 * Normalizes plugins, integrations, and platform tools into a single
 * UnifiedSkillItem[] array.
 */

import 'server-only'
import {
  getPluginCatalog,
  getOrgPlugins,
  getAssistantPlugins,
  getAssistantOAuthBindings,
  getSkillCatalog,
  getOrgSkills,
  getAssistantSkills,
  getSkillInstallArtifacts,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { getOrgConnectionHealth, deriveHealthStatus } from '@/lib/db/integration-health'
import { getRuntimeById } from '@/lib/db/mission-control'
import {
  getAssistantAppBindings,
  getOrgAppConnectionOptions,
  groupConnectionOptionsByProvider,
  type AppConnectionOption,
} from '@/lib/capabilities/agent-app-bindings'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { assignSection, WRITE_TOOL_NAMES } from '@contracts/unified-skill'
import type { PluginCatalogEntry, OrgPluginInstallation, AssistantPluginActivation } from '@contracts/plugin'
import type { SkillCatalogEntry, OrgSkillInstallation, AssistantSkillActivation, SkillInstallArtifact } from '@contracts/skill'
import { buildSkillVariantKey, resolveSkillSupport, type SkillResolutionContext } from '@contracts/skill-resolution'
import type { AgentEngine } from '@/lib/engines/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_UNIFIED_SKILLS_CACHE_TTL_MS = 60_000
const orgUnifiedSkillsCache = new Map<string, {
  expiresAt: number
  items: UnifiedSkillItem[]
}>()
const orgUnifiedSkillsInflight = new Map<string, Promise<UnifiedSkillItem[]>>()

function hasWriteTools(tools: { name: string }[] | null): boolean {
  if (!tools) return false
  return tools.some(t => WRITE_TOOL_NAMES.has(t.name))
}

type PluginWithJoins = AssistantPluginActivation & {
  installation: OrgPluginInstallation & { plugin: PluginCatalogEntry }
}

function normalizePlugin(
  catalog: PluginCatalogEntry,
  orgInstall: (OrgPluginInstallation & { plugin: PluginCatalogEntry }) | null,
  activation: PluginWithJoins | null,
  oauthBindings: Record<string, {
    connected: boolean
    connectionId: string | null
    connectionRowId?: string | null
    accountLabel?: string | null
    options?: AppConnectionOption[]
  }>,
  connectionHealthMap: Map<string, import('@/lib/db/integration-health').ConnectionHealth>,
): UnifiedSkillItem {
  const tools = orgInstall?.manifest_snapshot ?? catalog.tool_manifest ?? []
  const section = assignSection(catalog.kind, catalog.source)
  const isCore = section === 'core'
  const isConnected = section === 'connected'

  let connectionStatus: 'connected' | 'setup_required' | null = null
  let connectionId: string | null = null
  let connectionRowId: string | null = null
  let connectionAccountLabel: string | null = null
  let connectionOptions: AppConnectionOption[] = []
  if (isConnected && catalog.auth_provider) {
    const binding = oauthBindings[catalog.auth_provider]
    connectionStatus = binding?.connected ? 'connected' : 'setup_required'
    connectionId = binding?.connectionId ?? null
    connectionRowId = binding?.connectionRowId ?? null
    connectionAccountLabel = binding?.accountLabel ?? null
    connectionOptions = binding?.options ?? []
  }

  // Derive health from connection data
  const connHealth = connectionId ? connectionHealthMap.get(connectionId) : undefined
  const { health_status, health_message, expires_at } = deriveHealthStatus(connHealth)

  // If connection is expired/error, show as setup_required so user can reconnect
  if (connectionStatus === 'connected' && (health_status === 'expired' || health_status === 'error')) {
    connectionStatus = 'setup_required'
  }

  return {
    id: catalog.id,
    item_type: 'plugin',
    slug: catalog.slug,
    name: catalog.name,
    description: catalog.description,
    category: catalog.category,
    section,
    installed: isCore || !!orgInstall,
    is_active: isCore || (activation?.is_active ?? false),
    installation_id: orgInstall?.id ?? null,
    activation_id: activation?.id ?? null,
    tools,
    enabled_tools: activation?.enabled_tools ?? null,
    tool_count: tools.length,
    can_act: isConnected
      ? catalog.risk_level === 'write' || catalog.risk_level === 'destructive'
      : hasWriteTools(tools),
    always_on: isCore,
    removable: !isCore,
    connection_status: connectionStatus,
    auth_provider: catalog.auth_provider ?? null,
    connection_id: connectionId,
    connection_row_id: connectionRowId,
    connection_account_label: connectionAccountLabel,
    selected_connection_row_id: connectionRowId,
    connection_count: connectionOptions.length,
    connection_options: connectionOptions.map((option) => ({
      id: option.id,
      connection_id: option.connection_id,
      account_label: option.account_label,
      account_id: option.account_id,
      status: option.status,
    })),
    health_status: connectionId ? health_status : null,
    health_message: connectionId ? health_message : null,
    expires_at: connectionId ? expires_at : null,
    content_chars: null,
    version: catalog.version,
    author: catalog.author ?? null,
    source: catalog.source,
    verified: catalog.verified,
    min_plan: catalog.min_plan,
  }
}

type SkillActivationWithJoins = AssistantSkillActivation & {
  installation: OrgSkillInstallation & { skill: SkillCatalogEntry }
}

function isUserFacingSkillCatalogEntry(
  catalog: SkillCatalogEntry,
  orgInstall: (OrgSkillInstallation & { skill: SkillCatalogEntry }) | null,
  activation: SkillActivationWithJoins | null,
): boolean {
  // Keep anything already installed/active visible so we never orphan an
  // existing assistant/org state in the UI.
  if (orgInstall || activation) return true

  // Org-private promoted skills are intentionally user-facing within the
  // owning org even before activation.
  if (catalog.visibility === 'org_private') return true

  // Only curated global skills belong in browse. Raw mirrored OpenClaw
  // community/internal skills (e.g. healthcheck, gog, feishu-wiki) should not
  // appear as installable end-user entries.
  return catalog.trust_tier === 'lucid_first_party' || catalog.trust_tier === 'verified_partner'
}

function normalizeSkill(
  catalog: SkillCatalogEntry,
  orgInstall: (OrgSkillInstallation & { skill: SkillCatalogEntry }) | null,
  activation: SkillActivationWithJoins | null,
  artifact: SkillInstallArtifact | null,
  resolution: SkillResolutionContext,
): UnifiedSkillItem {
  const primaryVariant = resolveSkillSupport(catalog, resolution)
  const variants = catalog.engine_support ?? []

  return {
    id: catalog.id,
    item_type: 'skill',
    slug: catalog.slug,
    name: catalog.name,
    description: catalog.description,
    category: String(catalog.frontmatter?.category ?? 'skills'),
    section: 'installed',
    installed: !!orgInstall,
    is_active: activation?.is_active ?? false,
    installation_id: orgInstall?.id ?? null,
    activation_id: activation?.id ?? null,
    tools: null,
    enabled_tools: null,
    tool_count: primaryVariant?.required_tools?.length ?? 0,
    can_act: (primaryVariant?.required_tools?.length ?? 0) > 0,
    always_on: false,
    removable: true,
    connection_status: null,
    auth_provider: null,
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: catalog.content_chars,
    version: catalog.source_version ?? String(catalog.version ?? '1'),
    author: typeof catalog.frontmatter?.author === 'string' ? catalog.frontmatter.author : null,
    source: catalog.source,
    verified: catalog.status === 'approved',
    source_type: catalog.source_type ?? null,
    support_level: primaryVariant?.support_level ?? null,
    supported_engines: Array.from(new Set(variants.map((variant) => variant.engine).filter(Boolean))),
    runtime_flavors: Array.from(new Set(variants.flatMap((variant) => variant.runtime_flavors ?? []))),
    channel_ownership: Array.from(new Set(variants.flatMap((variant) => variant.channel_ownership ?? []))),
    capability_tier: catalog.capability_tier ?? null,
    trust_tier: catalog.trust_tier ?? null,
    warm_state: artifact?.warm_state ?? (catalog.source_type === 'internal' ? 'embedded' : null),
    update_available: orgInstall && catalog.version && orgInstall.installed_version && catalog.version > orgInstall.installed_version
      ? {
          installed_version: orgInstall.installed_version,
          catalog_version: catalog.version,
          changelog: catalog.changelog ?? null,
        }
      : null,
  }
}

async function getSkillItemsForOrg(input: {
  orgId: string
  engine?: AgentEngine | null
  runtimeId?: string | null
}): Promise<UnifiedSkillItem[]> {
  const runtime = input.runtimeId
    ? await getRuntimeById(input.runtimeId, input.orgId).catch(() => null)
    : null
  const resolution: SkillResolutionContext = {
    engine: input.engine ?? 'openclaw',
    runtimeFlavor: runtime?.runtimeFlavor ?? 'shared',
    channelOwnership: runtime?.channelOwnership ?? 'lucid_relay',
  }
  const resolvedVariantKey = buildSkillVariantKey(resolution)

  const [
    skillCatalog,
    orgSkills,
    skillArtifacts,
  ] = await Promise.all([
    getSkillCatalog(input.orgId),
    getOrgSkills(input.orgId),
    getSkillInstallArtifacts(input.orgId),
  ])

  const orgSkillMap = new Map(orgSkills.map(item => [item.skill_id, item]))
  const artifactMap = new Map(
    skillArtifacts.map(item => [`${item.skill_id}:${item.source_variant_key}`, item]),
  )

  return skillCatalog.flatMap((catalog) => {
    const orgInstall = orgSkillMap.get(catalog.id) ?? null

    if (!isUserFacingSkillCatalogEntry(catalog, orgInstall, null)) {
      return []
    }

    const item = normalizeSkill(
      catalog,
      orgInstall,
      null,
      artifactMap.get(`${catalog.id}:${resolvedVariantKey}`) ?? null,
      resolution,
    )

    return item.support_level !== null ? [item] : []
  })
}

async function getUnifiedPluginsForOrg(input: {
  orgId: string
}): Promise<UnifiedSkillItem[]> {
  const [pluginCatalog, orgPlugins, orgConnections, connectionHealthMap] = await Promise.all([
    getPluginCatalog(),
    getOrgPlugins(input.orgId),
    getOrgAppConnectionOptions(input.orgId),
    getOrgConnectionHealth(input.orgId).catch(() => new Map()),
  ])

  const orgPluginMap = new Map(orgPlugins.map((plugin) => [plugin.plugin_id, plugin]))
  const connectionsByProvider = groupConnectionOptionsByProvider(orgConnections)
  const pluginItems: UnifiedSkillItem[] = pluginCatalog.map((catalog) => {
    const orgInstall = orgPluginMap.get(catalog.id) ?? null
    const providerConnections = catalog.auth_provider
      ? (connectionsByProvider[catalog.auth_provider] ?? [])
      : []
    const activeConnection = providerConnections.find((connection) => connection.status === 'active') ?? null
    return normalizePlugin(
      catalog,
      orgInstall,
      null,
      catalog.auth_provider
        ? {
            [catalog.auth_provider]: {
              connected: Boolean(activeConnection),
              connectionId: activeConnection?.connection_id ?? null,
              connectionRowId: activeConnection?.id ?? null,
              accountLabel: activeConnection?.account_label ?? null,
              options: providerConnections,
            },
          }
        : {},
      connectionHealthMap as Map<string, import('@/lib/db/integration-health').ConnectionHealth>,
    )
  })

  return pluginItems.filter((item) => item.section !== 'core' && !INTERNAL_SLUGS.has(item.slug))
}

// ---------------------------------------------------------------------------
// Internal-only slugs — never shown in the UI
// ---------------------------------------------------------------------------

const INTERNAL_SLUGS = new Set(['debridge-mcp', 'lucid-bridge', 'jupiter-dex'])

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Fetch and normalize all unified skills for an assistant.
 * Combines plugins, integrations, and platform tools.
 */
export async function getUnifiedSkills(
  assistant: {
    id: string
    org_id: string
    engine?: AgentEngine | null
    runtime_id?: string | null
  },
): Promise<UnifiedSkillItem[]> {
  try {
    const [
      pluginCatalog,
      orgPlugins,
      assistantPlugins,
      oauthBindingsRaw,
      assistantAppBindings,
      orgConnections,
      connectionHealthMap,
      assistantSkills,
      skillItems,
    ] = await Promise.all([
      getPluginCatalog(),
      getOrgPlugins(assistant.org_id),
      getAssistantPlugins(assistant.id),
      getAssistantOAuthBindings(assistant.id).catch(() => []),
      getAssistantAppBindings(assistant.id).catch(() => []),
      getOrgAppConnectionOptions(assistant.org_id),
      getOrgConnectionHealth(assistant.org_id).catch(() => new Map()),
      getAssistantSkills(assistant.id),
      getSkillItemsForOrg({
        orgId: assistant.org_id,
        engine: assistant.engine,
        runtimeId: assistant.runtime_id,
      }),
    ])

    const orgPluginMap = new Map(orgPlugins.map(op => [op.plugin_id, op]))
    const activationMap = new Map(assistantPlugins.map(ap => [ap.installation_id, ap]))
    const appBindingByPluginId = new Map(assistantAppBindings.map((binding) => [binding.plugin_id, binding]))
    const connectionByRowId = new Map(orgConnections.map((connection) => [connection.id, connection]))
    const connectionsByProvider = groupConnectionOptionsByProvider(orgConnections)

    const oauthBindings: Record<string, {
      connected: boolean
      connectionId: string | null
      connectionRowId?: string | null
      accountLabel?: string | null
      options?: AppConnectionOption[]
    }> = {}
    for (const binding of oauthBindingsRaw as Array<{ provider?: string; connection_id?: string }>) {
      if (binding.provider) {
        oauthBindings[binding.provider] = {
          connected: true,
          connectionId: binding.connection_id ?? null,
        }
      }
    }

    const pluginItems: UnifiedSkillItem[] = pluginCatalog.map(catalog => {
      const orgInstall = orgPluginMap.get(catalog.id) ?? null
      const activation = orgInstall ? (activationMap.get(orgInstall.id) ?? null) : null
      const appBinding = appBindingByPluginId.get(catalog.id)
      const selectedConnection = appBinding?.org_connection_id
        ? connectionByRowId.get(appBinding.org_connection_id) ?? null
        : null
      const providerConnections = catalog.auth_provider
        ? (connectionsByProvider[catalog.auth_provider] ?? [])
        : []
      const fallbackBinding = catalog.auth_provider ? oauthBindings[catalog.auth_provider] : undefined
      const connectionBinding = catalog.auth_provider
        ? {
            [catalog.auth_provider]: {
              connected: appBinding
                ? appBinding.status === 'active' && selectedConnection?.status === 'active'
                : Boolean(fallbackBinding?.connected),
              connectionId: selectedConnection?.connection_id ?? fallbackBinding?.connectionId ?? null,
              connectionRowId: selectedConnection?.id ?? null,
              accountLabel: selectedConnection?.account_label ?? null,
              options: providerConnections,
            },
          }
        : {}
      return normalizePlugin(
        catalog,
        orgInstall,
        activation as PluginWithJoins | null,
        connectionBinding,
        connectionHealthMap as Map<string, import('@/lib/db/integration-health').ConnectionHealth>,
      )
    })

    // Filter out platform tools (always-on, non-configurable) and internal-only slugs.
    const userFacingPlugins = pluginItems.filter(i => i.section !== 'core' && !INTERNAL_SLUGS.has(i.slug))

    const assistantSkillMap = new Map(assistantSkills.map(item => [item.installation_id, item]))
    const hydratedSkillItems = skillItems.map((item) => {
      if (!item.installation_id) return item
      const activation = assistantSkillMap.get(item.installation_id)
      return {
        ...item,
        is_active: activation?.is_active ?? false,
        activation_id: activation?.id ?? null,
      }
    })

    return [...userFacingPlugins, ...hydratedSkillItems]
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { assistantId: assistant.id, orgId: assistant.org_id },
      tags: { layer: 'database', operation: 'getUnifiedSkills' },
    })
    return []
  }
}

export async function getUserFacingSkillsForOrg(input: {
  orgId: string
  engine?: AgentEngine | null
  runtimeId?: string | null
}): Promise<UnifiedSkillItem[]> {
  try {
    return await getSkillItemsForOrg(input)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { orgId: input.orgId },
      tags: { layer: 'database', operation: 'getUserFacingSkillsForOrg' },
    })
    return []
  }
}

export async function getUnifiedSkillsForOrg(input: {
  orgId: string
  engine?: AgentEngine | null
  runtimeId?: string | null
}): Promise<UnifiedSkillItem[]> {
  try {
    const cacheKey = `${input.orgId}:${input.engine ?? 'openclaw'}:${input.runtimeId ?? 'shared'}`
    const cached = orgUnifiedSkillsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items
    }

    const existing = orgUnifiedSkillsInflight.get(cacheKey)
    if (existing) return existing

    const inflight = (async () => {
      const [pluginItems, skillItems] = await Promise.all([
        getUnifiedPluginsForOrg({ orgId: input.orgId }),
        getSkillItemsForOrg({
          orgId: input.orgId,
          engine: input.engine,
          runtimeId: input.runtimeId,
        }),
      ])

      const items = [...pluginItems, ...skillItems]
      orgUnifiedSkillsCache.set(cacheKey, {
        expiresAt: Date.now() + ORG_UNIFIED_SKILLS_CACHE_TTL_MS,
        items,
      })
      return items
    })()

    orgUnifiedSkillsInflight.set(cacheKey, inflight)
    try {
      return await inflight
    } finally {
      orgUnifiedSkillsInflight.delete(cacheKey)
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { orgId: input.orgId },
      tags: { layer: 'database', operation: 'getUnifiedSkillsForOrg' },
    })
    return []
  }
}
