'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bell, Loader2, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import type { LucidPack } from '@contracts/lucid-pack'
import type { CapabilityTemplateInstallPreview } from '@/lib/templates/composition'
import type { TemplateLibraryItem } from '@/lib/templates/library'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { capabilityPackToLibraryItem, getCapabilityTemplateCategory } from '@/lib/templates/library'
import { getCompatibleTemplateSuggestions, getTemplateProductStory } from '@/lib/templates/product-copy'
import { trackTemplateProductEvent } from '@/lib/templates/product-analytics-client'
import { TemplateCombinationPanel } from './template-combination-panel'

interface CapabilityTemplateDetailProps {
  pack: LucidPack
  backHref: string
  backLabel: string
  orgId?: string | null
  projectId?: string
  relatedItems?: TemplateLibraryItem[]
}

export function CapabilityTemplateDetail({
  pack,
  backHref,
  backLabel,
  orgId,
  projectId,
  relatedItems = [],
}: CapabilityTemplateDetailProps) {
  const [preview, setPreview] = useState<CapabilityTemplateInstallPreview | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const composition = pack.manifest.composition
  const risk = String(pack.manifest.metadata?.default_risk ?? 'read_only')
  const item = useMemo(() => capabilityPackToLibraryItem(pack), [pack])
  const story = useMemo(() => getTemplateProductStory(pack), [pack])
  const combinations = useMemo(() => getCompatibleTemplateSuggestions(pack, relatedItems, 3), [pack, relatedItems])
  const canManageTemplate = Boolean(orgId)

  useEffect(() => {
    if (!orgId) return
    void trackTemplateProductEvent({
      orgId,
      projectId,
      item,
      eventType: 'detail_view',
      source: 'template_detail',
      metadata: { risk, related_count: combinations.length },
    })
  }, [combinations.length, item, orgId, projectId, risk])

  useEffect(() => {
    if (!orgId) return
    if (combinations.length === 0) return
    void trackTemplateProductEvent({
      orgId,
      projectId,
      item,
      eventType: 'combine_view',
      source: 'template_detail',
      metadata: {
        suggestion_slugs: combinations.map((suggestion) => suggestion.slug),
      },
    })
  }, [combinations, item, orgId, projectId])

  async function ensureCSRFToken(): Promise<string | null> {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken
  }

  async function previewTemplate(): Promise<void> {
    if (!orgId) {
      toast.info('Sign in to preview this template install for your workspace.')
      return
    }

    setIsPreviewing(true)
    setPreview(null)
    setDialogOpen(true)
    try {
      const csrfToken = await ensureCSRFToken()
      const response = await fetch(`/api/templates/capabilities/${pack.id}/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId ?? null,
          config: {},
        }),
      })
      const data = await response.json().catch(() => ({ error: 'Failed to preview template' }))
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to preview template')
      setPreview(data.preview as CapabilityTemplateInstallPreview)
      void trackTemplateProductEvent({
        orgId,
        projectId,
        item,
        eventType: 'preview',
        source: 'template_detail',
        metadata: { status: data.preview?.status },
      })
    } catch (error) {
      setDialogOpen(false)
      toast.error(error instanceof Error ? error.message : 'Failed to preview template')
    } finally {
      setIsPreviewing(false)
    }
  }

  async function installTemplate(): Promise<void> {
    if (!orgId) {
      toast.info('Sign in to install this template for your workspace.')
      return
    }

    setIsInstalling(true)
    try {
      const csrfToken = await ensureCSRFToken()
      const response = await fetch(`/api/agent-ops/packs/${pack.id}/install`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId ?? null,
          config: {},
        }),
      })
      const data = await response.json().catch(() => ({ error: 'Failed to install template' }))
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to install template')
      toast.success('Template installed', `${pack.name} is now managed for this ${projectId ? 'project' : 'workspace'}.`)
      void trackTemplateProductEvent({
        orgId,
        projectId,
        item,
        eventType: 'install',
        source: 'template_detail',
        installId: data.install?.id ?? null,
        metadata: {
          resources: Array.isArray(data.resources) ? data.resources.length : null,
          provisioning_summary: data.provisioning?.summary ?? null,
        },
      })
      setDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install template')
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href={backHref}>
              <ArrowLeft data-icon="inline-start" />
              {backLabel}
            </Link>
          </Button>
          {canManageTemplate ? (
            <Button size="sm" onClick={() => { void previewTemplate() }} disabled={isPreviewing}>
              {isPreviewing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Preview install
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in to preview install</Link>
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <Sparkles data-icon="inline-start" />
              Template
            </Badge>
            <Badge variant="outline">Capability</Badge>
            <Badge variant={risk === 'high' ? 'destructive' : risk === 'medium' ? 'secondary' : 'outline'}>
              {risk.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">{getCapabilityTemplateCategory(pack)}</Badge>
            <Badge variant="secondary">v{pack.version}</Badge>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{pack.name}</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{pack.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_34%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.32))] shadow-none">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{story.eyebrow}</Badge>
                <Badge variant="outline">Time to value: {story.timeToValue}</Badge>
              </div>
              <CardTitle>{story.promise}</CardTitle>
              <CardDescription>{story.bestFor}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First action</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.firstAction}</p>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expected output</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.expectedOutput}</p>
              </div>
              <div className="rounded-xl border bg-background/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mission Control proof</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.proof[0] ?? 'Evidence-backed run detail'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this template installs</CardTitle>
              <CardDescription>
                Capability templates can compose agents, workflows, routines, policies, knowledge, browser procedures, and channel commands.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {pack.manifest.resources.map((resource) => (
                <div key={resource.key} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">{resource.name}</p>
                    <Badge variant="outline">{resource.kind}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {resource.policy} · {resource.key}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Example prompts and alerts</CardTitle>
              <CardDescription>
                Use these to validate the first run and tune the template for your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                {story.examplePrompts.map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    className="w-full rounded-lg border bg-muted/20 p-3 text-left text-sm leading-5 transition-colors hover:bg-muted/40"
                    onClick={() => {
                      void navigator.clipboard?.writeText(prompt)
                      if (orgId) {
                        void trackTemplateProductEvent({
                          orgId,
                          projectId,
                          item,
                          eventType: index === 0 ? 'first_run' : 'repeat_use',
                          source: 'template_detail',
                          metadata: { prompt, copied: true },
                        })
                      }
                      toast.success('Prompt copied')
                    }}
                  >
                    <span className="font-medium text-foreground">{index === 0 ? 'First run' : 'Try next'}: </span>
                    <span className="text-muted-foreground">{prompt}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {story.alerts.map((alert) => (
                  <div key={alert} className="flex gap-3 rounded-lg border bg-muted/20 p-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm leading-5 text-muted-foreground">{alert}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
              <CardDescription>
                The normalized capabilities this template provides, requires, or conflicts with.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <CapabilityList title="Provides" items={(composition?.provides ?? []).map((item) => `${item.name} (${item.risk})`)} />
              <CapabilityList title="Requires" items={(composition?.requires ?? []).map((item) => `${item.capability}: ${item.reason ?? 'Required setup'}`)} />
              <CapabilityList title="Optional setup" items={(composition?.optional ?? []).map((item) => `${item.capability}: ${item.reason ?? 'Optional setup'}`)} />
              <CapabilityList title="Conflicts" items={(composition?.conflicts ?? []).map((item) => `${item.capability}: ${item.reason}`)} />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Install safety</CardTitle>
              <CardDescription>
                Preview first. Lucid shows what will be created, reused, blocked, or needs setup before mutating anything.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4" />
                Governed install
              </div>
              {canManageTemplate ? (
                <Button className="w-full" onClick={() => { void previewTemplate() }} disabled={isPreviewing}>
                  {isPreviewing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Preview impact
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/login">Sign in to preview impact</Link>
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (orgId) {
                      void trackTemplateProductEvent({
                        orgId,
                        projectId,
                        item,
                        eventType: 'first_run',
                        source: 'template_detail',
                        metadata: { prompt: story.examplePrompts[0], surface: 'sidebar' },
                      })
                    }
                  }}
                >
                  <Play data-icon="inline-start" />
                  First run
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (orgId) {
                      void trackTemplateProductEvent({
                        orgId,
                        projectId,
                        item,
                        eventType: 'repeat_use',
                        source: 'template_detail',
                        metadata: { prompt: story.examplePrompts[1] ?? story.examplePrompts[0], surface: 'sidebar' },
                      })
                    }
                  }}
                >
                  <RotateCcw data-icon="inline-start" />
                  Repeat
                </Button>
              </div>
            </CardContent>
          </Card>

          <TemplateCombinationPanel
            suggestions={combinations}
            basePath={backHref}
            onSuggestionClick={(suggestion) => {
              if (!orgId) return
              void trackTemplateProductEvent({
                orgId,
                projectId,
                templateSlug: suggestion.slug,
                templateName: suggestion.name,
                templateType: suggestion.type,
                backingKind: 'lucid_pack',
                eventType: 'combine_click',
                source: 'template_detail',
                metadata: { source_template_slug: pack.packKey },
              })
            }}
          />
        </aside>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pack.name} install preview</DialogTitle>
            <DialogDescription>
              Review create/reuse/setup impact before installing this template.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['Creates', preview.summary.creates],
                  ['Reuses', preview.summary.reuses],
                  ['Needs setup', preview.summary.requiredSetup],
                  ['Approvals', preview.summary.approvals],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <PreviewList title="Will create" items={preview.creates.map((item) => `${item.name} (${item.resourceKind})`)} empty="No new resources." />
              <PreviewList title="Will reuse" items={preview.reuses.map((item) => `${item.name} (${item.resourceKind})`)} empty="No matching resources yet." />
              <PreviewList title="Needs setup" items={preview.requiredSetup.map((item) => `${item.capability}: ${item.reason}`)} empty="No missing setup." />
              <PreviewList title="Warnings" items={[...preview.warnings, ...preview.conflicts.map((item) => item.reason)]} empty="No warnings." />
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/20 p-5 text-sm text-muted-foreground">
              {isPreviewing ? 'Preparing install preview...' : 'Preview is not available yet.'}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => { void installTemplate() }}
              disabled={!preview || isInstalling || preview.status === 'blocked'}
            >
              {isInstalling ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {preview?.status === 'needs_setup' ? 'Install with setup needed' : 'Install template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CapabilityList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge key={item} variant="outline">{item}</Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None declared.</p>
      )}
    </div>
  )
}

function PreviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {items.slice(0, 8).map((item) => (
            <li key={item} className="rounded-md bg-muted/30 px-2 py-1">{item}</li>
          ))}
          {items.length > 8 ? <li className="px-2 py-1 text-xs">+{items.length - 8} more</li> : null}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
