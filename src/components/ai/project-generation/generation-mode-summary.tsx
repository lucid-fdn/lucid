'use client'

import { Badge } from '@/components/ui/badge'
import type { GeneratedBlueprintResult } from '@/lib/ai/project-generation/schemas'

interface GenerationModeSummaryProps {
  result: Pick<GeneratedBlueprintResult, 'mode' | 'selected_template' | 'confidence'>
  title?: string
}

export function GenerationModeSummary({
  result,
  title,
}: GenerationModeSummaryProps) {
  const modeLabel = result.mode === 'template'
    ? 'Template'
    : result.mode === 'blank-team'
      ? 'Team'
      : 'Agent'

  const detailLabel = result.mode === 'template' && result.selected_template?.name
    ? result.selected_template.name
    : result.mode === 'blank-team'
      ? 'Generated multi-agent setup'
      : 'Generated single-agent setup'

  return (
    <div className="space-y-2">
      {title ? (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {modeLabel}
        </Badge>
        <p className="text-sm font-medium text-foreground">{detailLabel}</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Confidence {Math.round(result.confidence * 100)}%
      </p>
    </div>
  )
}
