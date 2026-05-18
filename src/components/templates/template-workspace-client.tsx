'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clipboard, ExternalLink, FileJson, Loader2, PackagePlus, Play, RotateCcw, ShieldCheck, Store, Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { TemplateGallery } from './template-gallery'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import type { TemplateCatalogEntry } from '@contracts/template'
import type {
  LucidPack,
  LucidPackInstall,
  LucidPackManagedResource,
  LucidPackMarketplaceSubmission,
} from '@contracts/lucid-pack'
import type { CapabilityTemplateInstallPreview } from '@/lib/templates/composition'
import { buildTemplateLibraryItems, type TemplateLibraryItem } from '@/lib/templates/library'
import { getTemplateProductStory } from '@/lib/templates/product-copy'
import { trackTemplateProductEvent } from '@/lib/templates/product-analytics-client'

interface InstalledCapabilityTemplate {
  install: LucidPackInstall
  pack: LucidPack
  resources: LucidPackManagedResource[]
}

interface TemplateWorkspaceClientProps {
  catalogTemplates: TemplateCatalogEntry[]
  capabilityTemplates?: LucidPack[]
  installedCapabilities?: InstalledCapabilityTemplate[]
  marketplaceSubmissions?: LucidPackMarketplaceSubmission[]
  orgId: string
  workspaceSlug: string
  projectId?: string
  projectSlug?: string
}

function hasPack(item: TemplateLibraryItem): item is TemplateLibraryItem & { pack: LucidPack } {
  return Boolean(item.pack)
}

const TEMPLATE_AUTHORING_VALIDATE_COMMAND = 'npm run templates:validate -- docs/platform/templates/examples/prospect-intelligence-pack.json'

const TEMPLATE_AUTHORING_EXAMPLE_PACK = JSON.stringify({
  schemaVersion: '2026-05-07.lucid-pack.v1',
  key: 'workspace-prospect-brief',
  name: 'Workspace Prospect Brief',
  description: 'Research target accounts, score buying signals, and prepare a human-reviewed sales brief.',
  version: '1.0.0',
  resources: [{
    key: 'agent:workspace-prospect-brief',
    kind: 'agent',
    name: 'Workspace Prospect Brief',
    policy: 'fork_on_edit',
    spec: {
      template_spec: {
        kind: 'agent',
        system_prompt: 'Research target accounts from the supplied ICP, cite source evidence, score each account, and return a human-reviewed brief. Do not email, update CRM, or mutate external systems without explicit approval.',
        model_hint: 'strong',
        plugins: ['brave-search'],
        memory_enabled: true,
        memory_strategy: 'conservative',
        approval_required_tools: ['crm.create_person', 'email.send'],
      },
      params: [{
        key: 'ICP_DESCRIPTION',
        label: 'Ideal customer profile',
        type: 'text',
        required: true,
        placeholder: 'B2B SaaS companies with 50-500 employees',
      }],
      preview_prompt: 'Find five prospects for this ICP and explain the evidence.',
      deploy_contract: 'pack_deploy_compatible',
    },
  }],
  composition: {
    provides: [{
      key: 'template.workspace-prospect-brief',
      kind: 'agent',
      name: 'Workspace Prospect Brief',
      description: 'Researches target accounts with evidence.',
      scope: 'project',
      risk: 'read_only',
      progress: {
        label: 'Creating prospect brief agent',
        phase: 'tool_running',
      },
    }],
    requires: [],
    optional: [],
    conflicts: [],
    upgradesFrom: [],
    tags: ['sales', 'prospecting', 'marketplace-example'],
  },
  metadata: {
    product_surface: 'template',
    template_type: 'agent',
    template_family: 'sales',
    backing_lifecycle: 'lucid_pack',
    source: 'community',
    status: 'approved',
    is_public: true,
    tags: ['sales', 'prospecting', 'marketplace-example'],
    preview_prompt: 'Find five prospects for this ICP and explain the evidence.',
    install_count: 0,
    cert_status: 'community',
    outcome_data: {},
    conversion_version: '2026-05-13.template-pack.v1',
  },
}, null, 2)

export function TemplateWorkspaceClient({
  catalogTemplates,
  capabilityTemplates = [],
  installedCapabilities = [],
  marketplaceSubmissions = [],
  orgId,
  workspaceSlug,
  projectId,
  projectSlug,
}: TemplateWorkspaceClientProps) {
  const router = useRouter()
  const [previewState, setPreviewState] = useState<{
    pack: LucidPack
    preview: CapabilityTemplateInstallPreview | null
  } | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [installingPackId, setInstallingPackId] = useState<string | null>(null)
  const [reconcilingInstallId, setReconcilingInstallId] = useState<string | null>(null)
  const [installedCapabilityState, setInstalledCapabilityState] = useState(installedCapabilities)
  const [marketplaceSubmissionState, setMarketplaceSubmissionState] = useState(marketplaceSubmissions)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importManifestText, setImportManifestText] = useState(TEMPLATE_AUTHORING_EXAMPLE_PACK)
  const [importingPack, setImportingPack] = useState(false)
  const [submittingPackId, setSubmittingPackId] = useState<string | null>(null)

  const libraryItems = useMemo(() => buildTemplateLibraryItems({
    templates: catalogTemplates,
    capabilityPacks: capabilityTemplates,
  }), [capabilityTemplates, catalogTemplates])
  const libraryItemByPackId = useMemo(() => new Map(
    libraryItems
      .filter(hasPack)
      .map((item) => [item.pack.id, item]),
  ), [libraryItems])
  const capabilityPackById = useMemo(
    () => new Map(capabilityTemplates.map((pack) => [pack.id, pack])),
    [capabilityTemplates],
  )

  useEffect(() => {
    setInstalledCapabilityState(installedCapabilities)
  }, [installedCapabilities])

  useEffect(() => {
    setMarketplaceSubmissionState(marketplaceSubmissions)
  }, [marketplaceSubmissions])

  useEffect(() => {
    const firstUtility = libraryItems[0]
    if (!firstUtility) return
    void trackTemplateProductEvent({
      orgId,
      projectId,
      item: firstUtility,
      eventType: 'gallery_view',
      source: 'templates',
      metadata: {
        total_items: libraryItems.length,
        capability_count: libraryItems.filter((item) => item.type === 'capability').length,
      },
    })
  }, [libraryItems, orgId, projectId])

  useEffect(() => {
    let cancelled = false

    async function hydrateInstalledCapabilities(): Promise<void> {
      const search = new URLSearchParams({
        org_id: orgId,
        include_resources: 'true',
        limit: '100',
      })
      if (projectId) search.set('project_id', projectId)

      const response = await fetch(`/api/agent-ops/packs/install?${search.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok) return

      const data = await response.json().catch(() => null) as {
        installs?: LucidPackInstall[]
        resources?: LucidPackManagedResource[]
      } | null
      if (!data || cancelled) return

      const resources = Array.isArray(data.resources) ? data.resources : []
      const hydrated = (Array.isArray(data.installs) ? data.installs : [])
        .map((install) => {
          const pack = capabilityPackById.get(install.packId)
          if (!pack || pack.manifest.metadata?.template_type !== 'capability') return null
          return {
            install,
            pack,
            resources: resources.filter((resource) => resource.installId === install.id),
          }
        })
        .filter((item): item is InstalledCapabilityTemplate => item !== null)

      setInstalledCapabilityState(hydrated)
    }

    void hydrateInstalledCapabilities().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [capabilityPackById, orgId, projectId])

  async function ensureCSRFToken(): Promise<string | null> {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken
  }

  async function previewCapabilityTemplate(pack: LucidPack): Promise<void> {
    const item = libraryItemByPackId.get(pack.id)
    setPreviewLoadingId(pack.id)
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to preview template')
      }
      setPreviewState({ pack, preview: data.preview as CapabilityTemplateInstallPreview })
      if (item) {
        void trackTemplateProductEvent({
          orgId,
          projectId,
          item,
          eventType: 'preview',
          source: 'templates',
          metadata: { status: data.preview?.status },
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to preview capability template')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  async function installCapabilityTemplate(pack: LucidPack): Promise<void> {
    const item = libraryItemByPackId.get(pack.id)
    setInstallingPackId(pack.id)
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
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to install template')
      }
      toast.success('Capability template installed', `${pack.name} is now managed for this ${projectId ? 'project' : 'workspace'}.`)
      if (item) {
        void trackTemplateProductEvent({
          orgId,
          projectId,
          item,
          eventType: 'install',
          source: 'templates',
          installId: data.install?.id ?? null,
          metadata: {
            resources: Array.isArray(data.resources) ? data.resources.length : null,
            provisioning_summary: data.provisioning?.summary ?? null,
          },
        })
      }
      setPreviewState(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install capability template')
    } finally {
      setInstallingPackId(null)
    }
  }

  async function reconcileCapabilityInstall(install: LucidPackInstall): Promise<void> {
    const installed = installedCapabilityState.find((item) => item.install.id === install.id)
    const libraryItem = installed ? libraryItemByPackId.get(installed.pack.id) : null
    setReconcilingInstallId(install.id)
    try {
      const csrfToken = await ensureCSRFToken()
      const response = await fetch(`/api/agent-ops/packs/install/${install.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          action: 'reconcile',
        }),
      })
      const data = await response.json().catch(() => ({ error: 'Failed to reconcile template' }))
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to reconcile template')
      }
      toast.success('Capability reconciled', 'Provisioning was re-run for this template.')
      if (installed) {
        void trackTemplateProductEvent({
          orgId,
          projectId,
          ...(libraryItem
            ? { item: libraryItem }
            : {
                templateId: installed.pack.id,
                templateSlug: installed.pack.packKey,
                templateName: installed.pack.name,
                templateType: 'capability' as const,
                backingKind: 'lucid_pack' as const,
              }),
          eventType: 'reconcile',
          source: 'installed_capability',
          installId: install.id,
          metadata: {
            summary: data.summary ?? null,
            resources: Array.isArray(data.resources) ? data.resources.length : null,
          },
        })
      }
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reconcile capability template')
    } finally {
      setReconcilingInstallId(null)
    }
  }

  async function importWorkspacePack(): Promise<void> {
    setImportingPack(true)
    try {
      const manifest = JSON.parse(importManifestText) as unknown
      const csrfToken = await ensureCSRFToken()
      const response = await fetch('/api/agent-ops/packs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          manifest,
          status: 'active',
        }),
      })
      const data = await response.json().catch(() => ({ error: 'Failed to import template Pack' }))
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to import template Pack')
      }
      toast.success('Template Pack imported', 'It is now available in this workspace library.')
      setImportDialogOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Template Pack import failed')
    } finally {
      setImportingPack(false)
    }
  }

  async function submitPackForMarketplaceReview(pack: LucidPack): Promise<void> {
    setSubmittingPackId(pack.id)
    try {
      const csrfToken = await ensureCSRFToken()
      const response = await fetch('/api/templates/marketplace-submissions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          pack_id: pack.id,
          quality_report: buildPackQualityReport(pack),
          review_notes: 'Submitted from the template creator marketplace.',
        }),
      })
      const data = await response.json().catch(() => ({ error: 'Failed to submit template for review' }))
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to submit template for review')
      }
      setMarketplaceSubmissionState((current) => {
        const next = current.filter((submission) => submission.packId !== data.submission.packId)
        return [data.submission as LucidPackMarketplaceSubmission, ...next]
      })
      toast.success('Submitted for marketplace review', `${pack.name} is in the Lucid review queue.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit template for review')
    } finally {
      setSubmittingPackId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <TemplateGallery
        initialTemplates={catalogTemplates}
        libraryItems={libraryItems}
        capabilityTemplates={capabilityTemplates}
        onPreviewCapabilityTemplate={(pack) => { void previewCapabilityTemplate(pack) }}
        previewLoadingCapabilityId={previewLoadingId}
        detailBasePath={
          projectSlug
            ? `/${workspaceSlug}/projects/${projectSlug}/templates`
            : `/${workspaceSlug}/templates`
        }
        orgId={orgId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        allowDeploy
        leadingCards={(
          <TemplateAuthoringCard
            workspacePacks={capabilityTemplates.filter((pack) => pack.orgId === orgId)}
            submissions={marketplaceSubmissionState}
            submittingPackId={submittingPackId}
            onImport={() => setImportDialogOpen(true)}
            onSubmitPack={(pack) => { void submitPackForMarketplaceReview(pack) }}
            onCopyValidateCommand={() => {
              void copyTextToClipboard(TEMPLATE_AUTHORING_VALIDATE_COMMAND).then((copied) => {
                toast.success(copied ? 'Validation command copied' : 'Validation command ready', copied ? undefined : TEMPLATE_AUTHORING_VALIDATE_COMMAND)
              })
            }}
          />
        )}
        onTemplateEvent={(eventType, item, metadata) => {
          void trackTemplateProductEvent({
            orgId,
            projectId,
            item,
            eventType,
            source: eventType === 'detail_view' ? 'templates' : 'templates',
            metadata,
          })
        }}
      />

      {installedCapabilityState.length > 0 ? (
        <div className="px-6">
          <InstalledCapabilitiesSection
            installedCapabilities={installedCapabilityState}
            reconcilingInstallId={reconcilingInstallId}
            workspaceSlug={workspaceSlug}
            onReconcile={(install) => { void reconcileCapabilityInstall(install) }}
            onTrack={(eventType, installed, metadata) => {
              const item = libraryItemByPackId.get(installed.pack.id)
              void trackTemplateProductEvent({
                orgId,
                projectId,
                ...(item
                  ? { item }
                  : {
                      templateId: installed.pack.id,
                      templateSlug: installed.pack.packKey,
                      templateName: installed.pack.name,
                      templateType: 'capability' as const,
                      backingKind: 'lucid_pack' as const,
                    }),
                eventType,
                source: 'installed_capability',
                installId: installed.install.id,
                metadata,
              })
            }}
          />
        </div>
      ) : null}

      <Dialog open={!!previewState} onOpenChange={(open) => { if (!open) setPreviewState(null) }}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewState?.pack.name ?? 'Capability template'} preview</DialogTitle>
            <DialogDescription>
              Review what Lucid will create, reuse, update, or block before installing this capability template.
            </DialogDescription>
          </DialogHeader>

          {previewState?.preview ? (
            <div className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['Creates', previewState.preview.summary.creates],
                  ['Reuses', previewState.preview.summary.reuses],
                  ['Needs setup', previewState.preview.summary.requiredSetup],
                  ['Approvals', previewState.preview.summary.approvals],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Status: {previewState.preview.status.replace('_', ' ')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <PreviewList title="Will create" items={previewState.preview.creates.map((item) => `${item.name} (${item.resourceKind})`)} empty="No new resources." />
                  <PreviewList title="Will reuse" items={previewState.preview.reuses.map((item) => `${item.name} (${item.resourceKind})`)} empty="No matching installed resources yet." />
                  <PreviewList title="Needs setup" items={previewState.preview.requiredSetup.map((item) => `${item.capability}: ${item.reason}`)} empty="No missing setup." />
                  <PreviewList title="Warnings" items={[...previewState.preview.warnings, ...previewState.preview.conflicts.map((item) => item.reason)]} empty="No warnings." />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewState(null)}>
              Close
            </Button>
            {previewState?.pack ? (
              <Button
                onClick={() => { void installCapabilityTemplate(previewState.pack) }}
                disabled={installingPackId === previewState.pack.id || previewState.preview?.status === 'blocked'}
              >
                {installingPackId === previewState.pack.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {previewState.preview?.status === 'needs_setup' ? 'Install with setup needed' : 'Install template'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportTemplatePackDialog
        open={importDialogOpen}
        manifestText={importManifestText}
        importing={importingPack}
        onOpenChange={setImportDialogOpen}
        onManifestTextChange={setImportManifestText}
        onImport={() => { void importWorkspacePack() }}
      />
    </div>
  )
}

function TemplateAuthoringCard({
  workspacePacks,
  submissions,
  submittingPackId,
  onImport,
  onSubmitPack,
  onCopyValidateCommand,
}: {
  workspacePacks: LucidPack[]
  submissions: LucidPackMarketplaceSubmission[]
  submittingPackId: string | null
  onImport: () => void
  onSubmitPack: (pack: LucidPack) => void
  onCopyValidateCommand: () => void
}) {
  const submissionByPackId = new Map(submissions.map((submission) => [submission.packId, submission]))
  return (
    <Card className="overflow-hidden border-dashed bg-gradient-to-br from-background via-muted/20 to-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary">
            <Store className="mr-1 size-3.5" />
            Creator marketplace
          </Badge>
          <PackagePlus className="size-5 text-muted-foreground" />
        </div>
        <CardTitle>Import or publish a Pack template</CardTitle>
        <CardDescription>
          Validate a Lucid Pack JSON, import it into this workspace, then preview, install, health-check, and reconcile it like first-party templates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm text-muted-foreground">
          {[
            'One manifest schema for agents, teams, capabilities, routines, knowledge, browser procedures, and channel commands.',
            'Safety scanner blocks embedded secrets before a Pack can be imported.',
            'Workspace Packs stay private until you intentionally submit them for marketplace review.',
          ].map((item) => (
            <p key={item} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onImport}>
            <Upload data-icon="inline-start" />
            Import Pack JSON
          </Button>
          <Button size="sm" variant="outline" onClick={onCopyValidateCommand}>
            <FileJson data-icon="inline-start" />
            Copy validation CLI
          </Button>
        </div>
        {workspacePacks.length > 0 ? (
          <div className="rounded-xl border bg-background/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Workspace Packs ready for review</p>
                <p className="text-xs text-muted-foreground">
                  Submit private Packs when they have validation, smoke, and quality evidence.
                </p>
              </div>
              <Badge variant="outline">{workspacePacks.length} private</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {workspacePacks.slice(0, 4).map((pack) => {
                const submission = submissionByPackId.get(pack.id)
                const disabled = submittingPackId === pack.id || submission?.status === 'submitted' || submission?.status === 'approved'
                return (
                  <div key={pack.id} className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{pack.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{pack.packKey} · v{pack.version}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {submission ? (
                        <Badge variant={submission.status === 'approved' ? 'secondary' : submission.status === 'needs_changes' ? 'destructive' : 'outline'}>
                          {submission.status.replace(/_/g, ' ')}
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant={submission ? 'outline' : 'default'}
                        onClick={() => onSubmitPack(pack)}
                        disabled={disabled}
                      >
                        {submittingPackId === pack.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                        {submission ? 'Resubmit' : 'Submit for review'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function buildPackQualityReport(pack: LucidPack): Record<string, unknown> {
  const resources = pack.manifest.resources
  const metadata = pack.manifest.metadata ?? {}
  return {
    generated_at: new Date().toISOString(),
    validation_command: TEMPLATE_AUTHORING_VALIDATE_COMMAND,
    pack_key: pack.packKey,
    version: pack.version,
    resource_count: resources.length,
    resource_kinds: Array.from(new Set(resources.map((resource) => resource.kind))).sort(),
    has_composition: Boolean(pack.manifest.composition),
    has_preview_prompt: typeof metadata.preview_prompt === 'string' && metadata.preview_prompt.trim().length > 0,
    declared_source: metadata.source ?? 'org',
    safety: {
      embedded_secrets: 'blocked_by_import_api',
      requires_review: true,
    },
  }
}

function ImportTemplatePackDialog({
  open,
  manifestText,
  importing,
  onOpenChange,
  onManifestTextChange,
  onImport,
}: {
  open: boolean
  manifestText: string
  importing: boolean
  onOpenChange: (open: boolean) => void
  onManifestTextChange: (value: string) => void
  onImport: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import a Lucid Pack template</DialogTitle>
          <DialogDescription>
            Paste a validated Pack manifest. Lucid will run schema validation, secret scanning, and role checks before it enters the workspace library.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Recommended authoring loop</p>
            <p className="mt-1">
              Write the manifest locally, run <code className="rounded bg-background px-1 py-0.5">{TEMPLATE_AUTHORING_VALIDATE_COMMAND}</code>, import here, then preview and install from the same template gallery.
            </p>
          </div>
          <Textarea
            value={manifestText}
            onChange={(event) => onManifestTextChange(event.target.value)}
            spellCheck={false}
            className="min-h-[420px] font-mono text-xs"
            aria-label="Lucid Pack manifest JSON"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={onImport} disabled={importing || !manifestText.trim()}>
            {importing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Import Pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InstalledCapabilitiesSection({
  installedCapabilities,
  reconcilingInstallId,
  workspaceSlug,
  onReconcile,
  onTrack,
}: {
  installedCapabilities: InstalledCapabilityTemplate[]
  reconcilingInstallId: string | null
  workspaceSlug: string
  onReconcile: (install: LucidPackInstall) => void
  onTrack: (
    eventType: 'first_run' | 'repeat_use' | 'reconcile',
    installed: InstalledCapabilityTemplate,
    metadata?: Record<string, unknown>,
  ) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Installed Capabilities</CardTitle>
        <CardDescription>
          What your capability templates own, what is provisioned, and what still needs setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {installedCapabilities.map(({ install, pack, resources }) => {
          const installed = { install, pack, resources }
          const counts = summarizeProvisioning(resources)
          const story = getTemplateProductStory(pack)
          return (
            <div key={install.id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{pack.name}</p>
                    <Badge variant={install.status === 'active' ? 'secondary' : 'outline'}>{install.status}</Badge>
                    <Badge variant="outline">{resources.length} resources</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{pack.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {counts.provisioned > 0 ? <Badge variant="secondary">{counts.provisioned} provisioned</Badge> : null}
                  {counts.registered > 0 ? <Badge variant="outline">{counts.registered} registered</Badge> : null}
                  {counts.needsSetup > 0 ? <Badge variant="destructive">{counts.needsSetup} need setup</Badge> : null}
                  {counts.failed > 0 ? <Badge variant="destructive">{counts.failed} failed</Badge> : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTrack('first_run', installed, { prompt: story.examplePrompts[0], surface: 'installed_capability' })}
                  >
                    <Play data-icon="inline-start" />
                    First run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTrack('repeat_use', installed, { prompt: story.examplePrompts[1] ?? story.examplePrompts[0], surface: 'installed_capability' })}
                  >
                    <RotateCcw data-icon="inline-start" />
                    Use again
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReconcile(install)}
                    disabled={reconcilingInstallId === install.id}
                  >
                    {reconcilingInstallId === install.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                    Reconcile
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {resources.slice(0, 6).map((resource) => {
                  const provisioning = readProvisioning(resource)
                  return (
                    <div key={resource.id} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{resource.resourceKey}</p>
                        <Badge variant="outline">{resource.resourceKind}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {provisioning.status}: {provisioning.message}
                      </p>
                    </div>
                  )
                })}
              </div>
              <TemplateActivationChecklist
                className="mt-4"
                installed={installed}
                workspaceSlug={workspaceSlug}
                onTrack={onTrack}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function TemplateActivationChecklist({
  installed,
  workspaceSlug,
  className,
  onTrack,
}: {
  installed: InstalledCapabilityTemplate
  workspaceSlug: string
  className?: string
  onTrack: (
    eventType: 'first_run' | 'repeat_use' | 'reconcile',
    installed: InstalledCapabilityTemplate,
    metadata?: Record<string, unknown>,
  ) => void
}) {
  const story = getTemplateProductStory(installed.pack)
  const commandResource = installed.resources.find((resource) => resource.resourceKind === 'channel_command')
  const command = typeof commandResource?.metadata?.command === 'string'
    ? commandResource.metadata.command
    : installed.pack.manifest.metadata?.activation_prompt
  const firstPrompt = story.examplePrompts[0]

  async function copyPrompt(): Promise<void> {
    const value = typeof command === 'string' && command.trim()
      ? `${command.trim()} ${firstPrompt}`
      : firstPrompt
    const copied = await copyTextToClipboard(value)
    onTrack('first_run', installed, {
      surface: 'installed_capability_onboarding',
      action: 'copy_first_prompt',
      prompt: firstPrompt,
    })
    toast.success(copied ? 'Starter prompt copied' : 'Starter prompt ready', copied ? undefined : value)
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border bg-gradient-to-br from-background via-muted/20 to-muted/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge variant="secondary">{story.eyebrow}</Badge>
            <h3 className="mt-2 text-base font-semibold text-foreground">Activate {installed.pack.name}</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{story.promise}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { void copyPrompt() }}>
              <Clipboard data-icon="inline-start" />
              Copy first prompt
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/${workspaceSlug}/mission-control/activity`}>
                <ExternalLink data-icon="inline-start" />
                Mission Control proof
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {story.onboardingSteps.map((step, index) => (
            <div key={step.title} className="rounded-xl border bg-background/80 p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm font-medium text-foreground">{step.title}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                {step.action}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <PreviewList title="Starter prompts" items={story.examplePrompts} empty="No starter prompts." />
          <PreviewList title="Useful alerts" items={story.alerts} empty="No alert examples." />
          <PreviewList title="Proof to expect" items={story.proof} empty="No proof checklist." />
        </div>
      </div>
    </div>
  )
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the DOM fallback below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    try {
      document.querySelector('textarea[data-template-copy-fallback]')?.remove()
    } catch {}
    return false
  }
}

function readProvisioning(resource: LucidPackManagedResource): { status: string; message: string } {
  const value = resource.metadata.provisioning
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: resource.status,
      message: resource.resourceId ? 'Provisioned resource is linked.' : 'Managed resource is installed.',
    }
  }
  const record = value as Record<string, unknown>
  return {
    status: typeof record.status === 'string' ? record.status : resource.status,
    message: typeof record.message === 'string' ? record.message : 'Managed resource is installed.',
  }
}

function summarizeProvisioning(resources: LucidPackManagedResource[]) {
  const counts = { provisioned: 0, registered: 0, needsSetup: 0, failed: 0 }
  for (const resource of resources) {
    const status = readProvisioning(resource).status
    if (status === 'provisioned') counts.provisioned += 1
    else if (status === 'registered') counts.registered += 1
    else if (status === 'needs_setup') counts.needsSetup += 1
    else if (status === 'failed') counts.failed += 1
  }
  return counts
}

function PreviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {items.slice(0, 6).map((item) => (
            <li key={item} className="rounded-md bg-muted/30 px-2 py-1">{item}</li>
          ))}
          {items.length > 6 ? (
            <li className="px-2 py-1 text-xs">+{items.length - 6} more</li>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
