import { LucidPackManifestSchema, type LucidPack, type LucidPackManifest } from '@contracts/lucid-pack'
import {
  TemplateCatalogEntrySchema,
  TemplateParamSchema,
  TemplateSpecSchema,
  type TemplateCatalogEntry,
} from '@contracts/template'
import type { TemplateRegistrySeed } from './registry'

const TEMPLATE_PACK_SCHEMA_VERSION = '2026-05-07.lucid-pack.v1' as const

export type PackBackedTemplateType = 'agent' | 'team' | 'capability'

export function getPackBackedTemplateType(pack: Pick<LucidPack, 'manifest'>): PackBackedTemplateType | null {
  const value = pack.manifest.metadata?.template_type
  return value === 'agent' || value === 'team' || value === 'capability' ? value : null
}

export function isPackBackedTemplate(pack: Pick<LucidPack, 'manifest'>): boolean {
  return getPackBackedTemplateType(pack) !== null
}

export function isPackBackedDeployableTemplate(pack: Pick<LucidPack, 'manifest'>): boolean {
  const type = getPackBackedTemplateType(pack)
  return type === 'agent' || type === 'team'
}

export function registrySeedToLucidPackManifest(seed: TemplateRegistrySeed): LucidPackManifest {
  return templateSeedToLucidPackManifest({
    slug: seed.slug,
    name: seed.name,
    description: seed.description ?? null,
    category: seed.category,
    source: 'platform',
    status: 'approved',
    isPublic: true,
    spec: seed.spec,
    params: seed.params ?? [],
    tags: seed.tags ?? [],
    previewPrompt: seed.preview_prompt ?? null,
    version: seed.version ?? '1.0.0',
    metadata: {
      legacy_backing: 'template_registry_seed',
      legacy_template_slug: seed.slug,
    },
  })
}

export function templateCatalogEntryToLucidPackManifest(template: TemplateCatalogEntry): LucidPackManifest {
  return templateSeedToLucidPackManifest({
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    source: template.source,
    status: template.status,
    isPublic: template.is_public,
    spec: template.spec,
    params: template.params,
    tags: template.tags,
    previewPrompt: template.preview_prompt,
    version: template.version ?? '1.0.0',
    metadata: {
      source_backing: 'deploy_compatible_template',
      source_template_id: template.id,
      source_template_slug: template.slug,
      created_by: template.created_by,
      install_count: template.install_count,
      cert_status: template.cert_status,
      cert_score: template.cert_score,
      cert_checked_at: template.cert_checked_at,
      outcome_data: template.outcome_data,
      changelog: template.changelog,
    },
  })
}

function templateSeedToLucidPackManifest(input: {
  slug: string
  name: string
  description?: string | null
  category: string
  source: 'platform' | 'community' | 'org'
  status: 'draft' | 'pending_review' | 'approved' | 'deprecated'
  isPublic: boolean
  spec: unknown
  params?: unknown[]
  tags?: string[]
  previewPrompt?: string | null
  version?: string
  metadata?: Record<string, unknown>
}): LucidPackManifest {
  const spec = TemplateSpecSchema.parse(input.spec)
  const params = (input.params ?? []).map((param) => TemplateParamSchema.parse(param))
  const resourceKind = spec.kind
  const resourceKey = `${resourceKind}:${input.slug}`

  return LucidPackManifestSchema.parse({
    schemaVersion: TEMPLATE_PACK_SCHEMA_VERSION,
    key: input.slug,
    name: input.name,
    description: input.description ?? `${input.name} template.`,
    version: input.version ?? '1.0.0',
    composition: {
      provides: [{
        key: `template.${input.slug}`,
        kind: resourceKind,
        name: input.name,
        description: input.description ?? undefined,
        scope: 'project',
        risk: inferTemplateRisk(input),
        progress: {
          label: resourceKind === 'team' ? 'Assembling template team' : 'Creating template agent',
          phase: 'tool_running',
        },
      }],
      requires: inferTemplateDependencies({ name: input.name, spec }),
      optional: [],
      conflicts: [],
      upgradesFrom: [],
      tags: input.tags ?? [],
    },
    resources: [{
      key: resourceKey,
      kind: resourceKind,
      name: input.name,
      policy: 'fork_on_edit',
      spec: {
        template_spec: spec,
        params,
        preview_prompt: input.previewPrompt ?? null,
        deploy_contract: 'pack_deploy_compatible',
      },
    }],
    metadata: {
      product_surface: 'template',
      template_type: resourceKind,
      template_family: input.category,
      backing_lifecycle: 'lucid_pack',
      source: input.source,
      status: input.status,
      is_public: input.isPublic,
      tags: input.tags ?? [],
      params,
      preview_prompt: input.previewPrompt ?? null,
      install_count: 0,
      cert_status: 'uncertified',
      outcome_data: {},
      conversion_version: '2026-05-13.template-pack.v1',
      ...(input.metadata ?? {}),
    },
  })
}

export function packBackedTemplateToCatalogEntry(pack: LucidPack): TemplateCatalogEntry | null {
  const type = getPackBackedTemplateType(pack)
  if (type !== 'agent' && type !== 'team') return null

  const resource = pack.manifest.resources.find((item) => item.kind === type)
  const rawSpec = resource?.spec.template_spec
  const parsedSpec = TemplateSpecSchema.safeParse(rawSpec)
  if (!parsedSpec.success || parsedSpec.data.kind !== type) return null

  const metadata = pack.manifest.metadata
  const params = Array.isArray(metadata.params)
    ? metadata.params.map((param) => TemplateParamSchema.parse(param))
    : []
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  const source = metadata.source === 'community' || metadata.source === 'org' ? metadata.source : 'platform'
  const status = metadata.status === 'draft'
    || metadata.status === 'pending_review'
    || metadata.status === 'deprecated'
    || metadata.status === 'approved'
      ? metadata.status
      : pack.status === 'active'
        ? 'approved'
        : 'deprecated'

  return TemplateCatalogEntrySchema.parse({
    id: pack.id,
    slug: pack.packKey,
    name: pack.name,
    description: pack.description,
    category: typeof metadata.template_family === 'string' ? metadata.template_family : 'templates',
    kind: type,
    source,
    status,
    is_public: metadata.is_public !== false,
    owner_org_id: pack.orgId ?? null,
    spec: parsedSpec.data,
    params,
    preview_prompt: typeof metadata.preview_prompt === 'string' ? metadata.preview_prompt : null,
    tags,
    install_count: typeof metadata.install_count === 'number' ? metadata.install_count : 0,
    created_by: null,
    created_at: pack.createdAt,
    updated_at: pack.updatedAt,
    version: pack.version,
    changelog: typeof metadata.changelog === 'string' ? metadata.changelog : null,
    forked_from_id: null,
    forked_from_ver: null,
    component_type: null,
    cert_status: metadata.cert_status === 'experimental'
      || metadata.cert_status === 'community'
      || metadata.cert_status === 'verified'
      || metadata.cert_status === 'uncertified'
        ? metadata.cert_status
        : 'uncertified',
    cert_score: typeof metadata.cert_score === 'number' ? metadata.cert_score : null,
    cert_checked_at: typeof metadata.cert_checked_at === 'string' ? metadata.cert_checked_at : null,
    outcome_data: isRecord(metadata.outcome_data) ? metadata.outcome_data : {},
  })
}

function inferTemplateRisk(seed: {
  slug: string
  name: string
  category: string
  description?: string | null
  tags?: string[]
  spec: unknown
}): 'read_only' | 'low' | 'medium' | 'high' {
  const haystack = [
    seed.slug,
    seed.name,
    seed.category,
    seed.description ?? '',
    ...(seed.tags ?? []),
    JSON.stringify(seed.spec),
  ].join(' ').toLowerCase()

  if (/\b(refund|approve|publish|send|payment|checkout|trade|wallet|delete|transfer)\b/.test(haystack)) return 'medium'
  if (/\b(schedule|outreach|campaign|crm|social|support|ticket)\b/.test(haystack)) return 'low'
  return 'read_only'
}

function inferTemplateDependencies(seed: { name: string; spec: TemplateRegistrySeed['spec'] }) {
  const spec = seed.spec
  const pluginSlugs = spec.kind === 'agent'
    ? spec.plugins ?? []
    : spec.members.flatMap((member) => member.plugins ?? [])

  return Array.from(new Set(pluginSlugs)).map((plugin) => ({
    capability: `integration.${plugin}`,
    required: false,
    acceptedProviders: [plugin],
    reason: `${seed.name} can use the ${plugin} integration when connected.`,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
