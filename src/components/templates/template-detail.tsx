'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Bell, GitBranch, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DeployDialog } from './deploy-dialog'
import type { TemplateCatalogEntry } from '@contracts/template'
import { buildAgentOpsLaunchHref } from '@/lib/agent-ops/context-launch'
import type { TemplateLibraryItem } from '@/lib/templates/library'
import { deployableTemplateToLibraryItem } from '@/lib/templates/library'
import { getCompatibleTemplateSuggestions, getTemplateProductStory } from '@/lib/templates/product-copy'
import { trackTemplateProductEvent } from '@/lib/templates/product-analytics-client'
import { TemplateCombinationPanel } from './template-combination-panel'

interface TemplateDetailProps {
  template: TemplateCatalogEntry
  backHref: string
  backLabel: string
  orgId?: string
  workspaceSlug?: string
  projectId?: string
  allowDeploy?: boolean
  relatedItems?: TemplateLibraryItem[]
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function sourceLabel(source: TemplateCatalogEntry['source']): string {
  if (source === 'platform') return 'Platform'
  if (source === 'community') return 'Community'
  return 'Workspace'
}

function getOutcomeNumber(template: TemplateCatalogEntry, key: string): number | null {
  const value = template.outcome_data?.[key]
  return typeof value === 'number' ? value : null
}

export function TemplateDetail({
  template,
  backHref,
  backLabel,
  orgId,
  workspaceSlug,
  projectId,
  allowDeploy = false,
  relatedItems = [],
}: TemplateDetailProps) {
  const [deployOpen, setDeployOpen] = useState(false)
  const successRate = getOutcomeNumber(template, 'success_rate')
  const item = useMemo(
    () => relatedItems.find((candidate) => candidate.slug === template.slug) ?? deployableTemplateToLibraryItem(template),
    [relatedItems, template],
  )
  const story = useMemo(() => getTemplateProductStory(template), [template])
  const combinations = useMemo(() => getCompatibleTemplateSuggestions(item, relatedItems, 3), [item, relatedItems])

  useEffect(() => {
    if (!orgId) return
    void trackTemplateProductEvent({
      orgId,
      projectId,
      item,
      eventType: 'detail_view',
      source: 'template_detail',
      metadata: { related_count: combinations.length },
    })
  }, [combinations.length, item, orgId, projectId])

  useEffect(() => {
    if (!orgId || combinations.length === 0) return
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

  const topMetrics = useMemo(() => {
    const metrics: Array<{ label: string; value: string }> = [
      { label: 'Kind', value: titleCase(template.kind) },
      { label: 'Source', value: sourceLabel(template.source) },
      { label: 'Version', value: `v${template.version ?? '1.0.0'}` },
      { label: 'Deploys', value: String(template.install_count ?? 0) },
    ]

    if (template.cert_status && template.cert_status !== 'uncertified') {
      metrics.push({ label: 'Certification', value: titleCase(template.cert_status) })
    }
    if (typeof template.cert_score === 'number') {
      metrics.push({ label: 'Cert score', value: template.cert_score.toFixed(2) })
    }
    if (successRate != null) {
      metrics.push({ label: 'Success rate', value: `${Math.round(successRate * 100)}%` })
    }

    return metrics
  }, [successRate, template])

  const agentSpec = template.spec.kind === 'agent' ? template.spec : null
  const teamSpec = template.spec.kind === 'team' ? template.spec : null
  const deployReviewHref = workspaceSlug && projectId
    ? buildAgentOpsLaunchHref({
        workspaceSlug,
        workflowId: 'ship',
        source: 'deploy',
        projectId,
        scopeType: 'deploy',
        scopeRef: template.slug,
        scopeLabel: template.name,
        inputDefaults: {
          target: template.name,
        },
      })
    : null
  const deployCanaryHref = workspaceSlug && projectId
    ? buildAgentOpsLaunchHref({
        workspaceSlug,
        workflowId: 'canary',
        source: 'deploy',
        projectId,
        scopeType: 'deploy',
        scopeRef: template.slug,
        scopeLabel: template.name,
        inputDefaults: {
          deployUrl: template.name,
        },
      })
    : null

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

          {allowDeploy && orgId && workspaceSlug ? (
            <Button size="sm" onClick={() => setDeployOpen(true)}>
              Deploy template
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Sign in to deploy</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{sourceLabel(template.source)}</Badge>
            <Badge variant={template.kind === 'agent' ? 'secondary' : 'outline'}>
              {titleCase(template.kind)}
            </Badge>
            <Badge variant="secondary">{template.category}</Badge>
            <Badge variant="secondary">v{template.version ?? '1.0.0'}</Badge>
            {template.cert_status && template.cert_status !== 'uncertified' ? (
              <Badge variant="secondary">
                <ShieldCheck data-icon="inline-start" />
                {titleCase(template.cert_status)}
              </Badge>
            ) : null}
            {template.forked_from_id ? (
              <Badge variant="outline">
                <GitBranch data-icon="inline-start" />
                Fork
              </Badge>
            ) : null}
            {template.outcome_data && Object.keys(template.outcome_data).length > 0 ? (
              <Badge variant="outline">
                <Sparkles data-icon="inline-start" />
                Live data
              </Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{template.name}</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {template.description || 'No description provided.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex flex-col gap-6">
          {(deployReviewHref || deployCanaryHref) ? (
            <Card>
              <CardHeader>
                <CardTitle>Agent Ops for deploys</CardTitle>
                <CardDescription>
                  Prepare or canary this template deployment with durable evidence and rollback notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {deployReviewHref ? (
                  <Link href={deployReviewHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                    <p className="text-sm font-medium text-foreground">Ship deployment safely</p>
                    <p className="mt-1 text-xs text-muted-foreground">Collect release checks, risk, approvals, and handoff context.</p>
                  </Link>
                ) : null}
                {deployCanaryHref ? (
                  <Link href={deployCanaryHref} className="rounded-lg border p-3 transition-colors hover:border-primary/40">
                    <p className="text-sm font-medium text-foreground">Canary deployment</p>
                    <p className="mt-1 text-xs text-muted-foreground">Watch early behavior and evidence after the template goes live.</p>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{story.eyebrow}</Badge>
                <Badge variant="outline">Time to value: {story.timeToValue}</Badge>
              </div>
              <CardTitle>{story.promise}</CardTitle>
              <CardDescription>{story.bestFor}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First action</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.firstAction}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expected output</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.expectedOutput}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proof</p>
                <p className="mt-2 text-sm leading-5 text-foreground">{story.proof[0] ?? 'Mission Control evidence'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What deploys</CardTitle>
              <CardDescription>
                The concrete runtime shape this template provisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentSpec ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">System prompt</p>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                        {agentSpec.system_prompt}
                      </pre>
                    </div>
                  </div>

                  {agentSpec.soul_content ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Soul</p>
                      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                        {agentSpec.soul_content}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {teamSpec ? (
                <div className="space-y-4">
                  {teamSpec.objective ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">Objective</p>
                      <p className="mt-2 text-sm text-muted-foreground">{teamSpec.objective}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    {teamSpec.members.map((member) => (
                      <div key={member.role} className="rounded-lg border bg-muted/20 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{member.role}</p>
                          {member.is_coordinator ? (
                            <Badge variant="secondary">Coordinator</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                          {member.system_prompt}
                        </p>
                      </div>
                    ))}
                  </div>

                  {teamSpec.edges.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Coordination graph</p>
                      <div className="flex flex-wrap gap-2">
                        {teamSpec.edges.map((edge, index) => (
                          <Badge key={`${edge.from}-${edge.to}-${index}`} variant="outline">
                            {edge.from} → {edge.to}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {template.params.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Parameters</CardTitle>
                <CardDescription>
                  Values the deployer fills in at deploy time.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {template.params.map((param) => (
                  <div key={param.key} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{param.label}</p>
                      {param.required ? <Badge variant="secondary">Required</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {param.key} · {param.type}
                    </p>
                    {param.hint ? (
                      <p className="mt-2 text-sm text-muted-foreground">{param.hint}</p>
                    ) : null}
                    {param.default ? (
                      <p className="mt-2 text-xs text-muted-foreground">Default: {param.default}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(agentSpec?.memory_schema?.length || agentSpec?.default_schedules?.length || template.spec.channel_hints?.length || template.spec.eval_pack?.length) ? (
            <Card>
              <CardHeader>
                <CardTitle>Living template data</CardTitle>
                <CardDescription>
                  Operational hints shipped with the template beyond the base prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {agentSpec?.memory_schema?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Memory schema</p>
                    <div className="flex flex-wrap gap-2">
                      {agentSpec.memory_schema.map((hint, index) => (
                        <Badge key={`${hint.category}-${index}`} variant="outline">
                          {hint.category}: {hint.description}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {agentSpec?.default_schedules?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Default schedules</p>
                    <div className="space-y-2">
                      {agentSpec.default_schedules.map((schedule, index) => (
                        <div key={`${schedule.cron}-${index}`} className="rounded-lg border p-3">
                          <p className="text-sm font-medium text-foreground">{schedule.description}</p>
                          <p className="text-xs text-muted-foreground">{schedule.cron}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{schedule.prompt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {template.spec.channel_hints?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Channel hints</p>
                    <div className="space-y-2">
                      {template.spec.channel_hints.map((hint, index) => (
                        <div key={`${hint.channel_type}-${index}`} className="rounded-lg border p-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{hint.channel_type}</span>
                          {hint.required ? ' · required' : ' · optional'}
                          <p className="mt-1">{hint.setup_note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {template.spec.eval_pack?.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Eval pack</p>
                    <div className="space-y-2">
                      {template.spec.eval_pack.map((scenario, index) => (
                        <div key={`${scenario.name}-${index}`} className="rounded-lg border p-3">
                          <p className="font-medium text-foreground">{scenario.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{scenario.prompt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Example prompts and alerts</CardTitle>
              <CardDescription>
                Test the template with realistic work before you roll it into a recurring workflow.
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
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topMetrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{metric.label}</span>
                  <span className="font-medium text-foreground">{metric.value}</span>
                </div>
              ))}

              {template.changelog ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Changelog</p>
                    <p className="text-sm text-muted-foreground">{template.changelog}</p>
                  </div>
                </>
              ) : null}

              {template.preview_prompt ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Preview prompt</p>
                    <p className="text-sm text-muted-foreground">{template.preview_prompt}</p>
                  </div>
                </>
              ) : null}

              {orgId ? (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void trackTemplateProductEvent({
                          orgId,
                          projectId,
                          item,
                          eventType: 'first_run',
                          source: 'template_detail',
                          metadata: { prompt: story.examplePrompts[0], surface: 'summary' },
                        })
                      }}
                    >
                      <Play data-icon="inline-start" />
                      First run
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void trackTemplateProductEvent({
                          orgId,
                          projectId,
                          item,
                          eventType: 'repeat_use',
                          source: 'template_detail',
                          metadata: { prompt: story.examplePrompts[1] ?? story.examplePrompts[0], surface: 'summary' },
                        })
                      }}
                    >
                      <RotateCcw data-icon="inline-start" />
                      Repeat
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {orgId ? (
            <TemplateCombinationPanel
              suggestions={combinations}
              basePath={workspaceSlug ? `/${workspaceSlug}/templates` : undefined}
              onSuggestionClick={(suggestion) => {
                void trackTemplateProductEvent({
                  orgId,
                  projectId,
                  templateSlug: suggestion.slug,
                  templateName: suggestion.name,
                  templateType: suggestion.type,
                  backingKind: 'lucid_pack',
                  eventType: 'combine_click',
                  source: 'template_detail',
                  metadata: { source_template_slug: template.slug },
                })
              }}
            />
          ) : null}

          {template.tags.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {template.outcome_data && Object.keys(template.outcome_data).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Outcome data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(template.outcome_data).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="max-w-[60%] break-words text-right text-foreground">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {allowDeploy && orgId && workspaceSlug ? (
        <DeployDialog
          template={template}
          orgId={orgId}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open={deployOpen}
          onOpenChange={setDeployOpen}
        />
      ) : null}
    </div>
  )
}
