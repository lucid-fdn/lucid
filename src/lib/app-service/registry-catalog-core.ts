import {
  APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS,
  summarizeFirstPlatformBlueprints,
} from './platform-blueprints-core'

export type AppServiceRegistryEntryKind = 'platform_blueprint'

export interface AppServiceRegistryEntry {
  kind: AppServiceRegistryEntryKind
  slug: string
  version: string
  name: string
  description: string
  category: string
  tags: string[]
  capabilities: string[]
  required_inputs: unknown[]
  launch_checklist: string[]
  proof_metrics: string[]
  upgrade_metadata: {
    schema_version: '1.0'
    channel: 'stable' | 'beta' | 'experimental'
    compatible_from: string[]
    migration_steps: string[]
  }
  discovery_metadata: {
    schema_version: '1.0'
    protocols: Array<'mcp' | 'a2a'>
    mcp: unknown[]
    a2a: unknown[]
  }
}

export interface AppServiceRegistryCatalog {
  schema_version: '1.0'
  generated_at: string
  source: 'static_platform_catalog'
  entries: AppServiceRegistryEntry[]
}

function capabilitiesForBlueprint(slug: string): string[] {
  const blueprint = APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS.find((entry) => entry.slug === slug)
  if (!blueprint) return []

  const capabilities = new Set<string>(['status'])
  if (blueprint.spec.agents.some((agent) => agent.public_chat_enabled)) capabilities.add('chat')
  if (blueprint.spec.frontend.pages.some((page) => page.blocks.some((block) => block.type === 'lead_form'))) capabilities.add('lead')
  if (blueprint.spec.workflows.some((workflow) => workflow.trigger === 'public_action')) capabilities.add('public_actions')
  return [...capabilities].sort()
}

export function buildAppServiceRegistryCatalog(now = new Date()): AppServiceRegistryCatalog {
  return {
    schema_version: '1.0',
    generated_at: now.toISOString(),
    source: 'static_platform_catalog',
    entries: summarizeFirstPlatformBlueprints().map((blueprint) => ({
      kind: 'platform_blueprint',
      slug: blueprint.slug,
      version: blueprint.version,
      name: blueprint.name,
      description: blueprint.description,
      category: blueprint.category,
      tags: blueprint.tags,
      capabilities: capabilitiesForBlueprint(blueprint.slug),
      required_inputs: blueprint.required_inputs,
      launch_checklist: blueprint.launch_checklist,
      proof_metrics: blueprint.proof_metrics,
      upgrade_metadata: {
        schema_version: '1.0',
        channel: 'stable',
        compatible_from: [],
        migration_steps: [],
      },
      discovery_metadata: {
        schema_version: '1.0',
        protocols: [],
        mcp: [],
        a2a: [],
      },
    })),
  }
}
