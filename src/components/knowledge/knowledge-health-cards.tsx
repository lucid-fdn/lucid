import { BookOpen, Database, FileText, ShieldCheck } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KnowledgeManagerOverview } from '@/features/knowledge-manager/types'

export function KnowledgeHealthCards({ overview }: { overview: KnowledgeManagerOverview }) {
  const cards = [
    {
      label: 'Facts',
      value: String(overview.counts.facts.total),
      detail: `${overview.counts.facts.project} project · ${overview.counts.facts.team} team · ${overview.counts.facts.workspace} workspace`,
      icon: BookOpen,
    },
    {
      label: 'Documents',
      value: `${overview.counts.documents.ready}/${overview.counts.documents.total}`,
      detail: `${overview.counts.documents.indexing} indexing · ${overview.counts.documents.failed} failed`,
      icon: FileText,
    },
    {
      label: 'Sources',
      value: `${overview.counts.sources.active}/${overview.counts.sources.total}`,
      detail: `${overview.counts.sources.stale} need review · ${overview.counts.sources.paused} paused`,
      icon: Database,
    },
    {
      label: 'Recall health',
      value: `${Math.round(overview.health.citationCoverage * 100)}%`,
      detail: `${overview.health.staleSourceCount} stale or failed signals`,
      icon: ShieldCheck,
    },
  ]

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.label} className="bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-primary" />
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
