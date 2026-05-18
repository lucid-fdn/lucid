import 'server-only'

import type { TemplateCatalogEntry } from '@contracts/template'
import {
  getLucidPack,
  getLucidPackByPackKey,
  listLucidPacks,
} from '@/lib/db'
import {
  buildTemplateLibraryItems,
  filterTemplateLibraryItems,
  type TemplateLibraryItem,
  type TemplateLibraryItemType,
} from './library'
import { getPackBackedTemplateType, isPackBackedTemplate, packBackedTemplateToCatalogEntry } from './pack-adapter'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ListTemplateLibraryItemsInput {
  orgId?: string | null
  category?: string
  type?: TemplateLibraryItemType
  search?: string
  includeCapabilities?: boolean
  limit?: number
}

/**
 * Canonical server-side template library loader.
 *
 * Template = Lucid Pack.
 * Callers should consume `TemplateLibraryItem` instead of joining pack data
 * themselves.
 */
export async function listTemplateLibraryItems(input: ListTemplateLibraryItemsInput = {}): Promise<TemplateLibraryItem[]> {
  const includeCapabilities = input.includeCapabilities !== false
  const packs = await listLucidPacks({ orgId: input.orgId ?? null, status: 'active', limit: input.limit ?? 200 })

  return filterTemplateLibraryItems(
    buildTemplateLibraryItems({
      capabilityPacks: packs
        .filter(isPackBackedTemplate)
        .filter((pack) => includeCapabilities || getPackBackedTemplateType(pack) !== 'capability'),
    }),
    {
      category: input.category,
      type: input.type,
      search: input.search,
    },
  )
}

export async function listDeployableTemplateCatalogEntries(input: Omit<ListTemplateLibraryItemsInput, 'type'> & {
  kind?: 'agent' | 'team'
} = {}): Promise<TemplateCatalogEntry[]> {
  const items = await listTemplateLibraryItems({
    ...input,
    type: input.kind,
    includeCapabilities: false,
  })

  return items
    .filter((item) => item.action === 'deploy')
    .map((item) => item.template)
}

export async function getDeployableTemplateCatalogEntry(input: {
  idOrSlug: string
  orgId?: string | null
}): Promise<TemplateCatalogEntry | null> {
  const orgId = input.orgId ?? null
  const pack = UUID_RE.test(input.idOrSlug)
    ? await getLucidPack({ packId: input.idOrSlug, orgId })
    : await getLucidPackByPackKey({ packKey: input.idOrSlug, orgId })
  if (pack && (getPackBackedTemplateType(pack) === 'agent' || getPackBackedTemplateType(pack) === 'team')) {
    return packBackedTemplateToCatalogEntry(pack)
  }

  return null
}
