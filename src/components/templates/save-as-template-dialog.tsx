'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import type { TemplateParam, TemplateSpec } from '@contracts/template'

const CATEGORIES = [
  'general',
  'sales',
  'content',
  'support',
  'marketing',
  'finance',
  'operations',
] as const

interface SaveAsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  agentName: string
  agentDescription?: string
  systemPrompt: string
  plugins?: string[]
  skills?: string[]
  memoryEnabled?: boolean
  memoryStrategy?: 'auto' | 'aggressive' | 'conservative' | 'off'
  soulContent?: string
  modelHint?: string
  approvalRequiredTools?: string[]
  templateSpec?: TemplateSpec
  templateName?: string
  templateDescription?: string
  templateCategory?: string
}

const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g

function humanizeParamKey(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferTemplateParams(values: Array<string | undefined>): TemplateParam[] {
  const keys = new Set<string>()

  for (const value of values) {
    for (const match of value?.matchAll(PLACEHOLDER_RE) ?? []) {
      keys.add(match[1])
    }
  }

  return Array.from(keys).sort().map((key) => ({
    key,
    label: humanizeParamKey(key),
    type: 'text',
    required: true,
    hint: '',
  }))
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  orgId,
  agentName,
  agentDescription = '',
  systemPrompt,
  plugins = [],
  skills = [],
  memoryEnabled = true,
  memoryStrategy = 'auto',
  soulContent,
  modelHint,
  approvalRequiredTools = [],
  templateSpec,
  templateName,
  templateDescription,
  templateCategory,
}: SaveAsTemplateDialogProps) {
  const effectiveTemplateName = templateName ?? `${agentName} Template`
  const effectiveTemplateDescription = templateDescription ?? agentDescription
  const effectiveTemplateCategory = templateCategory ?? 'general'
  const effectiveSpec = useMemo<TemplateSpec>(() => (
    templateSpec ?? {
      kind: 'agent' as const,
      system_prompt: systemPrompt,
      soul_content: soulContent || undefined,
      model_hint: modelHint || undefined,
      plugins: plugins.length > 0 ? plugins : undefined,
      skills: skills.length > 0 ? skills : undefined,
      memory_enabled: memoryEnabled,
      memory_strategy: memoryStrategy,
      approval_required_tools: approvalRequiredTools.length > 0 ? approvalRequiredTools : undefined,
    }
  ), [
    approvalRequiredTools,
    memoryEnabled,
    memoryStrategy,
    modelHint,
    plugins,
    skills,
    soulContent,
    systemPrompt,
    templateSpec,
  ])
  const inferredParams = useMemo(
    () => inferTemplateParams([
      JSON.stringify(effectiveSpec),
      soulContent,
      systemPrompt,
    ]),
    [effectiveSpec, soulContent, systemPrompt],
  )
  const [name, setName] = useState(effectiveTemplateName)
  const [description, setDescription] = useState(effectiveTemplateDescription)
  const [category, setCategory] = useState<string>(effectiveTemplateCategory)
  const [tagsInput, setTagsInput] = useState('')
  const [params, setParams] = useState<TemplateParam[]>(inferredParams)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const previousOpenRef = useRef(open)

  useEffect(() => {
    const wasOpen = previousOpenRef.current
    const toggledOpenState = wasOpen !== open

    if (toggledOpenState) {
      setName(effectiveTemplateName)
      setDescription(effectiveTemplateDescription)
      setCategory(effectiveTemplateCategory)
      setTagsInput('')
      setParams(inferredParams)
      setSaveError(null)
      setSaved(false)
      setIsSaving(false)
    }

    previousOpenRef.current = open
  }, [effectiveTemplateCategory, effectiveTemplateDescription, effectiveTemplateName, inferredParams, open])

  function updateParam(index: number, patch: Partial<TemplateParam>): void {
    setParams((current) => current.map((param, paramIndex) => (
      paramIndex === index ? { ...param, ...patch } : param
    )))
  }

  function removeParam(index: number): void {
    setParams((current) => current.filter((_, paramIndex) => paramIndex !== index))
  }

  function addParam(): void {
    setParams((current) => [
      ...current,
      {
        key: `PARAM_${current.length + 1}`,
        label: `Parameter ${current.length + 1}`,
        type: 'text',
        required: true,
        hint: '',
      },
    ])
  }

  async function ensureCSRFToken(): Promise<string | null> {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) {
      const message = 'Template name is required'
      setSaveError(message)
      toast.error(message)
      return
    }
    if (effectiveSpec.kind === 'agent' && !effectiveSpec.system_prompt.trim()) {
      const message = 'Agent system prompt is required to save as template'
      setSaveError(message)
      toast.error(message)
      return
    }

    setSaveError(null)
    setIsSaving(true)

    try {
      const csrfToken = await ensureCSRFToken()
      const tags = Array.from(
        new Set(
          tagsInput
            .split(',')
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      )

      const response = await fetch(`/api/orgs/${orgId}/templates`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          tags,
          params: params.map((param) => ({
            ...param,
            hint: param.hint?.trim() || undefined,
            default: param.default?.trim() || undefined,
            placeholder: param.placeholder?.trim() || undefined,
            options: param.options?.filter(Boolean),
          })),
          spec: effectiveSpec,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to save template' }))
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save template')
      }

      setSaved(true)
      toast.success('Template saved as draft')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save template'
      setSaveError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Save this agent configuration as a reusable draft template for your workspace.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="size-10 text-primary" />
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium text-foreground">Template saved as draft</p>
              <p className="text-sm text-muted-foreground">
                It is now available in the template catalog for your org.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Agent Template"
                maxLength={100}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="template-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="template-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="template-tags">Tags</Label>
              <Input
                id="template-tags"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="crm, outreach, automation"
              />
              <p className="text-sm text-muted-foreground">Use comma-separated tags.</p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">Spec preview</p>
              <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              <p>Kind: {effectiveSpec.kind}</p>
              {'model_hint' in effectiveSpec && effectiveSpec.model_hint ? <p>Model: {effectiveSpec.model_hint}</p> : null}
              {'plugins' in effectiveSpec && effectiveSpec.plugins?.length ? <p>Plugins: {effectiveSpec.plugins.slice(0, 3).join(', ')}</p> : null}
              {'skills' in effectiveSpec && effectiveSpec.skills?.length ? <p>Skills: {effectiveSpec.skills.slice(0, 3).join(', ')}</p> : null}
              {'memory_enabled' in effectiveSpec ? <p>Memory: {effectiveSpec.memory_enabled ? effectiveSpec.memory_strategy : 'off'}</p> : null}
              {effectiveSpec.kind === 'agent' ? (
                <p className="truncate">Prompt: {effectiveSpec.system_prompt}</p>
              ) : (
                <>
                  <p>Members: {effectiveSpec.members.length}</p>
                  <p>Edges: {effectiveSpec.edges.length}</p>
                </>
              )}
            </div>
          </div>

            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Template parameters</p>
                  <p className="text-sm text-muted-foreground">
                    Placeholders like <code>{'{{COMPANY_NAME}}'}</code> can be edited before saving.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addParam}>
                  <Plus data-icon="inline-start" />
                  Add param
                </Button>
              </div>

              {params.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No placeholders detected. You can still add parameters manually.
                </p>
              ) : (
                <div className="space-y-3">
                  {params.map((param, index) => (
                    <div key={`${param.key}-${index}`} className="rounded-md border bg-muted/20 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label>Key</Label>
                          <Input
                            value={param.key}
                            onChange={(event) => updateParam(index, {
                              key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
                            })}
                            maxLength={64}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Label</Label>
                          <Input
                            value={param.label}
                            onChange={(event) => updateParam(index, { label: event.target.value })}
                            maxLength={100}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Type</Label>
                          <Select
                            value={param.type}
                            onValueChange={(value) => updateParam(index, { type: value as TemplateParam['type'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="url">URL</SelectItem>
                                <SelectItem value="secret">Secret</SelectItem>
                                <SelectItem value="select">Select</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Default</Label>
                          <Input
                            value={param.default ?? ''}
                            onChange={(event) => updateParam(index, { default: event.target.value })}
                            maxLength={1000}
                          />
                        </div>
                        <div className="md:col-span-2 flex flex-col gap-2">
                          <Label>Hint</Label>
                          <Input
                            value={param.hint ?? ''}
                            onChange={(event) => updateParam(index, { hint: event.target.value })}
                            maxLength={300}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(event) => updateParam(index, { required: event.target.checked })}
                          />
                          Required
                        </label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeParam(index)}>
                          <Trash2 data-icon="inline-start" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {saveError ? (
              <p className="text-sm text-destructive">{saveError}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {saved ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Saving
                  </>
                ) : (
                  'Save template'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
