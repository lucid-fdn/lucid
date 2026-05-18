'use client'

import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type { KnowledgeManagerScope } from '@/features/knowledge-manager/types'

export function KnowledgeDocumentUploader({
  orgId,
  scopes,
  initialTitle,
  initialContent,
  onUploaded,
}: {
  orgId: string
  scopes: KnowledgeManagerScope[]
  initialTitle?: string
  initialContent?: string
  onUploaded: () => void
}) {
  const [title, setTitle] = useState(initialTitle ?? '')
  const [content, setContent] = useState(initialContent ?? '')
  const documentScopes = scopes.filter((scope) => scope.type === 'workspace' || scope.type === 'project')
  const [scopeKey, setScopeKey] = useState(scopeToKey(documentScopes[0] ?? { type: 'workspace', orgId, label: 'Workspace' }))
  const [busy, setBusy] = useState(false)
  const selectedScope = documentScopes.find((scope) => scopeToKey(scope) === scopeKey)

  async function upload() {
    if (!title.trim() || !content.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/knowledge/documents', {
        method: 'POST',
        headers: buildClientMutationHeaders(undefined, { includeIdempotencyKey: true }),
        body: JSON.stringify({
          org_id: orgId,
          project_id: selectedScope?.type === 'project' ? selectedScope.projectId : null,
          title: title.trim(),
          content,
          source_type: 'paste',
          trust_level: 'operator_approved',
          visibility: selectedScope?.type === 'project' ? 'project' : 'org',
          retention_policy: 'standard',
        }),
      })
      if (!response.ok) throw new Error('Upload failed')
      setTitle('')
      setContent('')
      onUploaded()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="grid gap-3">
        <div>
          <Label htmlFor="knowledge-document-scope">Scope</Label>
          <select
            id="knowledge-document-scope"
            value={scopeKey}
            onChange={(event) => setScopeKey(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {documentScopes.map((scope) => (
              <option key={scopeToKey(scope)} value={scopeToKey(scope)}>{scopeLabel(scope)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Documents currently index at workspace or project scope. Use facts for team and agent-specific guidance.</p>
        </div>
        <div>
          <Label htmlFor="knowledge-document-title">Document title</Label>
          <Input
            id="knowledge-document-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Support FAQ"
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="knowledge-document-content">Document content</Label>
          <Textarea
            id="knowledge-document-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste docs, FAQs, playbooks, or policies here..."
            className="mt-2 min-h-36"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</p>
          <Button onClick={() => { void upload() }} disabled={busy || !title.trim() || !content.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Upload document
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
