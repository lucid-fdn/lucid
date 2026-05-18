import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { RetailFleetAssistant } from '@/lib/retail/ownership'

interface RetailFleetListProps {
  assistants: RetailFleetAssistant[]
}

/**
 * Phase 5 — simple retail fleet (card grid).
 *
 * Deliberately minimal: the retail surface shows 1 agent per user in the
 * common case, so we optimize for "clearly visible" over "dense table."
 * Each card exposes the two navigation targets the user needs:
 *
 *   • Chat  → the real chat surface at /agents-preview/chat/[id]
 *   • Setup → the activation tutorial at /agents-preview/created/[id]
 *
 * No kebab menus, no delete, no health score. Pro-app operators use the
 * Studio fleet for that. The retail fleet exists so a returning user can
 * find their agent without bookmarking the UUID URL.
 */
export function RetailFleetList({ assistants }: RetailFleetListProps) {
  if (assistants.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
        <p className="text-base font-medium text-foreground">No agents yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a template to spin one up in under a minute.
        </p>
        <Button asChild className="mt-5">
          <Link href="/agents-preview">Browse templates</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {assistants.map((assistant) => (
        <Card key={assistant.id} className="flex flex-col">
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="truncate text-base">
                {assistant.name}
              </CardTitle>
              <Badge variant={assistant.isActive ? 'secondary' : 'outline'}>
                {assistant.isActive ? 'Live' : 'Paused'}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Created {formatCreatedAt(assistant.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto flex gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link href={`/agents-preview/chat/${assistant.id}`}>Chat</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/agents-preview/created/${assistant.id}`}>
                Setup
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * Locale-stable date formatting for SSR. We avoid `toLocaleDateString`
 * without an explicit locale because server/client locales can diverge
 * and produce hydration mismatches.
 */
function formatCreatedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
