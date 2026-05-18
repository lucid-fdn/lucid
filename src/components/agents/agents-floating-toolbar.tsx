'use client'

import React from 'react'
import { Activity, LayoutGrid, List, Network, Plus, Users, X } from 'lucide-react'

import { SearchToolbar } from '@/components/page/search-toolbar'
import { ViewSwitcher } from '@/components/page/view-switcher'
import { cn } from '@/lib/utils'
import type { AgentsStatusFilter, AgentsViewMode } from './agents-list-types'

export function AgentsFloatingToolbar({
  title,
  agentCount,
  teamCount,
  crewsEnabled,
  hasAgents,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  feedOpen,
  feedEventCount,
  onToggleFeed,
  viewMode,
  onViewModeChange,
  onCreateAgent,
  onCreateCrew,
  selectedGroup,
  onClearSelectedGroup,
  onCreateCrewFromGroup,
}: {
  title: string
  agentCount: number
  teamCount: number
  crewsEnabled: boolean
  hasAgents: boolean
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  statusFilter: AgentsStatusFilter
  onStatusFilterChange: (value: AgentsStatusFilter) => void
  feedOpen: boolean
  feedEventCount: number
  onToggleFeed: () => void
  viewMode: AgentsViewMode
  onViewModeChange: (value: AgentsViewMode) => void
  onCreateAgent: () => void
  onCreateCrew: () => void
  selectedGroup: { id: string; name: string; memberIds: string[] } | null
  onClearSelectedGroup: () => void
  onCreateCrewFromGroup: (groupId: string, name: string, memberIds: string[]) => void
}) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/80 backdrop-blur-sm px-3 py-1.5">
          <h1 className="text-[13px] font-medium text-foreground">{title}</h1>
          {agentCount > 0 ? (
            <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {agentCount}
            </span>
          ) : null}
          {crewsEnabled && teamCount > 0 ? (
            <>
              <div className="h-3.5 w-px bg-border" />
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono tabular-nums">
                <Users className="h-3 w-3" />
                {teamCount}
              </span>
            </>
          ) : null}
        </div>

        <div className="flex-1" />

        <SearchToolbar
          value={searchQuery}
          onValueChange={onSearchQueryChange}
          placeholder="Search agents..."
          className="w-full max-w-[760px] justify-end rounded-lg px-1.5 py-1"
          leading={hasAgents ? (
            <>
              {([
                { value: 'all' as const, label: 'All' },
                { value: 'active' as const, label: 'Active' },
                { value: 'inactive' as const, label: 'Inactive' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onStatusFilterChange(value)}
                  className={cn(
                    'px-2 py-1 text-[12px] font-medium rounded transition-colors duration-150',
                    statusFilter === value
                      ? 'text-foreground bg-accent'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="w-px h-4 bg-border" />
            </>
          ) : null}
          trailing={
            <>
              {hasAgents ? (
                <button
                  type="button"
                  onClick={onToggleFeed}
                  className={cn(
                    'relative p-1.5 rounded transition-colors duration-150',
                    feedOpen ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Activity"
                >
                  <Activity className="h-4 w-4" />
                  {feedEventCount > 0 && !feedOpen ? (
                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : null}
                </button>
              ) : null}

              {hasAgents ? (
                <ViewSwitcher
                  value={viewMode}
                  onValueChange={onViewModeChange}
                  options={[
                    { value: 'canvas', icon: Network },
                    { value: 'grid', icon: LayoutGrid },
                    { value: 'list', icon: List },
                  ]}
                  className="border-0 bg-transparent p-0"
                />
              ) : null}

              {hasAgents ? <div className="w-px h-4 bg-border" /> : null}

              <button
                type="button"
                onClick={onCreateAgent}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-150"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>

              {crewsEnabled && hasAgents ? (
                <button
                  type="button"
                  onClick={onCreateCrew}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded bg-accent text-foreground border border-border hover:border-primary/50 hover:bg-accent/80 transition-colors duration-150"
                >
                  <Users className="h-3.5 w-3.5" />
                  Create Team
                </button>
              ) : null}

              {selectedGroup ? (
                <div className="inline-flex items-center gap-2 rounded border border-border bg-background/70 px-2.5 py-1 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground truncate max-w-[140px]">{selectedGroup.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedGroup.memberIds.length} {selectedGroup.memberIds.length === 1 ? 'agent' : 'agents'}
                  </span>
                  <button
                    type="button"
                    onClick={onClearSelectedGroup}
                    className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
                    aria-label="Clear group selection"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}

              {crewsEnabled && selectedGroup && selectedGroup.memberIds.length >= 1 ? (
                <button
                  type="button"
                  onClick={() => onCreateCrewFromGroup(selectedGroup.id, selectedGroup.name, selectedGroup.memberIds)}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[12px] font-medium text-emerald-300 transition-colors duration-150 hover:bg-emerald-500/15"
                >
                  <Users className="h-3.5 w-3.5" />
                  Convert to Team
                </button>
              ) : null}
            </>
          }
        />
      </div>
    </div>
  )
}
