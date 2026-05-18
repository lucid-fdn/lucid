'use client'

import type { ReactNode } from 'react'

interface GenerationSuggestionCardProps {
  reasoningSummary: string
  warnings?: string[]
  children: ReactNode
  title?: string
  className?: string
}

export function GenerationSuggestionCard({
  reasoningSummary,
  warnings = [],
  children,
  title = 'Suggested update',
  className = 'space-y-4 rounded-lg border p-4',
}: GenerationSuggestionCardProps) {
  return (
    <div className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{reasoningSummary}</p>
      </div>
      {warnings.length > 0 ? (
        <div className="space-y-1">
          {warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-500">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}
