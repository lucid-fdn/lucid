'use client'

import Link from 'next/link'
import { Layers3, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TemplateCombinationSuggestion } from '@/lib/templates/product-copy'

interface TemplateCombinationPanelProps {
  suggestions: TemplateCombinationSuggestion[]
  basePath?: string
  onSuggestionClick?: (suggestion: TemplateCombinationSuggestion) => void
  compact?: boolean
}

export function TemplateCombinationPanel({
  suggestions,
  basePath,
  onSuggestionClick,
  compact = false,
}: TemplateCombinationPanelProps) {
  if (suggestions.length === 0) return null

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/30 shadow-none">
      <CardHeader className={compact ? 'space-y-2 p-4' : undefined}>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Layers3 className="size-4" />
          </div>
          <div>
            <CardTitle className={compact ? 'text-base' : undefined}>Combine templates</CardTitle>
            <CardDescription>
              Add compatible utilities without learning Lucid Pack internals.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? 'space-y-2 p-4 pt-0' : 'space-y-3'}>
        {suggestions.map((suggestion) => {
          const href = basePath ? `${basePath}/${suggestion.slug}` : null
          const content = (
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                <Plus className="size-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{suggestion.name}</p>
                  <Badge variant="outline">{suggestion.type}</Badge>
                </div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{suggestion.reason}</p>
              </div>
            </div>
          )

          return href ? (
            <Button
              key={suggestion.slug}
              asChild
              variant="ghost"
              className="h-auto w-full justify-start rounded-xl border p-3 text-left hover:bg-muted/50"
              onClick={() => onSuggestionClick?.(suggestion)}
            >
              <Link href={href}>{content}</Link>
            </Button>
          ) : (
            <button
              key={suggestion.slug}
              type="button"
              className="flex w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50"
              onClick={() => onSuggestionClick?.(suggestion)}
            >
              {content}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
