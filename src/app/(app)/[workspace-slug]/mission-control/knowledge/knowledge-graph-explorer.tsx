'use client'

import { useCallback, useState } from 'react'
import { GitBranch, Loader2, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, PageSection } from '@/components/page'
import { WorkspaceActionRow } from '@/components/workspace/workspace-action-row'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export interface KnowledgeGraphEntityItem {
  id: string
  canonicalName: string
  type: string
  status: string
  confidence: number
  description: string | null
}

interface KnowledgeGraphRelationshipItem {
  id: string
  relationType: string
  direction: 'directed' | 'bidirectional'
  confidence: number
  evidence: Array<{ kind?: string; label?: string | null }>
}

interface KnowledgeGraphNeighborItem {
  entity: KnowledgeGraphEntityItem
  relationship: KnowledgeGraphRelationshipItem
  direction: 'outbound' | 'inbound'
}

interface KnowledgeGraphExplorerProps {
  orgId: string
  entities: KnowledgeGraphEntityItem[]
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function KnowledgeGraphExplorer({ orgId, entities: initialEntities }: KnowledgeGraphExplorerProps) {
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState(initialEntities)
  const [selectedEntity, setSelectedEntity] = useState<KnowledgeGraphEntityItem | null>(initialEntities[0] ?? null)
  const [neighbors, setNeighbors] = useState<KnowledgeGraphNeighborItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isExpanding, setIsExpanding] = useState(false)

  const searchEntities = useCallback(async () => {
    setIsSearching(true)
    try {
      const params = new URLSearchParams({ org_id: orgId, limit: '24' })
      const trimmed = query.trim()
      if (trimmed) params.set('query', trimmed)
      const response = await fetch(`/api/knowledge/graph/entities?${params.toString()}`)
      const body = await response.json().catch(() => null) as { entities?: KnowledgeGraphEntityItem[]; error?: string } | null
      if (!response.ok) throw new Error(body?.error ?? `Search failed with ${response.status}`)
      const nextEntities = body?.entities ?? []
      setEntities(nextEntities)
      setSelectedEntity(nextEntities[0] ?? null)
      setNeighbors([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Knowledge graph search failed')
    } finally {
      setIsSearching(false)
    }
  }, [orgId, query])

  const expandEntity = useCallback(async (entity: KnowledgeGraphEntityItem) => {
    setSelectedEntity(entity)
    setIsExpanding(true)
    try {
      const params = new URLSearchParams({ org_id: orgId, limit: '16' })
      const response = await fetch(`/api/knowledge/graph/entities/${entity.id}/neighbors?${params.toString()}`)
      const body = await response.json().catch(() => null) as { neighbors?: KnowledgeGraphNeighborItem[]; error?: string } | null
      if (!response.ok) throw new Error(body?.error ?? `Expansion failed with ${response.status}`)
      setNeighbors(body?.neighbors ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Knowledge graph expansion failed')
    } finally {
      setIsExpanding(false)
    }
  }, [orgId])

  const resetSearch = useCallback(() => {
    setQuery('')
    setEntities(initialEntities)
    setSelectedEntity(initialEntities[0] ?? null)
    setNeighbors([])
  }, [initialEntities])

  return (
    <PageSection
      title="Entity Graph"
      description="Search entities and expand capped relationships for graph-aware recall without exposing raw graph complexity."
      actions={<GitBranch className="h-5 w-5 text-primary" />}
      contentClassName="space-y-4"
    >
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void searchEntities()
          }}
          placeholder="Search people, repos, decisions, agents..."
        />
        <Button type="button" variant="secondary" onClick={() => { void searchEntities() }} disabled={isSearching}>
          {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
          Search
        </Button>
        {query || entities !== initialEntities ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Reset graph search" onClick={resetSearch}>
            <X />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-2">
          {entities.length === 0 ? (
            <EmptyState
              title="No entities match this graph query"
              description="Try another person, repo, decision, or agent name."
              className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
            />
          ) : (
            entities.slice(0, 12).map((entity) => (
              <button
                key={entity.id}
                type="button"
                className={cn(
                  'w-full rounded-xl border border-border/55 bg-background/35 px-3 py-3 text-left transition-colors hover:bg-accent/30',
                  selectedEntity?.id === entity.id && 'border-primary/50 bg-primary/5',
                )}
                onClick={() => { void expandEntity(entity) }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-foreground">{entity.canonicalName}</p>
                  <Badge variant="outline">{formatLabel(entity.type)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatPercent(entity.confidence)} confidence - {entity.status}
                </p>
                {entity.description ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{entity.description}</p>
                ) : null}
              </button>
            ))
          )}
        </div>

        <PageSection className="py-4" contentClassName="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {selectedEntity ? selectedEntity.canonicalName : 'Select an entity'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedEntity
                  ? 'Expand shows direct inbound/outbound relationships only. Runtime graph boosts stay capped separately.'
                  : 'Pick an entity to inspect connected context.'}
              </p>
            </div>
            {isExpanding ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="mt-4 space-y-2">
            {!selectedEntity ? null : neighbors.length === 0 ? (
              <EmptyState
                title="No direct neighbors loaded"
                description="Select this entity again to expand, or graph data may still be sparse."
                className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
              />
            ) : (
              neighbors.map((neighbor) => (
                <WorkspaceActionRow
                  key={`${neighbor.relationship.id}-${neighbor.entity.id}`}
                  title={neighbor.entity.canonicalName}
                  eyebrow={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{neighbor.direction}</Badge>
                      <Badge variant="outline">{formatLabel(neighbor.relationship.relationType)}</Badge>
                      <Badge variant="outline">{formatPercent(neighbor.relationship.confidence)} confidence</Badge>
                    </span>
                  }
                  description={`${formatLabel(neighbor.entity.type)} - ${neighbor.relationship.direction}${
                    neighbor.relationship.evidence.length > 0
                      ? ` - ${neighbor.relationship.evidence.length} evidence link${neighbor.relationship.evidence.length === 1 ? '' : 's'}`
                      : ''
                  }`}
                />
              ))
            )}
          </div>
        </PageSection>
      </div>
    </PageSection>
  )
}
