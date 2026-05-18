'use client'

import { useMemo, memo } from 'react'
import { SkillCard } from './skill-card'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

// =============================================================================
// SORT ORDER
// =============================================================================

function sortPriority(item: UnifiedSkillItem): number {
  // Connected integrations first (success state)
  if (item.connection_status === 'connected') return 0
  // Needs attention next
  if (item.connection_status === 'setup_required') return 1
  // Active skills
  if (item.is_active) return 2
  // Inactive installed
  return 3
}

// =============================================================================
// INSTALLED VIEW — OS-like rows
// =============================================================================

interface InstalledViewProps {
  items: UnifiedSkillItem[]
  searchQuery: string
  getActivationBlockedReason: (item: UnifiedSkillItem) => string | null
  getCapProjectionLabel: (item: UnifiedSkillItem) => string | null
  onToggle: (item: UnifiedSkillItem, active: boolean) => void
  onInstall: (item: UnifiedSkillItem) => void
  onUninstall: (item: UnifiedSkillItem) => void
  onConfigure: (item: UnifiedSkillItem) => void
  onConnect: (item: UnifiedSkillItem) => void
  onDisconnect: (item: UnifiedSkillItem) => void
  busyId: string | null
  connectingId: string | null
  deferConnectionUntilSelected?: boolean
}

export function InstalledView({
  items,
  searchQuery,
  getActivationBlockedReason,
  getCapProjectionLabel,
  onToggle,
  onInstall,
  onUninstall,
  onConfigure,
  onConnect,
  onDisconnect,
  busyId,
  connectingId,
  deferConnectionUntilSelected = false,
}: InstalledViewProps) {
  const installed = useMemo(() => {
    let result = items.filter(i => i.installed)

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        i =>
          i.name.toLowerCase().includes(q) ||
          i.slug.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.tools?.some(t => t.name.toLowerCase().includes(q)),
      )
    }

    result.sort((a, b) => sortPriority(a) - sortPriority(b))
    return result
  }, [items, searchQuery])

  if (installed.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-xs text-zinc-600">
          {searchQuery ? 'No installed skills match your search.' : 'No skills installed yet.'}
        </p>
        {!searchQuery && (
          <p className="text-[11px] text-zinc-700 mt-1">
            Browse the catalog to add capabilities.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      {installed.map((item) => (
        <MemoizedCard
          key={item.id}
          item={item}
          variant="installed"
          activationBlockedReason={getActivationBlockedReason(item)}
          capProjectionLabel={getCapProjectionLabel(item)}
          onToggle={onToggle}
          onInstall={onInstall}
          onUninstall={onUninstall}
          onConfigure={onConfigure}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          isBusy={busyId === item.id || connectingId === item.id}
          deferConnectionUntilSelected={deferConnectionUntilSelected}
        />
      ))}
    </div>
  )
}

const MemoizedCard = memo(SkillCard, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isBusy === next.isBusy &&
    prev.activationBlockedReason === next.activationBlockedReason
  )
})
MemoizedCard.displayName = 'MemoizedInstalledCard'
