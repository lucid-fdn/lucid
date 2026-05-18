'use client'

/**
 * TraceDetail — Reusable detail sections for the trace inspector.
 *
 * Used by trace-inspector.tsx to render Input, Output, Tokens, Cost, etc.
 */

import { cn } from '@/lib/utils'

interface DetailRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function DetailRow({ label, value, className }: DetailRowProps) {
  return (
    <div className={cn('flex items-start gap-3 text-xs', className)}>
      <span className="text-muted-foreground min-w-[80px] shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  )
}

interface JsonBlockProps {
  label: string
  data: unknown
}

export function JsonBlock({ label, data }: JsonBlockProps) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const truncated = json.length > 2000 ? json.slice(0, 2000) + '\n...' : json

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
      <pre className="text-[11px] text-muted-foreground bg-muted/50 border border-border rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono">
        {truncated}
      </pre>
    </div>
  )
}

interface TokensSummaryProps {
  inputTokens?: number
  outputTokens?: number
}

export function TokensSummary({ inputTokens, outputTokens }: TokensSummaryProps) {
  if (!inputTokens && !outputTokens) return null
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">Tokens</span>
      {inputTokens != null && (
        <span className="text-muted-foreground">
          <span className="text-muted-foreground/60">in:</span> {inputTokens.toLocaleString()}
        </span>
      )}
      {outputTokens != null && (
        <span className="text-muted-foreground">
          <span className="text-muted-foreground/60">out:</span> {outputTokens.toLocaleString()}
        </span>
      )}
      {inputTokens != null && outputTokens != null && (
        <span className="text-muted-foreground">
          total: {(inputTokens + outputTokens).toLocaleString()}
        </span>
      )}
    </div>
  )
}
