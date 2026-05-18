import type { TemplateCatalogEntry } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

export type CapabilityRef =
  | string
  | {
      id?: string | null
      slug?: string | null
      item_type?: UnifiedSkillItem['item_type'] | null
      name?: string | null
      label?: string | null
      category?: string | null
      section?: UnifiedSkillItem['section'] | null
      always_on?: boolean | null
    }

export interface CapabilityIconItem {
  id: string
  slug: string
  label?: string
  category?: string
  section?: UnifiedSkillItem['section']
  alwaysOn?: boolean
  itemType?: UnifiedSkillItem['item_type']
  source: 'registry' | 'reference'
}

export interface CapabilityRegistryIndex {
  byKey: Map<string, UnifiedSkillItem>
}

const ICON_SLUG_ALIASES: Record<string, string> = {
  'google-workspace': 'google',
  'google-mail': 'gmail',
  'brave-search': 'brave',
  msteams: 'microsoftteams',
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function compactKey(value: string): string {
  return value.replace(/[^a-z0-9]/g, '')
}

function addKey(map: Map<string, UnifiedSkillItem>, key: string | null | undefined, item: UnifiedSkillItem) {
  const normalized = normalizeKey(key)
  if (!normalized) return
  map.set(normalized, item)
  map.set(compactKey(normalized), item)
}

export function createCapabilityRegistryIndex(items: UnifiedSkillItem[] = []): CapabilityRegistryIndex {
  const byKey = new Map<string, UnifiedSkillItem>()

  for (const item of items) {
    addKey(byKey, item.id, item)
    addKey(byKey, item.slug, item)
    addKey(byKey, `${item.item_type ?? 'skill'}:${item.slug}`, item)
    addKey(byKey, `${item.item_type ?? 'skill'}:${item.id}`, item)

    if (item.item_type) {
      addKey(byKey, `${item.item_type}:${item.slug}`, item)
    }
  }

  return { byKey }
}

export function normalizeCapabilityIconSlug(slug: string): string {
  const normalized = normalizeKey(slug) ?? slug
  return ICON_SLUG_ALIASES[normalized] ?? normalized
}

function refKeys(ref: CapabilityRef): string[] {
  if (typeof ref === 'string') {
    const normalized = normalizeKey(ref)
    return normalized ? [normalized] : []
  }

  const keys = [
    ref.id,
    ref.slug,
    ref.item_type && ref.slug ? `${ref.item_type}:${ref.slug}` : null,
    ref.item_type && ref.id ? `${ref.item_type}:${ref.id}` : null,
  ]

  return keys.flatMap((key) => {
    const normalized = normalizeKey(key)
    return normalized ? [normalized, compactKey(normalized)] : []
  })
}

function getRefSlug(ref: CapabilityRef): string | null {
  return typeof ref === 'string' ? normalizeKey(ref) : normalizeKey(ref.slug ?? ref.id)
}

function getRefLabel(ref: CapabilityRef): string | undefined {
  if (typeof ref === 'string') return undefined
  return ref.label ?? ref.name ?? undefined
}

export function resolveCapabilityIconItem(
  ref: CapabilityRef,
  registry: CapabilityRegistryIndex = createCapabilityRegistryIndex(),
): CapabilityIconItem | null {
  const item = refKeys(ref)
    .map((key) => registry.byKey.get(key))
    .find(Boolean)

  if (item) {
    return {
      id: item.id,
      slug: normalizeCapabilityIconSlug(item.slug),
      label: item.name,
      category: item.category,
      section: item.section,
      alwaysOn: item.always_on,
      itemType: item.item_type,
      source: 'registry',
    }
  }

  const slug = getRefSlug(ref)
  if (!slug) return null

  return {
    id: slug,
    slug: normalizeCapabilityIconSlug(slug),
    label: getRefLabel(ref),
    category: typeof ref === 'string' ? undefined : ref.category ?? undefined,
    section: typeof ref === 'string' ? undefined : ref.section ?? undefined,
    alwaysOn: typeof ref === 'string' ? undefined : ref.always_on ?? undefined,
    itemType: typeof ref === 'string' ? undefined : ref.item_type ?? undefined,
    source: 'reference',
  }
}

export function resolveCapabilityIconItems(
  refs: CapabilityRef[],
  registry: CapabilityRegistryIndex = createCapabilityRegistryIndex(),
): CapabilityIconItem[] {
  const seen = new Set<string>()
  const items: CapabilityIconItem[] = []

  for (const ref of refs) {
    const item = resolveCapabilityIconItem(ref, registry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }

  return items
}

export function getTemplateCapabilityRefs(template: TemplateCatalogEntry): CapabilityRef[] {
  if (template.spec.kind === 'agent') {
    const plugins = template.spec.plugins ?? []
    if (plugins.length > 0) {
      return plugins.map((slug) => ({ slug, item_type: 'plugin' as const }))
    }

    return (template.spec.skills ?? []).map((slug) => ({ slug, item_type: 'skill' as const }))
  }

  const refs: CapabilityRef[] = []
  const seen = new Set<string>()

  for (const member of template.spec.members) {
    for (const slug of member.plugins ?? []) {
      const key = `plugin:${slug}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ slug, item_type: 'plugin' })
    }

    for (const slug of member.skills ?? []) {
      const key = `skill:${slug}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ slug, item_type: 'skill' })
    }
  }

  return refs
}
