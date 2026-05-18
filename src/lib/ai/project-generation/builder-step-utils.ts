import type { UnifiedSkillItem } from '@contracts/unified-skill'

import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'

export interface BuilderPendingConnection {
  id: string
  slug: string
  name: string
  category: string
  providerId: string
  providerName: string
  itemType: 'plugin' | 'skill'
  connectionStatus: 'connected' | 'setup_required' | null
  setupMode: 'connect' | 'choose_account'
  selectedConnectionRowId: string | null
  connectionOptions: Array<{
    id: string
    connection_id: string
    account_label: string | null
    account_id: string | null
    status: 'active' | 'expired' | 'revoked' | 'error'
  }>
}

export function isCapabilitySelectedInDraft(item: UnifiedSkillItem, draft: GenerationDraft | null | undefined) {
  if (!draft?.agent) return false
  if (item.item_type === 'skill') return (draft.agent.skills ?? []).includes(item.slug)
  return (draft.agent.plugins ?? []).includes(item.slug)
}

export function getPendingBuilderConnections(
  draft: GenerationDraft | null | undefined,
  availableUnifiedSkills: UnifiedSkillItem[],
): BuilderPendingConnection[] {
  if (!draft?.agent) return []

  const byProvider = new Map<string, BuilderPendingConnection>()

  for (const item of availableUnifiedSkills
    .filter((item) => (
      Boolean(item.auth_provider)
      && isCapabilitySelectedInDraft(item, draft)
      && (
        item.connection_status !== 'connected'
        || (item.connection_options?.filter((connection) => connection.status === 'active').length ?? 0) > 1
      )
    ))
  ) {
    if (byProvider.has(item.auth_provider!)) continue
    const activeConnectionOptions = (item.connection_options ?? []).filter((connection) => connection.status === 'active')
    const setupMode = item.connection_status === 'connected' && activeConnectionOptions.length > 1
      ? 'choose_account'
      : 'connect'
    byProvider.set(item.auth_provider!, {
      id: item.id,
      slug: item.slug,
      name: item.name,
      category: item.category,
      providerId: item.auth_provider!,
      providerName: item.name,
      itemType: item.item_type ?? 'plugin',
      connectionStatus: item.connection_status,
      setupMode,
      selectedConnectionRowId: item.selected_connection_row_id ?? item.connection_row_id ?? activeConnectionOptions[0]?.id ?? null,
      connectionOptions: activeConnectionOptions,
    })
  }

  return Array.from(byProvider.values()).sort((a, b) => a.name.localeCompare(b.name))
}
