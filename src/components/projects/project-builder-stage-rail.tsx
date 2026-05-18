'use client'

import { CheckCircle2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { BuilderStage } from '@/lib/ai/project-generation/schemas'

const STAGES: Array<{ id: BuilderStage; label: string }> = [
  { id: 'create-agent', label: 'Create Agent' },
  { id: 'deploy', label: 'Deploy' },
]

interface ProjectBuilderStageRailProps {
  stage: BuilderStage
  className?: string
}

export function ProjectBuilderStageRail({
  stage,
  className,
}: ProjectBuilderStageRailProps) {
  const activeIndex = STAGES.findIndex((item) => item.id === stage)

  return (
    <div className={cn('rounded-2xl border border-border/60 bg-background/70 px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {STAGES.map((item, index) => {
          const isDone = index < activeIndex
          const isActive = index === activeIndex
          return (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-medium transition-colors',
                    isDone
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                      : isActive
                        ? 'border-foreground/20 bg-foreground/5 text-foreground'
                        : 'border-border/60 bg-muted/30 text-muted-foreground',
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span className={cn('text-sm', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {item.label}
                </span>
              </div>
              {index < STAGES.length - 1 ? (
                <div className="hidden h-px w-8 bg-border/60 md:block" />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
