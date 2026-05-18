'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StreamNode as StreamNodeComponent } from './stream-node'
import type { StreamNode } from '@/hooks/use-introspection-stream'

interface CollapsedToolGroupProps {
  toolName: string
  nodes: StreamNode[]
  className?: string
}

const TOOL_KINDS = new Set(['tool_start', 'tool_result', 'tool_error', 'tool_cache_hit'])

export function CollapsedToolGroup({ toolName, nodes, className }: CollapsedToolGroupProps) {
  const [expanded, setExpanded] = useState(false)

  const totalDuration = nodes.reduce((sum, n) => sum + (n.durationMs ?? 0), 0)
  const avgDuration = nodes.length > 0 ? Math.round(totalDuration / nodes.length) : 0
  const errors = nodes.filter((n) => n.status === 'error').length

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full py-1.5 pl-4 text-xs',
          'border border-transparent hover:border-border transition-colors duration-150 rounded-sm',
        )}
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <Wrench className="h-3 w-3 text-muted-foreground" />
        <span className="text-blue-300 font-mono text-[11px]">{toolName}</span>
        <span className="text-muted-foreground">&times;{nodes.length}</span>
        {avgDuration > 0 && (
          <span className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
            avg {avgDuration}ms
          </span>
        )}
        {errors > 0 && (
          <span className="text-red-400 text-[10px]">{errors} failed</span>
        )}
      </button>
      {expanded && (
        <div className="pl-4">
          {nodes.map((node) => (
            <StreamNodeComponent key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Group consecutive same-tool nodes when run has >20 tool nodes */
export function useCollapsedNodes(nodes: StreamNode[]): Array<StreamNode | { type: 'group'; toolName: string; nodes: StreamNode[] }> {
  const toolNodes = nodes.filter((n) => TOOL_KINDS.has(n.kind))

  // Only collapse when we have enough tool nodes
  if (toolNodes.length <= 20) return nodes

  const result: Array<StreamNode | { type: 'group'; toolName: string; nodes: StreamNode[] }> = []
  let i = 0

  while (i < nodes.length) {
    const node = nodes[i]
    const toolName = String(node.data.tool_name ?? '')

    // Check for consecutive same-tool events
    if (toolName && TOOL_KINDS.has(node.kind)) {
      const group: StreamNode[] = [node]
      let j = i + 1
      while (j < nodes.length) {
        const next = nodes[j]
        const nextToolName = String(next.data.tool_name ?? '')
        if (nextToolName === toolName && TOOL_KINDS.has(next.kind)) {
          group.push(next)
          j++
        } else {
          break
        }
      }

      if (group.length >= 3) {
        result.push({ type: 'group', toolName, nodes: group })
        i = j
        continue
      }
    }

    result.push(node)
    i++
  }

  return result
}
