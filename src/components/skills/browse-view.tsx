'use client'

import { useMemo, useState, memo } from 'react'
import { cn } from '@/lib/utils'
import { SkillCard } from './skill-card'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

// =============================================================================
// CATEGORY MAPPING — raw DB categories → 7 user-friendly groups
// =============================================================================

const CATEGORY_GROUP_MAP: Record<string, string> = {
  // Trading & DeFi
  trading: 'Trading & DeFi',
  defi: 'Trading & DeFi',
  blockchain: 'Trading & DeFi',

  // Data & Analytics
  analytics: 'Data & Analytics',
  intelligence: 'Data & Analytics',
  security: 'Data & Analytics',
  finance: 'Data & Analytics',

  // Communication
  communication: 'Communication',
  messaging: 'Communication',

  // Productivity
  productivity: 'Productivity',
  operations: 'Productivity',
  scheduling: 'Productivity',
  orchestration: 'Productivity',

  // Sales & Marketing
  sales: 'Sales & Marketing',
  marketing: 'Sales & Marketing',
  crm: 'Sales & Marketing',
  hr: 'Sales & Marketing',

  // Media & Content
  content: 'Media & Content',
  compute: 'Media & Content',

  // Development
  development: 'Development',
}

/** Display order for category tabs */
const CATEGORY_ORDER = [
  'Trading & DeFi',
  'Data & Analytics',
  'Communication',
  'Productivity',
  'Sales & Marketing',
  'Media & Content',
  'Development',
]

function getDisplayCategory(raw: string): string {
  return CATEGORY_GROUP_MAP[raw] ?? 'General'
}

// =============================================================================
// BROWSE VIEW — OS-like rows with category chips
// =============================================================================

interface BrowseViewProps {
  items: UnifiedSkillItem[]
  searchQuery: string
  getActivationBlockedReason: (item: UnifiedSkillItem) => string | null
  getCapProjectionLabel: (item: UnifiedSkillItem) => string | null
  onInstall: (item: UnifiedSkillItem) => void
  busyId: string | null
  connectingId: string | null
  deferConnectionUntilSelected?: boolean
}

export function BrowseView({
  items,
  searchQuery,
  getActivationBlockedReason,
  getCapProjectionLabel,
  onInstall,
  busyId,
  connectingId,
  deferConnectionUntilSelected = false,
}: BrowseViewProps) {
  const [categoryFilter, setCategoryFilter] = useState('All')

  // Compute available display categories from non-installed items only
  const categories = useMemo(() => {
    const present = new Set<string>()
    for (const item of items) {
      if (!item.installed && item.connection_status !== 'connected') {
        present.add(getDisplayCategory(item.category))
      }
    }
    const ordered = CATEGORY_ORDER.filter(c => present.has(c))
    return ['All', ...ordered]
  }, [items])

  const filtered = useMemo(() => {
    // Only show items not yet added/connected
    let result = items.filter(i => !i.installed && i.connection_status !== 'connected')

    if (categoryFilter !== 'All') {
      result = result.filter(i => getDisplayCategory(i.category) === categoryFilter)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        i =>
          i.name.toLowerCase().includes(q) ||
          i.slug.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          getDisplayCategory(i.category).toLowerCase().includes(q) ||
          i.tools?.some(t => t.name.toLowerCase().includes(q)),
      )
    }

    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [items, categoryFilter, searchQuery])

  return (
    <div className="space-y-4">
      {/* Category filter — pills */}
      <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filter by category">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={categoryFilter === cat}
            className={cn(
              'px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-120',
              categoryFilter === cat
                ? 'bg-zinc-200 text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            )}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-zinc-600">
            {searchQuery ? 'No skills match your search.' : 'No skills available in this category.'}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((item) => (
            <MemoizedBrowseCard
              key={item.id}
              item={item}
              variant="browse"
              activationBlockedReason={getActivationBlockedReason(item)}
              capProjectionLabel={getCapProjectionLabel(item)}
              onInstall={onInstall}
              isBusy={busyId === item.id || connectingId === item.id}
              deferConnectionUntilSelected={deferConnectionUntilSelected}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const MemoizedBrowseCard = memo(SkillCard, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isBusy === next.isBusy &&
    prev.activationBlockedReason === next.activationBlockedReason
  )
})
MemoizedBrowseCard.displayName = 'MemoizedBrowseCard'
