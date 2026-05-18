'use client'

/**
 * Workflow Template Editor.
 *
 * JSON editor for workflow template specs with live Zod validation against
 * `dagSpecSchema` (contracts/dag.ts). Uses a plain textarea rather than
 * Monaco to keep the bundle thin — the validation surface is what matters,
 * not syntax highlighting.
 *
 * Save paths:
 *   - Create: POST /api/dags/templates                (body-bound orgId)
 *   - Update: PUT  /api/dags/templates/[id]           (body-bound orgId)
 */

import { useCallback, useMemo, useState } from 'react'
import { dagSpecSchema, type DagSpec } from '@contracts/dag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import type { z } from 'zod'

export interface TemplateEditorInitial {
  id?: string
  slug: string
  name: string
  description?: string | null
  spec: DagSpec
}

export interface TemplateEditorProps {
  orgId: string
  initial?: TemplateEditorInitial
  onSaved?: (templateId: string) => void
  onCancel?: () => void
}

interface ValidationState {
  ok: boolean
  parsed?: DagSpec
  errors: Array<{ path: string; message: string }>
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? null
}

function zodIssuesToErrors(issues: z.ZodIssue[]): ValidationState['errors'] {
  return issues.map((i) => ({
    path: i.path.length > 0 ? i.path.join('.') : '(root)',
    message: i.message,
  }))
}

export function validateSpecText(text: string): ValidationState {
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: '(json)',
          message: err instanceof Error ? err.message : 'Invalid JSON',
        },
      ],
    }
  }

  const result = dagSpecSchema.safeParse(parsedJson)
  if (!result.success) {
    return { ok: false, errors: zodIssuesToErrors(result.error.issues) }
  }

  return { ok: true, parsed: result.data, errors: [] }
}

const EMPTY_SPEC: DagSpec = {
  nodes: [
    {
      node_key: 'root',
      node_type: 'leaf',
      step_type: 'inbound',
    },
  ],
  edges: [],
}

export function DagTemplateEditor({
  orgId,
  initial,
  onSaved,
  onCancel,
}: TemplateEditorProps) {
  const isEdit = Boolean(initial?.id)

  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [specText, setSpecText] = useState(() =>
    JSON.stringify(initial?.spec ?? EMPTY_SPEC, null, 2),
  )
  const [saving, setSaving] = useState(false)

  const validation = useMemo<ValidationState>(
    () => validateSpecText(specText),
    [specText],
  )

  const handleSave = useCallback(async () => {
    if (!validation.ok || !validation.parsed) {
      toast.error('Fix validation errors before saving')
      return
    }
    if (!slug.trim() || !name.trim()) {
      toast.error('Slug and name are required')
      return
    }

    setSaving(true)
    try {
      const csrf = getCsrfToken()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      }

      const baseBody = {
        orgId,
        name: name.trim(),
        description: description.trim() || null,
        spec: validation.parsed,
      }

      let res: Response
      if (isEdit && initial?.id) {
        // PUT: cannot rename slug — intentional (slug is immutable)
        res = await fetch(`/api/dags/templates/${initial.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(baseBody),
        })
      } else {
        res = await fetch('/api/dags/templates', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...baseBody, slug: slug.trim() }),
        })
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const message =
          (typeof payload.error === 'string' && payload.error) ||
          `Failed with status ${res.status}`
        toast.error(message)
        return
      }

      const payload = (await res.json()) as { template?: { id: string } }
      if (!payload.template?.id) {
        toast.error('Save succeeded but server returned no template id')
        return
      }

      toast.success(isEdit ? 'Template updated' : 'Template created')
      onSaved?.(payload.template.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [validation, slug, name, description, orgId, isEdit, initial?.id, onSaved])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="dag-template-slug">Slug</Label>
          <Input
            id="dag-template-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={isEdit}
            placeholder="complaint-handler"
            autoComplete="off"
          />
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              Slug is immutable after creation.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dag-template-name">Name</Label>
          <Input
            id="dag-template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Complaint Handler"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="dag-template-description">Description</Label>
        <Textarea
          id="dag-template-description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What does this template do?"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="dag-template-spec">DagSpec (JSON)</Label>
          <div className="flex items-center gap-1.5 text-xs">
            {validation.ok ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <Check className="h-3 w-3" />
                Valid
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                {validation.errors.length} issue
                {validation.errors.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        <Textarea
          id="dag-template-spec"
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          spellCheck={false}
          rows={20}
          className="font-mono text-xs"
        />
        {!validation.ok && (
          <ul className="mt-1 space-y-0.5 text-xs text-amber-500">
            {validation.errors.slice(0, 10).map((err, idx) => (
              <li key={`${err.path}-${idx}`}>
                <span className="font-mono">{err.path}</span>: {err.message}
              </li>
            ))}
            {validation.errors.length > 10 && (
              <li className="text-muted-foreground">
                …and {validation.errors.length - 10} more
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !validation.ok}
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Saving…
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Create template'
          )}
        </Button>
      </div>
    </div>
  )
}
