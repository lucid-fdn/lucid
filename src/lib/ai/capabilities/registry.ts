import 'server-only'

import type { TemplateCatalogEntry } from '@contracts/template'
import type { PluginCatalogEntry } from '@contracts/plugin'
import type { SkillCatalogEntry } from '@contracts/skill'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { PLATFORM_TOOL_NAMES } from '@/lib/ai/platform-tool-manifest'
import { getPluginCatalog, getOrgPlugins } from '@/lib/db/plugins'
import { getUnifiedSkillRegistry } from '@/lib/skills/registry'

export interface BuilderCapabilityToolServer {
  name: string
  transport: 'http' | 'sse'
  url: string
  description?: string
  source: 'plugin-catalog' | 'skill-variant'
}

export interface BuilderCapabilitySkill {
  slug: string
  name: string
  description?: string | null
  source: 'internal' | 'catalog' | 'org-installed'
  capabilityTier?: string | null
  requiredTools: string[]
  requiredServers: string[]
}

export interface BuilderCapabilityPlugin {
  slug: string
  name: string
  description?: string | null
  kind?: string | null
  transport?: string | null
  authProvider?: string | null
  riskLevel: string
  installed: boolean
  toolNames: string[]
  endpointUrl?: string | null
  iconUrl?: string | null
}

export interface BuilderCapabilityRegistry {
  internalTools: string[]
  toolServers: BuilderCapabilityToolServer[]
  skills: BuilderCapabilitySkill[]
  plugins: BuilderCapabilityPlugin[]
  templates: Array<Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'category'>>
}

export function buildBuilderCapabilityRegistryFromUnifiedSkills(input: {
  items: UnifiedSkillItem[]
  templates: TemplateCatalogEntry[]
}): BuilderCapabilityRegistry {
  const plugins: BuilderCapabilityPlugin[] = []
  const skills: BuilderCapabilitySkill[] = []
  const toolServers = new Map<string, BuilderCapabilityToolServer>()
  const internalTools = new Set<string>(PLATFORM_TOOL_NAMES)

  for (const item of input.items) {
    for (const tool of item.tools ?? []) {
      internalTools.add(tool.name)
    }

    if (item.item_type === 'plugin') {
      plugins.push({
        slug: item.slug,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        authProvider: item.auth_provider,
        riskLevel: item.can_act ? 'write' : 'read',
        installed: item.installed,
        toolNames: (item.tools ?? []).map((tool) => tool.name).slice(0, 12),
      })
      continue
    }

    skills.push({
      slug: item.slug,
      name: item.name,
      ...(item.description ? { description: item.description } : {}),
      source: item.installed ? 'org-installed' : 'catalog',
      capabilityTier: item.capability_tier ?? null,
      requiredTools: (item.tools ?? []).map((tool) => tool.name).sort(),
      requiredServers: [],
    })
  }

  return {
    internalTools: Array.from(internalTools).sort(),
    toolServers: Array.from(toolServers.values()).sort((a, b) => a.name.localeCompare(b.name)),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)),
    templates: input.templates.map((template) => ({
      slug: template.slug,
      name: template.name,
      kind: template.kind,
      category: template.category,
    })),
  }
}

const REGISTRY_CACHE_TTL_MS = 5 * 60_000
const builderCapabilityRegistryCache = new Map<string, {
  expiresAt: number
  value: BuilderCapabilityRegistry
}>()

function deriveServerTransport(url: string): 'http' | 'sse' {
  return /sse/i.test(url) ? 'sse' : 'http'
}

function normalizePluginToolServer(plugin: PluginCatalogEntry): BuilderCapabilityToolServer | null {
  if (plugin.transport !== 'remote-mcp' || !plugin.endpoint_url) return null

  return {
    name: plugin.name,
    transport: deriveServerTransport(plugin.endpoint_url),
    url: plugin.endpoint_url,
    ...(plugin.description ? { description: plugin.description } : {}),
    source: 'plugin-catalog',
  }
}

function collectRequiredServers(skill: SkillCatalogEntry): string[] {
  const variants = skill.engine_support ?? []
  const servers = new Set<string>()
  for (const variant of variants) {
    for (const server of variant.required_servers ?? []) {
      if (server.trim()) servers.add(server.trim())
    }
  }
  return Array.from(servers).sort()
}

function collectRequiredTools(skill: SkillCatalogEntry): string[] {
  const variants = skill.engine_support ?? []
  const tools = new Set<string>()
  for (const variant of variants) {
    for (const toolName of variant.required_tools ?? []) {
      if (toolName.trim()) tools.add(toolName.trim())
    }
  }
  return Array.from(tools).sort()
}

export async function getBuilderCapabilityRegistry(input: {
  orgId?: string
  templates: TemplateCatalogEntry[]
}): Promise<BuilderCapabilityRegistry> {
  const cacheKey = `${input.orgId ?? 'global'}:${input.templates.length}`
  const cached = builderCapabilityRegistryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const [pluginCatalog, orgPlugins, skillRegistry] = await Promise.all([
    getPluginCatalog(),
    input.orgId ? getOrgPlugins(input.orgId) : Promise.resolve([]),
    getUnifiedSkillRegistry(input.orgId),
  ])

  const installedPluginIds = new Set(orgPlugins.map((installation) => installation.plugin_id))
  const installedSkillIds = skillRegistry.installedSkillIds

  const plugins: BuilderCapabilityPlugin[] = pluginCatalog.map((plugin) => ({
    slug: plugin.slug,
    name: plugin.name,
    ...(plugin.description ? { description: plugin.description } : {}),
    ...(plugin.kind ? { kind: plugin.kind } : {}),
    ...(plugin.transport ? { transport: plugin.transport } : {}),
    ...(plugin.auth_provider ? { authProvider: plugin.auth_provider } : {}),
    riskLevel: plugin.risk_level,
    installed: installedPluginIds.has(plugin.id),
    toolNames: plugin.tool_manifest.map((toolDef) => toolDef.name).slice(0, 12),
    ...(plugin.endpoint_url ? { endpointUrl: plugin.endpoint_url } : {}),
    ...(plugin.icon_url ? { iconUrl: plugin.icon_url } : {}),
  }))

  const skillMap = new Map<string, BuilderCapabilitySkill>()

  for (const pkg of skillRegistry.internalPackages) {
    const requiredTools = new Set<string>()
    const requiredServers = new Set<string>()
    for (const variant of pkg.variants) {
      for (const toolName of variant.required_tools ?? []) requiredTools.add(toolName)
      for (const serverName of variant.required_servers ?? []) requiredServers.add(serverName)
    }

    skillMap.set(`internal:${pkg.slug}`, {
      slug: pkg.slug,
      name: pkg.name,
      ...(pkg.description ? { description: pkg.description } : {}),
      source: 'internal',
      capabilityTier: pkg.capability_tier,
      requiredTools: Array.from(requiredTools).sort(),
      requiredServers: Array.from(requiredServers).sort(),
    })
  }

  for (const skill of skillRegistry.catalogSkills) {
    skillMap.set(skill.id, {
      slug: skill.slug,
      name: skill.name,
      ...(skill.description ? { description: skill.description } : {}),
      source: installedSkillIds.has(skill.id) ? 'org-installed' : 'catalog',
      capabilityTier: skill.capability_tier ?? null,
      requiredTools: collectRequiredTools(skill),
      requiredServers: collectRequiredServers(skill),
    })
  }

  const toolServers = new Map<string, BuilderCapabilityToolServer>()
  for (const plugin of pluginCatalog) {
    const server = normalizePluginToolServer(plugin)
    if (!server) continue
    toolServers.set(server.url, server)
  }

  for (const skill of skillMap.values()) {
    for (const serverName of skill.requiredServers) {
      const key = `skill:${serverName}`
      if (toolServers.has(key)) continue
      toolServers.set(key, {
        name: serverName,
        transport: 'http',
        url: `mcp://${serverName}`,
        description: `${skill.name} expects this MCP/tool server to be available.`,
        source: 'skill-variant',
      })
    }
  }

  const internalTools = new Set<string>(PLATFORM_TOOL_NAMES)
  for (const plugin of plugins) {
    for (const toolName of plugin.toolNames) internalTools.add(toolName)
  }
  for (const skill of skillMap.values()) {
    for (const toolName of skill.requiredTools) internalTools.add(toolName)
  }

  const registry = {
    internalTools: Array.from(internalTools).sort(),
    toolServers: Array.from(toolServers.values()).sort((a, b) => a.name.localeCompare(b.name)),
    skills: Array.from(skillMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)),
    templates: input.templates.map((template) => ({
      slug: template.slug,
      name: template.name,
      kind: template.kind,
      category: template.category,
    })),
  }

  builderCapabilityRegistryCache.set(cacheKey, {
    expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
    value: registry,
  })

  return registry
}

export function summarizeBuilderCapabilityRegistry(
  registry: BuilderCapabilityRegistry,
): string {
  const topPlugins = registry.plugins.slice(0, 8).map((plugin) => ({
    slug: plugin.slug,
    tools: plugin.toolNames.slice(0, 4),
    transport: plugin.transport ?? 'unknown',
    authProvider: plugin.authProvider ?? null,
    installed: plugin.installed,
  }))

  const topSkills = registry.skills.slice(0, 10).map((skill) => ({
    slug: skill.slug,
    source: skill.source,
    capabilityTier: skill.capabilityTier ?? null,
    requiredTools: skill.requiredTools.slice(0, 4),
    requiredServers: skill.requiredServers.slice(0, 3),
  }))

  const topServers = registry.toolServers.slice(0, 8).map((server) => ({
    name: server.name,
    transport: server.transport,
    url: server.url,
  }))

  return JSON.stringify({
    internalTools: registry.internalTools.slice(0, 20),
    plugins: topPlugins,
    skills: topSkills,
    toolServers: topServers,
  }, null, 2)
}

export function summarizeRelevantBuilderCapabilityRegistry(input: {
  registry: BuilderCapabilityRegistry
  prompt: string
  templateSlugs?: string[]
  mode?: 'template' | 'blank-agent' | 'blank-team'
}): string {
  const promptTerms = new Set(
    input.prompt
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  )

  const matchesPrompt = (...values: Array<string | null | undefined>) => values.some((value) => {
    const lower = value?.toLowerCase()
    return Boolean(lower && [...promptTerms].some((term) => lower.includes(term)))
  })

  const relevantSkills = input.registry.skills
    .filter((skill) => (
      matchesPrompt(skill.slug, skill.name, skill.description ?? undefined)
      || skill.requiredTools.some((tool) => matchesPrompt(tool))
      || skill.requiredServers.some((server) => matchesPrompt(server))
    ))
    .slice(0, 6)

  const fallbackSkills = input.registry.skills
    .filter((skill) => !relevantSkills.some((item) => item.slug === skill.slug))
    .slice(0, Math.max(0, 4 - relevantSkills.length))

  const skills = [...relevantSkills, ...fallbackSkills].slice(0, 6).map((skill) => ({
    slug: skill.slug,
    source: skill.source,
    requiredTools: skill.requiredTools.slice(0, 3),
    requiredServers: skill.requiredServers.slice(0, 2),
  }))

  const relevantPlugins = input.registry.plugins
    .filter((plugin) => (
      plugin.installed
      || matchesPrompt(plugin.slug, plugin.name, plugin.description ?? undefined, ...(plugin.toolNames ?? []))
    ))
    .slice(0, 5)
    .map((plugin) => ({
      slug: plugin.slug,
      installed: plugin.installed,
      tools: plugin.toolNames.slice(0, 3),
    }))

  const skillServers = new Set(skills.flatMap((skill) => skill.requiredServers))
  const servers = input.registry.toolServers
    .filter((server) => skillServers.has(server.name) || matchesPrompt(server.name, server.description ?? undefined))
    .slice(0, 4)
    .map((server) => ({
      name: server.name,
      transport: server.transport,
    }))

  return JSON.stringify({
    mode: input.mode ?? 'blank-agent',
    highlightedTemplates: input.templateSlugs?.slice(0, 4) ?? [],
    internalTools: input.registry.internalTools
      .filter((tool) => matchesPrompt(tool))
      .slice(0, 10),
    plugins: relevantPlugins,
    skills,
    toolServers: servers,
  }, null, 2)
}
