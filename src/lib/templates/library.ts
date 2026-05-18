import type { LucidPack } from '@contracts/lucid-pack'
import type { TemplateCatalogEntry } from '@contracts/template'
import {
  getPackBackedTemplateType,
  isPackBackedTemplate,
  packBackedTemplateToCatalogEntry,
} from './pack-adapter'

export type TemplateLibraryItemType = 'agent' | 'team' | 'capability'
export type TemplateLibraryItemBackingKind = 'lucid_pack'

export interface TemplateLibraryItemBase {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  type: TemplateLibraryItemType
  source: 'platform' | 'community' | 'org'
  status: 'draft' | 'pending_review' | 'approved' | 'deprecated'
  version: string
  tags: string[]
  installCount: number
  previewPrompt: string | null
  backingKind: TemplateLibraryItemBackingKind
  action: 'deploy' | 'preview_install'
  createdAt: string
  updatedAt: string
}

export interface CapabilityTemplateLibraryItem extends TemplateLibraryItemBase {
  backingKind: 'lucid_pack'
  type: 'capability'
  action: 'preview_install'
  pack: LucidPack
}

export interface PackBackedDeployableTemplateLibraryItem extends TemplateLibraryItemBase {
  backingKind: 'lucid_pack'
  type: 'agent' | 'team'
  action: 'deploy'
  pack?: LucidPack
  template: TemplateCatalogEntry
}

export type TemplateLibraryItem =
  | CapabilityTemplateLibraryItem
  | PackBackedDeployableTemplateLibraryItem

export function deployableTemplateToLibraryItem(template: TemplateCatalogEntry): PackBackedDeployableTemplateLibraryItem {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    type: template.kind,
    source: template.source,
    status: template.status,
    version: template.version ?? '1.0.0',
    tags: template.tags,
    installCount: template.install_count,
    previewPrompt: template.preview_prompt,
    backingKind: 'lucid_pack',
    action: 'deploy',
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    template,
  }
}

export function capabilityPackToLibraryItem(pack: LucidPack): CapabilityTemplateLibraryItem {
  return {
    id: pack.id,
    slug: pack.packKey,
    name: pack.name,
    description: pack.description,
    category: getCapabilityTemplateCategory(pack),
    type: 'capability',
    source: pack.orgId ? 'org' : 'platform',
    status: pack.status === 'active' ? 'approved' : 'deprecated',
    version: pack.version,
    tags: getCapabilityTemplateTags(pack),
    installCount: 0,
    previewPrompt: null,
    backingKind: 'lucid_pack',
    action: 'preview_install',
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    pack,
  }
}

export function lucidPackToLibraryItem(pack: LucidPack): TemplateLibraryItem | null {
  const templateType = getPackBackedTemplateType(pack)
  if (templateType === 'capability') return capabilityPackToLibraryItem(pack)
  if (templateType !== 'agent' && templateType !== 'team') return null

  const template = packBackedTemplateToCatalogEntry(pack)
  if (!template) return null

  return {
    id: pack.id,
    slug: pack.packKey,
    name: pack.name,
    description: pack.description,
    category: template.category,
    type: templateType,
    source: template.source,
    status: template.status,
    version: pack.version,
    tags: template.tags,
    installCount: template.install_count,
    previewPrompt: template.preview_prompt,
    backingKind: 'lucid_pack',
    action: 'deploy',
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    pack,
    template,
  }
}

export function buildTemplateLibraryItems(input: {
  templates?: TemplateCatalogEntry[]
  capabilityPacks?: LucidPack[]
}): TemplateLibraryItem[] {
  const packItems = (input.capabilityPacks ?? [])
    .filter(isPackBackedTemplate)
    .map(lucidPackToLibraryItem)
    .filter((item): item is TemplateLibraryItem => item !== null)
  const packSlugs = new Set(packItems.map((item) => item.slug))
  const deployableItems = (input.templates ?? [])
    .filter((template) => !packSlugs.has(template.slug))
    .map(deployableTemplateToLibraryItem)

  return [
    ...packItems,
    ...deployableItems,
  ].sort((a, b) => {
    const category = a.category.localeCompare(b.category)
    if (category !== 0) return category
    return a.name.localeCompare(b.name)
  })
}

export function filterTemplateLibraryItems(
  items: TemplateLibraryItem[],
  input: {
    category?: string
    type?: TemplateLibraryItemType
    search?: string
  },
): TemplateLibraryItem[] {
  const query = input.search?.trim().toLowerCase() ?? ''
  return items.filter((item) => {
    if (input.category && item.category !== input.category) return false
    if (input.type && item.type !== input.type) return false
    if (!query) return true
    return getTemplateLibraryItemSearchText(item).toLowerCase().includes(query)
  })
}

export function getTemplateLibraryItemSearchText(item: TemplateLibraryItem): string {
  if (item.pack) {
    const composition = item.pack.manifest.composition
    return [
      item.id,
      item.slug,
      item.name,
      item.description ?? '',
      item.category,
      item.type,
      item.source,
      ...item.tags,
      String(item.pack.manifest.metadata?.default_risk ?? ''),
      ...(composition?.provides ?? []).map((capability) => `${capability.key} ${capability.name}`),
    ].join(' ')
  }

  return [
    item.id,
    item.slug,
    item.name,
    item.description ?? '',
    item.category,
    item.type,
    item.source,
    item.previewPrompt ?? '',
    ...item.tags,
  ].join(' ')
}

export function getCapabilityTemplateCategory(pack: LucidPack): string {
  const family = pack.manifest.metadata?.template_family
  if (typeof family === 'string' && family.trim()) {
    return family.replace(/[-_]+/g, ' ')
  }
  return 'capability'
}

function getCapabilityTemplateTags(pack: LucidPack): string[] {
  const metadataTags = pack.manifest.metadata?.tags
  const tags = Array.isArray(metadataTags) ? metadataTags.filter((tag): tag is string => typeof tag === 'string') : []
  return Array.from(new Set([
    'capability',
    'composable',
    ...tags,
    ...(pack.manifest.composition?.provides ?? []).map((capability) => capability.kind),
  ]))
}
