import type { PublicAppConfig } from '@contracts/app-runtime'

export interface AppDiscoveryInput {
  config: PublicAppConfig
  manifest: Record<string, unknown>
}

export interface AppDiscoveryManifest {
  schema_version: '1.0'
  generated_at: string
  app: {
    id: string
    slug: string
    name: string
    description: string | null
    status: PublicAppConfig['status']
    visibility: PublicAppConfig['visibility']
  }
  runtime: {
    api_version: 'v1'
    openapi_url: string
    public_base_path: string
    endpoints: Record<string, string>
  }
  protocols: {
    mcp: {
      enabled: boolean
      mode: 'descriptor_only'
      servers: unknown[]
      tools: Array<{ name: string; endpoint: string; input_schema?: unknown }>
    }
    a2a: {
      enabled: boolean
      mode: 'agent_card'
      agent_card: {
        name: string
        description: string | null
        url: string
        capabilities: string[]
        skills: Array<{ id: string; name: string; description?: string }>
      }
    }
  }
}

function metadata(manifest: Record<string, unknown>): Record<string, unknown> {
  const value = manifest.discovery_metadata
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function metadataArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function publicActionTools(config: PublicAppConfig, manifest: Record<string, unknown>) {
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : []
  const endpoint = config.public_endpoints.actions ?? `/api/app-runtime/v1/public/apps/${config.slug}/actions/{action}`
  return workflows.flatMap((workflow) => {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return []
    const record = workflow as Record<string, unknown>
    const action = record.public_action_key ?? record.key
    if (typeof action !== 'string' || !action.trim()) return []
    return [{
      name: action,
      endpoint: endpoint.replace('{action}', action),
      input_schema: record.input_schema,
    }]
  })
}

function a2aSkills(config: PublicAppConfig) {
  const skills: Array<{ id: string; name: string; description?: string }> = []
  if (config.capabilities.includes('chat')) {
    skills.push({ id: 'chat', name: 'Public Chat', description: 'Answer visitor questions through the public app runtime.' })
  }
  if (config.capabilities.includes('lead')) {
    skills.push({ id: 'lead', name: 'Lead Intake', description: 'Capture visitor follow-up information.' })
  }
  if (config.capabilities.includes('public_actions')) {
    skills.push({ id: 'public_actions', name: 'Public Actions', description: 'Run whitelisted public workflows.' })
  }
  return skills
}

export function buildAppDiscoveryManifest(
  input: AppDiscoveryInput,
  now = new Date(),
): AppDiscoveryManifest {
  const meta = metadata(input.manifest)
  const tools = publicActionTools(input.config, input.manifest)
  const mcpEntries = metadataArray(meta.mcp)
  const a2aEntries = metadataArray(meta.a2a)
  const publicBasePath = `/api/app-runtime/v1/public/apps/${input.config.slug}`
  const publicUrl = `/apps/${input.config.slug}`

  return {
    schema_version: '1.0',
    generated_at: now.toISOString(),
    app: {
      id: input.config.app_id,
      slug: input.config.slug,
      name: input.config.name,
      description: input.config.description,
      status: input.config.status,
      visibility: input.config.visibility,
    },
    runtime: {
      api_version: 'v1',
      openapi_url: '/api/app-runtime/v1/sdk/openapi.json',
      public_base_path: publicBasePath,
      endpoints: input.config.public_endpoints,
    },
    protocols: {
      mcp: {
        enabled: mcpEntries.length > 0 || tools.length > 0,
        mode: 'descriptor_only',
        servers: mcpEntries,
        tools,
      },
      a2a: {
        enabled: a2aEntries.length > 0 || input.config.capabilities.includes('chat'),
        mode: 'agent_card',
        agent_card: {
          name: input.config.name,
          description: input.config.description,
          url: publicUrl,
          capabilities: input.config.capabilities,
          skills: a2aSkills(input.config),
        },
      },
    },
  }
}
