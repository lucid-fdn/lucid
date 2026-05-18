'use client'

import { useDeferredValue, useEffect, useState, useTransition } from 'react'
import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { GlobalSearchResponse, GlobalSearchResult } from '@contracts/global-search'

interface MissionControlGlobalSearchProps {
  orgId: string
  workspaceSlug: string
}

export function MissionControlGlobalSearch({ orgId, workspaceSlug }: MissionControlGlobalSearchProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [partial, setPartial] = useState(false)

  useEffect(() => {
    const q = deferredQuery.trim()
    if (q.length < 2) {
      setResults([])
      setPartial(false)
      return
    }

    const controller = new AbortController()
    startTransition(() => {
      const params = new URLSearchParams({
        org_id: orgId,
        workspace_slug: workspaceSlug,
        q,
        limit: '8',
      })
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((body: GlobalSearchResponse | null) => {
          setResults(body?.results ?? [])
          setPartial(Boolean(body?.partial))
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') {
            setResults([])
            setPartial(true)
          }
        })
    })

    return () => controller.abort()
  }, [deferredQuery, orgId, workspaceSlug])

  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search runs, Knowledge, claims, agents, evidence..."
        className="h-10 pl-9"
      />
      {query.trim().length >= 2 && (
        <div className="absolute right-0 top-12 z-40 w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {isPending ? 'Searching...' : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </span>
            {partial ? <Badge variant="outline">Partial</Badge> : null}
          </div>
          {results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No matching Agent Ops or Knowledge records yet.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {results.map((result) => (
                <a
                  key={`${result.type}:${result.id}`}
                  href={result.href}
                  className="block border-b px-3 py-3 last:border-b-0 hover:bg-accent/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {result.snippet ?? result.subtitle ?? result.href}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {result.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
