'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import type { Agent as Assistant } from '@/types/agent'

interface AgentHealthGridProps {
  agents: Assistant[]
  workspaceSlug: string
  healthScores: Record<string, number | null>
}

function HealthPill({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-mono bg-muted text-muted-foreground">
        \u2014
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-mono font-medium',
        score > 75
          ? 'bg-emerald-500/10 text-emerald-400'
          : score > 40
            ? 'bg-amber-500/10 text-amber-400'
            : 'bg-red-500/10 text-red-400',
      )}
    >
      <span
        className={cn(
          'inline-block w-1.5 h-1.5 rounded-full',
          score > 75
            ? 'bg-emerald-400'
            : score > 40
              ? 'bg-amber-400'
              : 'bg-red-400',
        )}
      />
      {score}
    </span>
  )
}

export function AgentHealthGrid({
  agents,
  workspaceSlug,
  healthScores,
}: AgentHealthGridProps) {
  const router = useRouter()

  // Sort: needs-attention agents first, then by last activity
  const sorted = [...agents].sort((a, b) => {
    const scoreA = healthScores[a.id] ?? 100
    const scoreB = healthScores[b.id] ?? 100
    const needsAttA = scoreA < 60 || !(a.is_active ?? true)
    const needsAttB = scoreB < 60 || !(b.is_active ?? true)
    if (needsAttA && !needsAttB) return -1
    if (!needsAttA && needsAttB) return 1
    // Then by updated_at descending
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
  })

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">Your workspace is quiet.</p>
        <p className="text-xs text-muted-foreground mt-1">Create your first agent to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((agent) => {
        const score = healthScores[agent.id] ?? null
        const isActive = agent.is_active ?? true
        const channelCount = agent.assistant_channels?.length ?? 0

        return (
          <button
            key={agent.id}
            type="button"
            onClick={() => {
              const href = agent.projectSlug
                ? buildProjectAgentDetailPath(workspaceSlug, agent.projectSlug, agent.id)
                : null
              if (href) router.push(href)
            }}
            className={cn(
              'rounded-2xl border border-border/70 bg-background/55 p-4 text-left shadow-sm',
              'transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:bg-background/80 hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <BreathingDot
                color={isActive ? 'bg-emerald-400' : 'bg-zinc-500'}
                animate={isActive}
                size="sm"
              />
              <span className="text-sm font-medium text-foreground truncate flex-1">
                {agent.name}
              </span>
              <HealthPill score={score} />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {channelCount > 0 && (
                <span>{channelCount} channel{channelCount !== 1 ? 's' : ''}</span>
              )}
              {agent.lucid_model && (
                <span className="font-mono truncate">
                  {agent.lucid_model.includes('/')
                    ? agent.lucid_model.split('/').pop()
                    : agent.lucid_model}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
