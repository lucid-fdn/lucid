'use client'

import { useState } from 'react'
import { Loader2, Save, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type { KnowledgeManagerScope, KnowledgeSourceItem } from '@/features/knowledge-manager/types'

export function KnowledgeSourceEditor({
  orgId,
  scopes,
  initialSource,
  initialLabel,
  initialUrl,
  onSaved,
}: {
  orgId: string
  scopes: KnowledgeManagerScope[]
  initialSource?: KnowledgeSourceItem | null
  initialLabel?: string
  initialUrl?: string
  onSaved: () => void
}) {
  const [label, setLabel] = useState(initialSource?.label ?? initialLabel ?? '')
  const [url, setUrl] = useState(initialUrl ?? '')
  const [type, setType] = useState(initialSource?.type ?? 'url')
  const [trustLevel, setTrustLevel] = useState(initialSource?.trustLabel === 'Approved' ? 'operator_approved' : 'observed')
  const [visibility, setVisibility] = useState(initialSource ? visibilityValue(initialSource.visibility) : '')
  const [federationPolicy, setFederationPolicy] = useState(initialSource?.federationPolicy ?? 'source_scoped')
  const [retentionPolicy, setRetentionPolicy] = useState(initialSource?.retentionPolicy ?? 'standard')
  const [refreshPolicy, setRefreshPolicy] = useState(initialSource?.refreshPolicy ?? defaultRefreshPolicy(type))
  const [retrievalEnabled, setRetrievalEnabled] = useState(initialSource?.retrievalEnabled ?? true)
  const [scopeKey, setScopeKey] = useState(scopeToKey(initialSource?.scope ?? scopes[0] ?? { type: 'workspace', orgId, label: 'Workspace' }))
  const [busy, setBusy] = useState(false)
  const selectedScope = scopes.find((scope) => scopeToKey(scope) === scopeKey) ?? scopes[0]

  async function save() {
    if (!label.trim() || !selectedScope) return
    const selectedVisibility = visibility || defaultVisibility(selectedScope)
    setBusy(true)
    try {
      const editing = Boolean(initialSource)
      const response = await fetch(editing ? `/api/knowledge/sources/${initialSource!.id}` : '/api/knowledge/sources', {
        method: editing ? 'PATCH' : 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify(editing ? {
          org_id: orgId,
          label: label.trim(),
          trust_level: trustLevel,
          visibility: selectedVisibility,
          federation_policy: federationPolicy,
          retention_policy: retentionPolicy,
          refresh_policy: refreshPolicy,
          status: 'active',
          include_in_retrieval: retrievalEnabled,
        } : {
          org_id: orgId,
          scope_type: selectedScope.type,
          project_id: 'projectId' in selectedScope ? selectedScope.projectId ?? null : null,
          team_id: selectedScope.type === 'team' ? selectedScope.teamId : null,
          assistant_id: selectedScope.type === 'agent' ? selectedScope.assistantId : null,
          type,
          label: label.trim(),
          url: url.trim() || null,
          visibility: selectedVisibility,
          trust_level: trustLevel,
          federation_policy: selectedScope.type === 'workspace' ? 'org_federated' : 'source_scoped',
          retention_policy: 'standard',
          refresh_policy: refreshPolicy,
        }),
      })
      if (!response.ok) throw new Error('Failed to save source')
      setLabel('')
      setUrl('')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="grid gap-3">
        <div>
          <Label htmlFor="knowledge-source-scope">Scope</Label>
          <select
            id="knowledge-source-scope"
            value={scopeKey}
            onChange={(event) => setScopeKey(event.target.value)}
            disabled={Boolean(initialSource)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {scopes.map((scope) => (
              <option key={scopeToKey(scope)} value={scopeToKey(scope)}>{scopeLabel(scope)}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="knowledge-source-type">Type</Label>
            <select
              id="knowledge-source-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              disabled={Boolean(initialSource)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {['url', 'file', 'repo', 'manual', 'channel', 'run', 'agent_ops', 'engine_home'].map((item) => (
                <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="knowledge-source-trust">Trust</Label>
            <select
              id="knowledge-source-trust"
              value={trustLevel}
              onChange={(event) => setTrustLevel(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="observed">Observed</option>
              <option value="operator_approved">Approved</option>
              <option value="system">System</option>
              <option value="l2_verified">Verified</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="knowledge-source-visibility">Visibility</Label>
            <select
              id="knowledge-source-visibility"
              value={visibility || defaultVisibility(selectedScope)}
              onChange={(event) => setVisibility(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="private">Private</option>
              <option value="team">Team</option>
              <option value="project">Project</option>
              <option value="org">Workspace</option>
              <option value="federated">Federated</option>
            </select>
          </div>
          <div>
            <Label htmlFor="knowledge-source-federation">Federation</Label>
            <select
              id="knowledge-source-federation"
              value={federationPolicy}
              onChange={(event) => setFederationPolicy(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="isolated">Isolated</option>
              <option value="source_scoped">Source scoped</option>
              <option value="org_federated">Workspace federated</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="knowledge-source-retention">Retention</Label>
            <select
              id="knowledge-source-retention"
              value={retentionPolicy}
              onChange={(event) => setRetentionPolicy(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="ephemeral">Ephemeral</option>
              <option value="standard">Standard</option>
              <option value="audit">Audit</option>
              <option value="legal_hold">Legal hold</option>
            </select>
          </div>
          <div>
            <Label htmlFor="knowledge-source-refresh">Refresh</Label>
            <select
              id="knowledge-source-refresh"
              value={refreshPolicy}
              onChange={(event) => setRefreshPolicy(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="manual">Manual</option>
              <option value="on_change">On change</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="knowledge-source-label">Source name</Label>
          <Input
            id="knowledge-source-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Support handbook"
            className="mt-2"
          />
        </div>
        {!initialSource && type === 'url' ? (
          <div>
            <Label htmlFor="knowledge-source-url">URL</Label>
            <Input
              id="knowledge-source-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.example.com/support"
              className="mt-2"
            />
          </div>
        ) : null}
        <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3 text-sm">
          <input
            type="checkbox"
            checked={retrievalEnabled}
            onChange={(event) => setRetrievalEnabled(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-foreground">Allow agents to retrieve this source</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Turn this off for quarantine, legal review, stale imports, or source records that should only preserve provenance.
            </span>
          </span>
        </label>
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Retrieval policy preview
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {policyPreview({ selectedScope, visibility: visibility || defaultVisibility(selectedScope), federationPolicy, retentionPolicy, refreshPolicy, retrievalEnabled })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Sources control trust, refresh, retrieval eligibility, and provenance.</p>
          <Button onClick={() => { void save() }} disabled={busy || !label.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            {initialSource ? 'Update source' : 'Create source'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function scopeToKey(scope: KnowledgeManagerScope): string {
  if (scope.type === 'workspace') return 'workspace'
  if (scope.type === 'project') return `project:${scope.projectId}`
  if (scope.type === 'team') return `team:${scope.teamId}`
  return `agent:${scope.assistantId}`
}

function scopeLabel(scope: KnowledgeManagerScope): string {
  if (scope.type === 'workspace') return 'Workspace'
  return `${scope.label} · ${scope.type}`
}

function defaultVisibility(scope: KnowledgeManagerScope | undefined): string {
  if (!scope || scope.type === 'workspace') return 'org'
  if (scope.type === 'agent') return 'private'
  return scope.type
}

function defaultRefreshPolicy(sourceType: string): string {
  return sourceType === 'url' || sourceType === 'repo' || sourceType === 'file' ? 'on_change' : 'manual'
}

function visibilityValue(label: string): string {
  const normalized = label.toLowerCase().replace(/\s+/g, '_')
  if (['private', 'team', 'project', 'org', 'federated'].includes(normalized)) return normalized
  if (normalized === 'workspace') return 'org'
  return 'org'
}

function policyPreview(input: {
  selectedScope: KnowledgeManagerScope | undefined
  visibility: string
  federationPolicy: string
  retentionPolicy: string
  refreshPolicy: string
  retrievalEnabled: boolean
}): string {
  const scope = input.selectedScope ? scopeLabel(input.selectedScope) : 'selected scope'
  const retrieval = input.retrievalEnabled ? 'will be available to retrieval' : 'will be stored for provenance only'
  return `${scope}: ${retrieval}; visibility ${input.visibility}; ${input.federationPolicy.replace(/_/g, ' ')}; ${input.retentionPolicy.replace(/_/g, ' ')} retention; ${input.refreshPolicy.replace(/_/g, ' ')} refresh.`
}
