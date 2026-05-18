'use client'

import type { LucideIcon } from 'lucide-react'
import { Info, Brain, Shield, Radio, AlertTriangle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '../status-badge'
import { EmptyState } from '../empty-state'
import { getEmptyState } from '@/lib/expressions'
import type { MCAgent, MCAgentContext } from '@/lib/mission-control/types'

interface ContextPaneProps {
  agent: MCAgent | null
  context: MCAgentContext | null
  loading: boolean
}

export function ContextPane({ agent, context, loading }: ContextPaneProps) {
  if (!agent) {
    return (
      <div className="flex-shrink-0 h-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Context</h2>
        </div>
        <EmptyState
          icon={<Info className="h-8 w-8" />}
          title={getEmptyState('context').title}
          description={getEmptyState('context').description}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-shrink-0 h-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Context</h2>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <StatusBadge status={agent.status} hasErrors={agent.errors_last_hour > 0} />
          <h2 className="text-sm font-semibold truncate">{agent.name}</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{agent.lucid_model}</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Last Error */}
          {context?.last_error && (
            <Section icon={AlertTriangle} title="Last Error" iconColor="text-red-400">
              <p className="text-xs text-red-400 bg-red-500/5 rounded p-2 font-mono break-all">
                {context.last_error}
              </p>
            </Section>
          )}

          {/* Channels */}
          {context?.channels && context.channels.length > 0 && (
            <Section icon={Radio} title="Channels">
              <div className="space-y-1">
                {context.channels.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${ch.is_active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    <span className="text-muted-foreground capitalize">{ch.channel_type}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Approval Config */}
          <Section icon={Shield} title="Approval Policy">
            {agent.approval_required_tools.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {agent.approval_required_tools.map((tool) => (
                  <code key={tool} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                    {tool}
                  </code>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">No approval-gated tools</p>
            )}
          </Section>

          {/* Memories */}
          <Section icon={Brain} title="Recent Memories">
            {context?.recent_memories && context.recent_memories.length > 0 ? (
              <div className="space-y-2">
                {context.recent_memories.map((mem) => (
                  <div key={mem.id} className="text-xs bg-muted/30 rounded p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground capitalize">
                        {mem.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {(mem.importance * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{mem.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/60">No memories loaded</p>
            )}
          </Section>

          {/* Pending Approvals Count */}
          {context && context.pending_approvals_count > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-400">
                {context.pending_approvals_count} pending approval{context.pending_approvals_count > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  iconColor = 'text-muted-foreground',
  children,
}: {
  icon: LucideIcon
  title: string
  iconColor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-xs font-medium">{title}</span>
      </div>
      {children}
    </div>
  )
}
