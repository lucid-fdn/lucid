'use client'

import * as React from 'react'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { ChevronRight, Search, Sparkles } from 'lucide-react'

import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { cn } from '@/lib/utils'

import { BrowseView } from '@/components/skills/browse-view'
import { InstalledView } from '@/components/skills/installed-view'
import { CapabilityAvatarStack } from '@/components/ui/capability-avatar-stack'
import {
  createCapabilityRegistryIndex,
  resolveCapabilityIconItems,
} from '@/lib/capabilities/icon-resolver'

interface ProjectBuilderUnifiedSkillManagerProps {
  draft: GenerationDraft
  items: UnifiedSkillItem[]
  fallbackItems?: Array<{
    slug: string
    name: string
    description?: string | null
    category?: string | null
    source?: string | null
  }>
  onUpdateDraft: (updater: (draft: GenerationDraft) => GenerationDraft) => void
}

function createFallbackSkillItem(input: {
  slug: string
  name: string
  description?: string | null
  category?: string | null
  source?: string | null
}): UnifiedSkillItem {
  return {
    id: `builder-skill:${input.slug}`,
    item_type: 'skill',
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? 'skills',
    section: 'installed',
    installed: false,
    is_active: false,
    installation_id: null,
    activation_id: null,
    tools: null,
    enabled_tools: null,
    tool_count: 0,
    can_act: false,
    always_on: false,
    removable: true,
    connection_status: null,
    auth_provider: null,
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1',
    author: null,
    source: input.source ?? 'internal',
    verified: false,
    source_type: null,
    support_level: 'native',
    capability_tier: null,
    trust_tier: null,
    warm_state: null,
    update_available: null,
  }
}

export function ProjectBuilderUnifiedSkillManager({
  draft,
  items,
  fallbackItems = [],
  onUpdateDraft,
}: ProjectBuilderUnifiedSkillManagerProps) {
  const [searchInput, setSearchInput] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<'installed' | 'browse'>('installed')
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedSkills = React.useMemo(
    () => new Set(draft.agent?.skills ?? []),
    [draft.agent?.skills],
  )

  const mergedItems = React.useMemo(() => {
    const itemMap = new Map<string, UnifiedSkillItem>()

    for (const item of items.filter((entry) => entry.item_type === 'skill')) {
      itemMap.set(item.slug, {
        ...item,
        installed: selectedSkills.has(item.slug),
        is_active: selectedSkills.has(item.slug),
        removable: true,
      })
    }

    for (const fallback of fallbackItems) {
      if (!selectedSkills.has(fallback.slug) || itemMap.has(fallback.slug)) continue
      itemMap.set(fallback.slug, {
        ...createFallbackSkillItem(fallback),
        installed: true,
        is_active: true,
      })
    }

    return [...itemMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [fallbackItems, items, selectedSkills])

  const installedCount = React.useMemo(
    () => mergedItems.filter((item) => item.installed).length,
    [mergedItems],
  )
  const installedItems = React.useMemo(
    () => mergedItems.filter((item) => item.installed && item.is_active),
    [mergedItems],
  )
  const capabilityRegistry = React.useMemo(
    () => createCapabilityRegistryIndex(mergedItems),
    [mergedItems],
  )
  const installedAvatarItems = React.useMemo(
    () => resolveCapabilityIconItems(installedItems, capabilityRegistry),
    [capabilityRegistry, installedItems],
  )

  React.useEffect(() => {
    setActiveTab(installedCount > 0 ? 'installed' : 'browse')
  }, [installedCount])

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const updateSelectedSkills = React.useCallback((slug: string, enabled: boolean) => {
    onUpdateDraft((current) => ({
      ...current,
      agent: current.agent
        ? {
            ...current.agent,
            skills: enabled
              ? Array.from(new Set([...(current.agent.skills ?? []), slug]))
              : (current.agent.skills ?? []).filter((entry) => entry !== slug),
          }
        : current.agent,
    }))
  }, [onUpdateDraft])

  const handleSearchChange = React.useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchQuery(value), 300)
  }, [])

  const noop = React.useCallback(() => {}, [])
  const getActivationBlockedReason = React.useCallback(() => null, [])

  return (
    <div className="space-y-5">
      <div
        className={cn(
          'flex items-center gap-3 px-1 py-3',
          'border-b border-border last:border-b-0',
          'cursor-pointer hover:bg-accent rounded-sm transition-colors duration-120',
        )}
        onClick={() => setActiveTab('installed')}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'Enter') setActiveTab('installed') }}
      >
        <span className="text-muted-foreground shrink-0"><Sparkles className="h-3.5 w-3.5" /></span>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">Skills</span>
        <div className="flex-1 min-w-0">
          {installedAvatarItems.length > 0 ? (
            <CapabilityAvatarStack
              items={installedAvatarItems}
              max={3}
              onAdd={() => setActiveTab('browse')}
              addTitle="Add skill"
              className="opacity-100"
            />
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-mono text-muted-foreground">No skills added</span>
              <CapabilityAvatarStack
                items={[]}
                avatarClassName="!size-7"
                iconSize={16}
                onAdd={() => setActiveTab('browse')}
                addTitle="Add skill"
                className="opacity-100"
              />
            </div>
          )}
        </div>
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>

      <div className="mb-1">
        <p className="text-[11px] text-muted-foreground">Add capabilities to this agent</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search skills, tools, integrations..."
            value={searchInput}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-transparent py-0 pr-3 pl-8 text-xs text-zinc-300 placeholder:text-zinc-700 transition-colors duration-120 h-8 focus:border-zinc-600 focus:outline-none"
            aria-label="Search skills"
          />
        </div>

        <div className="flex shrink-0 items-center rounded-lg border border-border bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('installed')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-120',
              activeTab === 'installed'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Agent Skills
            {installedCount > 0 ? (
              <span className={cn('ml-1.5 text-[10px]', activeTab === 'installed' ? 'text-zinc-400' : 'text-zinc-600')}>
                {installedCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all duration-120',
              activeTab === 'browse'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            Browse
          </button>
        </div>
      </div>

      {activeTab === 'installed' ? (
        <InstalledView
          items={mergedItems}
          searchQuery={searchQuery}
          getActivationBlockedReason={getActivationBlockedReason}
          getCapProjectionLabel={() => null}
          onToggle={(item, active) => updateSelectedSkills(item.slug, active)}
          onInstall={(item) => updateSelectedSkills(item.slug, true)}
          onUninstall={(item) => updateSelectedSkills(item.slug, false)}
          onConfigure={noop}
          onConnect={noop}
          onDisconnect={noop}
          busyId={null}
          connectingId={null}
        />
      ) : (
        <BrowseView
          items={mergedItems}
          searchQuery={searchQuery}
          getActivationBlockedReason={getActivationBlockedReason}
          getCapProjectionLabel={() => null}
          onInstall={(item) => updateSelectedSkills(item.slug, true)}
          busyId={null}
          connectingId={null}
        />
      )}
    </div>
  )
}
