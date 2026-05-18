'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, BarChart3, Loader2, Repeat2, Rocket, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { TemplateProductEventType } from '@/lib/db/template-product-events'

interface TemplateFunnelTemplate {
  templateSlug: string
  templateName: string | null
  templateType: 'agent' | 'team' | 'capability'
  backingKind: 'lucid_pack' | null
  events: Record<TemplateProductEventType, number>
  conversion: {
    previewToInstall: number | null
    installToFirstRun: number | null
    firstRunToRepeatUse: number | null
  }
}

interface TemplateFunnelSummary {
  orgId: string
  projectId: string | null
  since: string
  generatedAt: string
  totals: Record<TemplateProductEventType, number>
  topTemplates: TemplateFunnelTemplate[]
  dropOff: Array<{
    from: TemplateProductEventType
    to: TemplateProductEventType
    fromCount: number
    toCount: number
    dropOffRate: number | null
  }>
}

export function TemplateAnalyticsDashboard({
  orgId,
  workspaceSlug,
}: {
  orgId: string
  workspaceSlug: string
}) {
  const [summary, setSummary] = useState<TemplateFunnelSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadSummary() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/templates/analytics?org_id=${encodeURIComponent(orgId)}&days=30&limit=10`, {
          credentials: 'same-origin',
        })
        const data = await response.json().catch(() => ({ error: 'Failed to load template analytics' }))
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load template analytics')
        if (!cancelled) setSummary(data.summary as TemplateFunnelSummary)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load template analytics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadSummary()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const funnel = useMemo(() => {
    if (!summary) return []
    return [
      {
        label: 'Preview',
        value: summary.totals.preview,
        icon: Sparkles,
        description: 'People opened a template preview.',
      },
      {
        label: 'Install',
        value: summary.totals.install,
        icon: Rocket,
        description: 'Template became a managed capability.',
      },
      {
        label: 'First run',
        value: summary.totals.first_run,
        icon: BarChart3,
        description: 'User started the first useful workflow.',
      },
      {
        label: 'Repeat use',
        value: summary.totals.repeat_use,
        icon: Repeat2,
        description: 'User came back for recurring value.',
      },
    ]
  }, [summary])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading template conversion...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Template conversion unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!summary) return null

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-br from-background via-muted/30 to-muted/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Badge variant="secondary">Last 30 days</Badge>
              <CardTitle className="mt-3 text-2xl">Template conversion cockpit</CardTitle>
              <CardDescription>
                Preview {'->'} install {'->'} first run {'->'} repeat use. This is the product loop that tells us whether templates are becoming real utilities.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${workspaceSlug}/templates`}>Open templates</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          {funnel.map(({ label, value, icon: Icon, description }) => (
            <div key={label} className="rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between">
                <Icon className="size-4 text-muted-foreground" />
                <Badge variant="outline">{value}</Badge>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-semibold text-foreground">{value}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Top templates</CardTitle>
            <CardDescription>Ranked by installs, first runs, repeat use, and preview activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.topTemplates.length === 0 ? (
              <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                No template events yet. Preview and install Whale Watchtower to seed the funnel.
              </p>
            ) : summary.topTemplates.map((template, index) => (
              <div key={template.templateSlug} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <p className="font-medium text-foreground">{template.templateName ?? template.templateSlug}</p>
                      <Badge variant="secondary">{template.templateType}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{template.templateSlug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{template.events.preview} previews</Badge>
                    <Badge variant="outline">{template.events.install} installs</Badge>
                    <Badge variant="outline">{template.events.first_run} first runs</Badge>
                    <Badge variant="outline">{template.events.repeat_use} repeats</Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <ConversionPill label="Preview -> install" value={template.conversion.previewToInstall} />
                  <ConversionPill label="Install -> first run" value={template.conversion.installToFirstRun} />
                  <ConversionPill label="First -> repeat" value={template.conversion.firstRunToRepeatUse} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drop-off</CardTitle>
            <CardDescription>Where first users lose momentum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.dropOff.map((item) => (
              <div key={`${item.from}-${item.to}`} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{labelEvent(item.from)} {'->'} {labelEvent(item.to)}</p>
                    <p className="text-xs text-muted-foreground">{item.fromCount} started, {item.toCount} continued</p>
                  </div>
                  <Badge variant={item.dropOffRate !== null && item.dropOffRate > 0.5 ? 'destructive' : 'outline'}>
                    {formatPercent(item.dropOffRate)} drop
                  </Badge>
                </div>
                <Progress className="mt-3" value={item.dropOffRate === null ? 0 : Math.max(0, Math.min(100, item.dropOffRate * 100))} />
              </div>
            ))}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <ArrowDownRight className="mt-0.5 size-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  If install-to-first-run drops, improve onboarding copy. If first-run-to-repeat drops, tune the template output quality or alert promise.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ConversionPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{formatPercent(value)}</p>
    </div>
  )
}

function labelEvent(eventType: TemplateProductEventType): string {
  return eventType.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${Math.round(value * 100)}%`
}
