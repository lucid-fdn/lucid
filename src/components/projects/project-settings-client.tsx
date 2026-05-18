'use client'

import React from 'react'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { AlertTriangle, Archive, CheckCircle2, RadioTower, Save, ShieldCheck, WalletCards } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  ProjectApprovalPolicy,
  ProjectCreationMode,
  ProjectMutationPolicy,
  ProjectRecord,
  ProjectResourceCounts,
  ProjectRuntimePreference,
  ProjectSettingsRecord,
} from '@/lib/db/projects'
import { buildWorkspaceProjectsIndexUrl } from '@/lib/projects/urls'
import { PlatformGuaranteesCard } from '@/components/platform/platform-guarantees-card'
import { SharedOperatingContextManager } from '@/components/operating-context/shared-operating-context-manager'

interface ProjectSettingsOverviewSummary {
  attention: {
    summary: {
      approvals: number
      readyWorkItems: number
      criticalEvents: number
    }
  }
  metrics: {
    operatorLoad: number
    activeIncidentCount: number
    crewRecoveryRate: number | null
    crewTrendSummary: string
  }
  runtimeCounts: {
    shared: number
    managed: number
    byo: number
  }
  runtimePackaging: {
    primaryTitle: string | null
    operatorLabel: string | null
    alignmentLabel: string
    guidance: string
  }
}

export function ProjectSettingsClient({
  workspaceSlug,
  project,
  counts,
  overview,
  settings,
  capabilities,
}: {
  workspaceSlug: string
  project: ProjectRecord
  counts: ProjectResourceCounts
  overview: ProjectSettingsOverviewSummary
  settings: ProjectSettingsRecord | null
  capabilities: {
    planName: string
    role: string | null
    gatewayKeysState: 'hidden' | 'discoverable' | 'setup-required' | 'active' | 'attention'
    canManageGatewayKeys: boolean
    canViewAudit: boolean
  }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isArchiving, startArchiveTransition] = useTransition()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [preferredRuntime, setPreferredRuntime] = useState<ProjectRuntimePreference>(settings?.preferred_runtime ?? 'auto')
  const [approvalPolicy, setApprovalPolicy] = useState<ProjectApprovalPolicy>(settings?.approval_policy ?? 'human_in_loop')
  const [mutationPolicy, setMutationPolicy] = useState<ProjectMutationPolicy>(settings?.mutation_policy ?? 'review')
  const [defaultCreationMode, setDefaultCreationMode] = useState<ProjectCreationMode>(settings?.default_creation_mode ?? 'template_first')
  const { attention, metrics, runtimeCounts, runtimePackaging } = overview

  const runtimePostureItems = [
    { label: 'Shared', value: runtimeCounts.shared, hint: 'Fastest activation path' },
    { label: 'Managed', value: runtimeCounts.managed, hint: 'Dedicated Lucid-managed runtime' },
    { label: 'BYO', value: runtimeCounts.byo, hint: 'External autonomous runtime' },
  ]
  const policyItems = [
    {
      label: 'Pending approvals',
      value: attention.summary.approvals,
      hint: attention.summary.approvals > 0 ? 'Operator input is currently blocking some runs.' : 'No project approvals are waiting.',
    },
    {
      label: 'Ready work',
      value: attention.summary.readyWorkItems,
      hint: attention.summary.readyWorkItems > 0 ? 'Work is queued and ready to route.' : 'No work is waiting to be picked up.',
    },
    {
      label: 'Critical events',
      value: attention.summary.criticalEvents,
      hint: attention.summary.criticalEvents > 0 ? 'Project has active incidents or degraded runs.' : 'No active critical execution signals.',
    },
  ]
  const integrationItems = [
    {
      label: 'Gateway posture',
      value: capabilities.gatewayKeysState === 'active' ? 'Configured' : capabilities.gatewayKeysState === 'discoverable' ? 'Plan-gated' : 'Not active',
      hint: capabilities.canManageGatewayKeys ? 'Admins can manage external gateway limits and keys.' : 'Gateway management is not enabled for this role or plan.',
    },
    {
      label: 'Audit visibility',
      value: capabilities.canViewAudit ? 'Enabled' : 'Unavailable',
      hint: capabilities.canViewAudit ? 'Workspace audit and gateway history are available.' : 'Audit views are not available on the current plan or role.',
    },
    {
      label: 'Workspace plan',
      value: capabilities.planName,
      hint: capabilities.role ? `Signed in as ${capabilities.role}.` : 'No project-scoped role resolved.',
    },
  ]
  const budgetItems = [
    {
      label: 'Operator load',
      value: metrics.operatorLoad,
      hint: 'Approvals, ready work, liveness incidents, and critical events combined.',
    },
    {
      label: 'Active incidents',
      value: metrics.activeIncidentCount,
      hint: 'Project-level execution signals that still need intervention.',
    },
    {
      label: 'Crew recovery',
      value: metrics.crewRecoveryRate == null ? 'n/a' : `${metrics.crewRecoveryRate}%`,
      hint: metrics.crewRecoveryRate == null ? 'Not enough resolved runs yet.' : metrics.crewTrendSummary,
    },
  ]

  const hasChanges =
    name.trim() !== project.name ||
    description !== (project.description ?? '') ||
    preferredRuntime !== (settings?.preferred_runtime ?? 'auto') ||
    approvalPolicy !== (settings?.approval_policy ?? 'human_in_loop') ||
    mutationPolicy !== (settings?.mutation_policy ?? 'review') ||
    defaultCreationMode !== (settings?.default_creation_mode ?? 'template_first')

  const saveProject = () => {
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${project.org_id}/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          settings: {
            preferredRuntime,
            approvalPolicy,
            mutationPolicy,
            defaultCreationMode,
          },
        }),
      })

      if (!res.ok) {
        toast.error('Failed to update project settings')
        return
      }

      toast.success('Project updated')
      router.refresh()
    })
  }

  const archiveProject = () => {
    startArchiveTransition(async () => {
      const res = await fetch(`/api/workspaces/${project.org_id}/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: true }),
      })

      if (!res.ok) {
        toast.error('Failed to archive project')
        return
      }

      toast.success('Project archived')
      const projectsIndexHref = buildWorkspaceProjectsIndexUrl(workspaceSlug)
      router.push(projectsIndexHref ?? '/')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Project Settings</CardTitle>
          <CardDescription>
            Keep metadata stable, but treat this surface as the project control summary: runtime posture, approvals, limits, and guarantees all live here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {project.slug}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              maxLength={500}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this project is for"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Agents</div>
              <div className="mt-1 text-2xl font-semibold">{counts.assistants}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Teams</div>
              <div className="mt-1 text-2xl font-semibold">{counts.crews}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Templates</div>
              <div className="mt-1 text-2xl font-semibold">{counts.templates}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Updated</div>
              <div className="mt-1 text-sm font-medium">{new Date(project.updated_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveProject} disabled={!hasChanges || isPending || !name.trim()}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? 'Saving...' : 'Save changes'}
            </Button>
            <Badge variant="outline" className="border-border text-muted-foreground">
              Project-native surface
            </Badge>
          </div>
        </CardContent>
      </Card>

      <SharedOperatingContextManager
        title="Project Brain"
        description="Project-level thesis, signals, feedback, policy, Daily Intel, risks, and decisions. Agents and teams inherit this context at runtime."
        workspaceId={project.org_id}
        projectId={project.id}
        scopeType="project"
        scopeId={project.id}
        endpoint={`/api/workspaces/${project.org_id}/projects/${project.id}/context`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Runtime Posture</CardTitle>
          <CardDescription>
            Read the current execution mix before you change how this project scales. Runtime posture belongs at the project level, even while detailed runtime edits stay elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <RadioTower className="h-4 w-4 text-primary" />
              {runtimePackaging.primaryTitle ?? 'No runtime-ready agents yet'}
            </div>
            {runtimePackaging.operatorLabel ? (
              <Badge variant="outline" className="border-border text-muted-foreground">
                {runtimePackaging.operatorLabel}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {runtimePackaging.alignmentLabel}. {runtimePackaging.guidance}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {runtimePostureItems.map((item) => (
              <div key={item.label} className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold">{item.value}</div>
                <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Policy</CardTitle>
            <CardDescription>
              Persist the defaults that shape how new work enters review and how operators expect to intervene.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {policyItems.map((item) => (
              <div key={item.label} className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold">{item.value}</div>
                <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget and Limits</CardTitle>
            <CardDescription>
              Project budgets are still mostly enforced at the agent/runtime layer, but operators need one project-level read on pressure and recovery.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {budgetItems.map((item) => (
              <div key={item.label} className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold">{item.value}</div>
                <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Defaults and Policies</CardTitle>
          <CardDescription>
            These values persist at the project layer and act as the default posture for new creation and operator review inside this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="preferred-runtime">Preferred runtime</Label>
            <Select value={preferredRuntime} onValueChange={(value) => setPreferredRuntime(value as ProjectRuntimePreference)}>
              <SelectTrigger id="preferred-runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-select</SelectItem>
                <SelectItem value="shared">Shared first</SelectItem>
                <SelectItem value="managed">Managed dedicated first</SelectItem>
                <SelectItem value="byo">BYO first</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used as the default runtime posture when new project assets are created without an explicit runtime override.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="approval-policy">Approval policy</Label>
            <Select value={approvalPolicy} onValueChange={(value) => setApprovalPolicy(value as ProjectApprovalPolicy)}>
              <SelectTrigger id="approval-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human_in_loop">Human in loop</SelectItem>
                <SelectItem value="auto_low_risk">Auto low-risk</SelectItem>
                <SelectItem value="strict">Strict review</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Controls the default expectation for tool approvals and operator gating across the project.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mutation-policy">Mutation policy</Label>
            <Select value={mutationPolicy} onValueChange={(value) => setMutationPolicy(value as ProjectMutationPolicy)}>
              <SelectTrigger id="mutation-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="review">Review before apply</SelectItem>
                <SelectItem value="guided">Guided apply</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Sets the default bar for AI-guided edits and native mutations when operators refine agents and teams.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="creation-mode">Creation default</Label>
            <Select value={defaultCreationMode} onValueChange={(value) => setDefaultCreationMode(value as ProjectCreationMode)}>
              <SelectTrigger id="creation-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="template_first">Template first</SelectItem>
                <SelectItem value="describe_first">Describe first</SelectItem>
                <SelectItem value="blank_first">Blank first</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Shapes the default activation path on new project creation surfaces without changing the canonical blueprint contract.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations and Governance</CardTitle>
          <CardDescription>
            Gateway posture, audit visibility, and workspace plan all shape how this project can connect outward without leaking configuration into every individual agent page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {integrationItems.map((item) => (
            <div key={item.label} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {item.label === 'Gateway posture' ? <WalletCards className="h-3.5 w-3.5" /> : item.label === 'Audit visibility' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {item.label}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{item.value}</div>
              <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <PlatformGuaranteesCard context="create-agent" compact />

      <Card className="border-destructive/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Archive old projects to remove them from the active workspace surface without deleting historical data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Archived projects stay in the database but disappear from the active project registry.
          </div>
          <Button
            variant="destructive"
            onClick={archiveProject}
            disabled={isArchiving}
          >
            <Archive className="mr-2 h-4 w-4" />
            {isArchiving ? 'Archiving...' : 'Archive project'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
