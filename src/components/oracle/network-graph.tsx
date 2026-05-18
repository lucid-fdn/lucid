'use client'

import { useState, useMemo } from 'react'
import type { GraphNode, GraphLink } from '@/lib/oracle/api'
import { formatUsd } from '@/lib/oracle/format'
import Link from 'next/link'

type SortKey = 'tx_count' | 'value'

interface NetworkConnectionListProps {
  nodes: GraphNode[]
  links: GraphLink[]
}

export function NetworkConnectionList({ nodes, links }: NetworkConnectionListProps) {
  const [sortBy, setSortBy] = useState<SortKey>('tx_count')
  const [search, setSearch] = useState('')

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    for (const n of nodes) {
      map.set(n.id, n)
    }
    return map
  }, [nodes])

  const sortedLinks = useMemo(() => {
    const filtered = links.filter((link) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const source = nodeMap.get(link.source)
      const target = nodeMap.get(link.target)
      const sourceName = source?.name?.toLowerCase() ?? link.source.toLowerCase()
      const targetName = target?.name?.toLowerCase() ?? link.target.toLowerCase()
      return sourceName.includes(q) || targetName.includes(q)
    })

    return [...filtered].sort((a, b) => {
      if (sortBy === 'tx_count') return (b.tx_count ?? 0) - (a.tx_count ?? 0)
      return (b.total_value_usd ?? 0) - (a.total_value_usd ?? 0)
    })
  }, [links, sortBy, search, nodeMap])

  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">No network connections yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Agent-to-agent transactions will appear here as on-chain data is indexed
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/70 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          <button
            type="button"
            onClick={() => setSortBy('tx_count')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              sortBy === 'tx_count'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Transactions
          </button>
          <button
            type="button"
            onClick={() => setSortBy('value')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              sortBy === 'value'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Value
          </button>
        </div>
        <input
          type="text"
          placeholder="Filter agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 px-2.5 py-1 text-xs bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <span className="w-7 text-right">#</span>
        <span className="flex-1">Source Agent</span>
        <span className="w-8 text-center">-&gt;</span>
        <span className="flex-1">Target Agent</span>
        <span className="w-20 text-right">Transactions</span>
        <span className="w-24 text-right">Total Value</span>
      </div>

      {/* Rows */}
      <div className="max-h-[600px] overflow-y-auto">
        {sortedLinks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-muted-foreground">No connections match your filter</p>
          </div>
        ) : (
          sortedLinks.map((link, i) => {
            const source = nodeMap.get(link.source)
            const target = nodeMap.get(link.target)
            const sourceName = source?.name ?? `Agent ${link.source.slice(0, 8)}`
            const targetName = target?.name ?? `Agent ${link.target.slice(0, 8)}`

            return (
              <div
                key={`${link.source}-${link.target}-${i}`}
                className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
              >
                <span className="w-7 text-right text-xs font-mono text-muted-foreground">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/oracle/agents/${link.source}`}
                    className="text-xs font-medium text-foreground hover:text-foreground transition-colors truncate block"
                  >
                    {sourceName}
                  </Link>
                  {source?.portfolio_value_usd != null && source.portfolio_value_usd > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Portfolio: {formatUsd(source.portfolio_value_usd)}
                    </span>
                  )}
                </div>
                <span className="w-8 text-center text-muted-foreground text-xs font-mono">
                  -&gt;
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/oracle/agents/${link.target}`}
                    className="text-xs font-medium text-foreground hover:text-foreground transition-colors truncate block"
                  >
                    {targetName}
                  </Link>
                  {target?.portfolio_value_usd != null && target.portfolio_value_usd > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Portfolio: {formatUsd(target.portfolio_value_usd)}
                    </span>
                  )}
                </div>
                <div className="w-20 text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-blue-400">
                    {link.tx_count ?? 0}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1">txns</span>
                </div>
                <div className="w-24 text-right shrink-0">
                  <span className="text-xs font-mono text-emerald-400">
                    {link.total_value_usd != null && link.total_value_usd > 0
                      ? formatUsd(link.total_value_usd)
                      : '--'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {sortedLinks.length > 0 && (
        <div className="px-4 py-2 bg-muted/50 border-t border-border text-[10px] text-muted-foreground">
          Showing {sortedLinks.length} of {links.length} connections
        </div>
      )}
    </div>
  )
}
