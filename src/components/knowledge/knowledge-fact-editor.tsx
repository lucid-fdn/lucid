'use client'

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type { KnowledgeFactItem, KnowledgeManagerScope } from '@/features/knowledge-manager/types'

export function KnowledgeFactEditor({
  orgId,
  scopes,
  initialFact,
  initialSubject,
  initialTruth,
  onSaved,
}: {
  orgId: string
  scopes: KnowledgeManagerScope[]
  initialFact?: KnowledgeFactItem | null
  initialSubject?: string
  initialTruth?: string
  onSaved: (query?: string) => void
}) {
  const [subject, setSubject] = useState(initialFact?.subject ?? initialSubject ?? '')
  const [truth, setTruth] = useState(initialFact?.truth ?? initialTruth ?? '')
  const [scopeKey, setScopeKey] = useState(scopeToKey(initialFact?.scope ?? scopes[0] ?? { type: 'workspace', orgId, label: 'Workspace' }))
  const [busy, setBusy] = useState(false)
  const selectedScope = scopes.find((scope) => scopeToKey(scope) === scopeKey) ?? scopes[0]

  async function save() {
    if (!subject.trim() || !truth.trim() || !selectedScope) return
    setBusy(true)
    try {
      const editing = Boolean(initialFact)
      const response = await fetch(editing ? `/api/knowledge/facts/${initialFact!.id}` : '/api/knowledge/facts', {
        method: editing ? 'PATCH' : 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: orgId,
          storage_type: initialFact?.storageType,
          scope_type: selectedScope.type,
          project_id: 'projectId' in selectedScope ? selectedScope.projectId ?? null : null,
          team_id: selectedScope.type === 'team' ? selectedScope.teamId : null,
          assistant_id: selectedScope.type === 'agent' ? selectedScope.assistantId : null,
          subject: subject.trim(),
          truth: truth.trim(),
          trust_level: 'operator_approved',
        }),
      })
      if (!response.ok) throw new Error('Failed to save fact')
      const body = await response.json().catch(() => null)
      setSubject('')
      setTruth('')
      onSaved(body?.recall_suggestion?.query)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="grid gap-3">
        <div>
          <Label htmlFor="knowledge-fact-scope">Scope</Label>
          <select
            id="knowledge-fact-scope"
            value={scopeKey}
            onChange={(event) => setScopeKey(event.target.value)}
            disabled={Boolean(initialFact)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {scopes.map((scope) => (
              <option key={scopeToKey(scope)} value={scopeToKey(scope)} disabled={scope.type === 'agent'}>
                {scopeLabel(scope)}{scope.type === 'agent' ? ' (assistant memory corrections soon)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="knowledge-fact-subject">Fact title</Label>
          <Input
            id="knowledge-fact-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Refund approvals"
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="knowledge-fact-truth">What should agents know?</Label>
          <Textarea
            id="knowledge-fact-truth"
            value={truth}
            onChange={(event) => setTruth(event.target.value)}
            placeholder="Refunds above $500 require manager approval."
            className="mt-2 min-h-28"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Agents can use this, but answers show stronger confidence when evidence is attached.
          </p>
          <Button onClick={() => { void save() }} disabled={busy || !subject.trim() || !truth.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}
            {initialFact ? 'Update fact' : 'Save fact'}
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
